import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import type { DB } from './db.js'

export interface AppOptions {
  db: DB
  jwtSecret: string
  // code -> openid；失败时抛错
  wxLogin: (code: string) => Promise<string>
  logger?: boolean
  // 仅开发时打开，供浏览器里调试
  cors?: boolean
}

const like = (q: string) => '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%'
const clamp = (v: unknown, def: number, max: number) => Math.min(max, Math.max(1, Number(v) || def))
const SENT = `s.id, s.article_id AS article, a.title, s.classical, s.modern`

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { db } = opts
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true })
  await app.register(jwt, { secret: opts.jwtSecret, sign: { expiresIn: '30d' } })
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' })

  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    try { await req.jwtVerify() } catch { return reply.code(401).send({ error: '登录已失效' }) }
  }
  const uid = (req: FastifyRequest) => (req.user as { uid: number }).uid

  if (opts.cors) {
    app.addHook('onRequest', async (req, reply) => {
      reply.header('access-control-allow-origin', '*').header('access-control-allow-headers', 'authorization,content-type').header('access-control-allow-methods', 'GET,POST,PUT,DELETE')
      if (req.method === 'OPTIONS') return reply.code(204).send()
    })
  }

  app.get('/health', async () => ({ ok: true }))

  app.post('/auth/wx-login', async (req, reply) => {
    const code = (req.body as any)?.code
    if (typeof code !== 'string' || !code) return reply.code(400).send({ error: '缺少 code' })
    let openid: string
    try { openid = await opts.wxLogin(code) } catch (e) {
      req.log.warn(e)
      return reply.code(401).send({ error: '微信登录失败' })
    }
    const { rows } = await db.query<{ id: number }>(
      'INSERT INTO users (openid) VALUES ($1) ON CONFLICT (openid) DO UPDATE SET openid = EXCLUDED.openid RETURNING id', [openid])
    return { token: app.jwt.sign({ uid: rows[0].id }) }
  })

  app.get('/subjects', async () => {
    const s = await db.query('SELECT id, name, online FROM subjects ORDER BY sort')
    const m = await db.query('SELECT id, subject_id, name, glyph, intro, online FROM modules ORDER BY sort')
    return { subjects: s.rows.map((x: any) => ({ ...x, modules: m.rows.filter((y: any) => y.subject_id === x.id).map(({ subject_id, ...y }: any) => y) })) }
  })

  // 文言文模块的四组结果
  async function searchWenyan(q: string, limit: number) {
    const p = like(q)
    const words = await db.query(
      `SELECT e.word, e.count, (SELECT string_agg(meaning, '；' ORDER BY idx) FROM wy_senses WHERE word = e.word) AS summary,
              (SELECT count(*)::int FROM wy_senses WHERE word = e.word) AS senses
         FROM wy_entries e WHERE e.word LIKE $1 OR (char_length($2) <= 2 AND position(e.word in $2) > 0) ORDER BY e.sort`, [p, q])
    const modern = await db.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (se.id) se.id AS sense_id, se.word, se.meaning, se.pos, x.gloss, x.snippet, x.snippet_offset, x.sentence_offset AS "offset", e.sort, ${SENT}
           FROM wy_senses se JOIN wy_entries e ON e.word = se.word
           JOIN wy_examples x ON x.sense_id = se.id JOIN wy_sentences s ON s.id = x.sentence_id JOIN wy_articles a ON a.id = s.article_id
          WHERE se.meaning LIKE $1 OR x.gloss LIKE $1
          ORDER BY se.id, (x.gloss LIKE $1) DESC, x.idx) t ORDER BY sort, sense_id`, [p])
    const classical = await db.query(
      `SELECT ${SENT}, count(*) OVER()::int AS total FROM wy_sentences s JOIN wy_articles a ON a.id = s.article_id
        WHERE s.classical LIKE $1 ORDER BY s.article_id, s.idx LIMIT $2`, [p, limit])
    const translation = await db.query(
      `SELECT ${SENT}, count(*) OVER()::int AS total FROM wy_sentences s JOIN wy_articles a ON a.id = s.article_id
        WHERE s.modern LIKE $1 AND s.classical NOT LIKE $1 ORDER BY s.article_id, s.idx LIMIT $2`, [p, limit])
    const titles = await db.query('SELECT id, title, source FROM wy_articles WHERE title LIKE $1 ORDER BY id', [p])
    const strip = (rows: any[]) => rows.map(({ total, ...r }) => r)
    const groups = {
      words: words.rows,
      modern: { total: modern.rows.length, items: modern.rows.slice(0, limit).map(({ sort, ...r }: any) => r) },
      classical: { total: classical.rows[0]?.total ?? 0, items: strip(classical.rows) },
      translation: { total: translation.rows[0]?.total ?? 0, items: strip(translation.rows) },
      articles: titles.rows,
    }
    return { id: 'wenyan', name: '文言文', total: groups.words.length + groups.modern.total + groups.classical.total + groups.translation.total + groups.articles.length, groups }
  }

  app.get('/search', async (req, reply) => {
    const { q, subject = 'yuwen', module, limit } = req.query as Record<string, string>
    const kw = (q || '').trim().slice(0, 30)
    if (!kw) return reply.code(400).send({ error: '请输入要查的字词' })
    const mods = await db.query('SELECT id, name, online FROM modules WHERE subject_id = $1 ORDER BY sort', [subject])
    const results = []
    if ((!module || module === 'wenyan') && mods.rows.some((m: any) => m.id === 'wenyan' && m.online)) results.push(await searchWenyan(kw, clamp(limit, 5, 50)))
    return { q: kw, modules: mods.rows, results }
  })

  app.get('/wenyan/hot', async () => ({ words: (await db.query('SELECT word, count FROM wy_entries ORDER BY sort LIMIT 12')).rows }))

  app.get('/wenyan/entries/:word', async (req, reply) => {
    const { word } = req.params as { word: string }
    const e = await db.query('SELECT word, count FROM wy_entries WHERE word = $1', [word])
    if (!e.rows.length) return reply.code(404).send({ error: '这个字还没有收录' })
    const senses = await db.query('SELECT id, meaning, pos, hint FROM wy_senses WHERE word = $1 ORDER BY idx', [word])
    const ex = await db.query(
      `SELECT x.sense_id, x.gloss, x.snippet, x.snippet_offset, x.sentence_offset, ${SENT}
         FROM wy_examples x JOIN wy_sentences s ON s.id = x.sentence_id JOIN wy_articles a ON a.id = s.article_id
        WHERE x.word = $1 ORDER BY x.sense_id, x.idx`, [word])
    return { ...e.rows[0], length: [...word].length, senses: senses.rows.map((s: any) => ({ ...s, examples: ex.rows.filter((x: any) => x.sense_id === s.id).map(({ sense_id, ...x }: any) => x) })) }
  })

  app.get('/wenyan/articles', async () => ({ articles: (await db.query('SELECT id, title, source, mark_count FROM wy_articles ORDER BY id')).rows }))

  app.get('/wenyan/articles/:id', async (req, reply) => {
    const id = Number((req.params as any).id)
    const a = await db.query('SELECT id, title, source, notes FROM wy_articles WHERE id = $1', [id])
    if (!a.rows.length) return reply.code(404).send({ error: '没有这一篇' })
    const s = await db.query('SELECT id, classical, modern, marks FROM wy_sentences WHERE article_id = $1 ORDER BY idx', [id])
    const n = await db.query('SELECT (SELECT max(id) FROM wy_articles WHERE id < $1) AS prev, (SELECT min(id) FROM wy_articles WHERE id > $1) AS next', [id])
    return { ...a.rows[0], ...n.rows[0], sentences: s.rows }
  })

  app.get('/wenyan/topics/:type', async (req, reply) => {
    const { type } = req.params as { type: string }
    if (type === 'modern') {
      const r = await db.query(`SELECT modern, json_agg(json_build_object('word', word, 'sense', sense)) AS classical FROM wy_modern GROUP BY modern, sort ORDER BY sort`)
      return { type, items: r.rows }
    }
    const r = await db.query('SELECT items FROM wy_topics WHERE type = $1', [type])
    if (!r.rows.length) return reply.code(404).send({ error: '没有这个专题' })
    const items = r.rows[0].items as any[]
    const ids = [...new Set(items.flatMap((i) => (i.examples ? i.examples.map((x: any) => x.sentence) : [i.sentence])))]
    const sents = await db.query(`SELECT ${SENT} FROM wy_sentences s JOIN wy_articles a ON a.id = s.article_id WHERE s.id = ANY($1)`, [ids])
    return { type, items, sentences: Object.fromEntries(sents.rows.map((s: any) => [s.id, s])) }
  })

  // ---- 以下需要登录 ----
  app.get('/me/profile', { preHandler: auth }, async (req) => {
    const u = await db.query('SELECT nickname, avatar, last_subject FROM users WHERE id = $1', [uid(req)])
    const c = await db.query('SELECT (SELECT count(*)::int FROM favorites WHERE user_id = $1) AS favorites, (SELECT count(*)::int FROM search_history WHERE user_id = $1) AS history', [uid(req)])
    return { ...u.rows[0], ...c.rows[0] }
  })

  app.put('/me/profile', { preHandler: auth }, async (req) => {
    const b = (req.body || {}) as Record<string, unknown>
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)
    await db.query('UPDATE users SET nickname = COALESCE($2, nickname), avatar = COALESCE($3, avatar), last_subject = COALESCE($4, last_subject) WHERE id = $1',
      [uid(req), str(b.nickname, 30), str(b.avatar, 500), str(b.lastSubject, 20)])
    return { ok: true }
  })

  app.get('/me/favorites', { preHandler: auth }, async (req) => {
    const words = await db.query(
      `SELECT f.ref AS word, f.created_at, e.count, (SELECT string_agg(meaning, '；' ORDER BY idx) FROM wy_senses WHERE word = e.word) AS summary
         FROM favorites f JOIN wy_entries e ON e.word = f.ref WHERE f.user_id = $1 AND f.kind = 'word' ORDER BY f.id DESC`, [uid(req)])
    const sentences = await db.query(
      `SELECT f.created_at, ${SENT} FROM favorites f JOIN wy_sentences s ON s.id = f.ref JOIN wy_articles a ON a.id = s.article_id
        WHERE f.user_id = $1 AND f.kind = 'sentence' ORDER BY f.id DESC`, [uid(req)])
    return { words: words.rows, sentences: sentences.rows }
  })

  const favBody = (req: FastifyRequest) => {
    const { kind, ref } = (req.body || {}) as Record<string, unknown>
    return (kind === 'word' || kind === 'sentence') && typeof ref === 'string' && ref && ref.length <= 40 ? { kind, ref } : null
  }
  app.post('/me/favorites', { preHandler: auth }, async (req, reply) => {
    const b = favBody(req)
    if (!b) return reply.code(400).send({ error: '参数不对' })
    const ok = await db.query(b.kind === 'word' ? 'SELECT 1 FROM wy_entries WHERE word = $1' : 'SELECT 1 FROM wy_sentences WHERE id = $1', [b.ref])
    if (!ok.rows.length) return reply.code(404).send({ error: '要收藏的内容不存在' })
    await db.query('INSERT INTO favorites (user_id, kind, ref) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [uid(req), b.kind, b.ref])
    return { ok: true }
  })
  app.delete('/me/favorites', { preHandler: auth }, async (req, reply) => {
    const b = favBody(req)
    if (!b) return reply.code(400).send({ error: '参数不对' })
    await db.query('DELETE FROM favorites WHERE user_id = $1 AND kind = $2 AND ref = $3', [uid(req), b.kind, b.ref])
    return { ok: true }
  })
  app.get('/me/favorites/check', { preHandler: auth }, async (req) => {
    const { kind, ref } = req.query as Record<string, string>
    const r = await db.query('SELECT 1 FROM favorites WHERE user_id = $1 AND kind = $2 AND ref = $3', [uid(req), kind, ref])
    return { favorited: r.rows.length > 0 }
  })

  app.get('/me/history', { preHandler: auth }, async (req) => {
    const limit = clamp((req.query as any).limit, 100, 100)
    return { items: (await db.query('SELECT id, q, created_at FROM search_history WHERE user_id = $1 ORDER BY id DESC LIMIT $2', [uid(req), limit])).rows }
  })
  app.post('/me/history', { preHandler: auth }, async (req, reply) => {
    const q = String((req.body as any)?.q || '').trim().slice(0, 30)
    if (!q) return reply.code(400).send({ error: '参数不对' })
    await db.query('DELETE FROM search_history WHERE user_id = $1 AND q = $2', [uid(req), q])
    await db.query('INSERT INTO search_history (user_id, q) VALUES ($1, $2)', [uid(req), q])
    await db.query('DELETE FROM search_history WHERE user_id = $1 AND id NOT IN (SELECT id FROM search_history WHERE user_id = $1 ORDER BY id DESC LIMIT 100)', [uid(req)])
    return { ok: true }
  })
  app.delete('/me/history', { preHandler: auth }, async (req) => {
    const id = Number((req.query as any).id)
    if (id) await db.query('DELETE FROM search_history WHERE user_id = $1 AND id = $2', [uid(req), id])
    else await db.query('DELETE FROM search_history WHERE user_id = $1', [uid(req)])
    return { ok: true }
  })

  app.put('/me/progress', { preHandler: auth }, async (req, reply) => {
    const id = Number((req.body as any)?.articleId)
    const a = await db.query('SELECT id, title FROM wy_articles WHERE id = $1', [id])
    if (!a.rows.length) return reply.code(404).send({ error: '没有这一篇' })
    await db.query('UPDATE users SET last_read = $2 WHERE id = $1', [uid(req), JSON.stringify({ module: 'wenyan', articleId: id, title: a.rows[0].title })])
    return { ok: true }
  })
  app.get('/me/recent', { preHandler: auth }, async (req) => {
    const u = await db.query('SELECT last_read, last_subject FROM users WHERE id = $1', [uid(req)])
    const h = await db.query('SELECT q FROM search_history WHERE user_id = $1 ORDER BY id DESC LIMIT 8', [uid(req)])
    return { lastRead: u.rows[0]?.last_read ?? null, lastSubject: u.rows[0]?.last_subject ?? null, words: h.rows.map((r: any) => r.q) }
  })

  return app
}
