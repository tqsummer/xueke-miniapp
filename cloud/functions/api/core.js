'use strict'
// 与 server/src/app.ts 返回同样结构的接口，内容数据放在内存里，用户数据交给 store。
// store 由 index.js（云数据库）或测试（内存）提供。

const SUBJECTS = [
  { id: 'yuwen', name: '语文', online: true, modules: [
    { id: 'wenyan', name: '文言文', glyph: '文', intro: '100 篇原文对译 · 121 个重点字', online: true },
    { id: 'shici', name: '古诗词', glyph: '诗', intro: '背诵默写', online: false },
    { id: 'yuedu', name: '阅读理解', glyph: '读', intro: '课内与课外', online: false },
    { id: 'mingzhu', name: '名著导读', glyph: '著', intro: '14 本', online: false },
  ] },
  { id: 'shuxue', name: '数学', online: false, modules: [] },
  { id: 'yingyu', name: '英语', online: false, modules: [] },
  { id: 'wuli', name: '物理', online: false, modules: [] },
  { id: 'huaxue', name: '化学', online: false, modules: [] },
]

const fail = (status, error) => ({ status, data: { error } })
const ok = (data) => ({ status: 200, data })
const clamp = (v, def, max) => Math.min(max, Math.max(1, Number(v) || def))

function createApi(d, store, englishApi) {
  // ---- 建索引（冷启动时执行一次）----
  const articles = d.articles.map((a) => ({
    id: a.id, title: a.title, source: a.source, notes: a.notes,
    mark_count: a.sentences.reduce((n, s) => n + s.marks.length, 0),
    sentences: a.sentences.map((s) => ({ id: s.id, classical: s.classical, modern: s.modern, marks: s.marks })),
  }))
  const artById = new Map(articles.map((a) => [a.id, a]))
  const sentById = new Map()
  const sentList = []
  for (const a of articles) for (const s of a.sentences) {
    const row = { id: s.id, article: a.id, title: a.title, classical: s.classical, modern: s.modern }
    sentById.set(s.id, row); sentList.push(row)
  }
  let senseId = 0
  const entries = d.entries.map((e) => ({
    word: e.word, count: e.count,
    summary: e.senses.map((s) => s.meaning).join('；'),
    senses: e.senses.map((s) => ({
      id: ++senseId, meaning: s.meaning, pos: s.pos, hint: s.hint,
      examples: s.examples.map((x) => ({ gloss: x.gloss, snippet: x.snippet, snippet_offset: x.snippet_offset, sentence_offset: x.sentence_offset, ...sentById.get(x.sentence) })),
    })),
  }))
  const entryByWord = new Map(entries.map((e) => [e.word, e]))
  const topics = { tongjia: d.tongjia, huoyong: d.huoyong, gujin: d.gujin }
  const modernTopic = d.modern_to_classical.map((m) => ({ modern: m.modern, classical: m.classical }))

  function searchWenyan(q, limit) {
    const short = [...q].length <= 2
    const words = entries.filter((e) => e.word.includes(q) || (short && q.includes(e.word)))
      .map((e) => ({ word: e.word, count: e.count, summary: e.summary, senses: e.senses.length }))
    const modern = []
    for (const e of entries) for (const s of e.senses) {
      const hit = s.examples.find((x) => x.gloss.includes(q))
      if (!hit && !s.meaning.includes(q)) continue
      const x = hit || s.examples[0]
      modern.push({ sense_id: s.id, word: e.word, meaning: s.meaning, pos: s.pos, gloss: x.gloss, snippet: x.snippet, snippet_offset: x.snippet_offset, offset: x.sentence_offset,
        id: x.id, article: x.article, title: x.title, classical: x.classical, modern: x.modern })
    }
    const classical = sentList.filter((s) => s.classical.includes(q))
    const translation = sentList.filter((s) => s.modern.includes(q) && !s.classical.includes(q))
    const titles = articles.filter((a) => a.title.includes(q)).map((a) => ({ id: a.id, title: a.title, source: a.source }))
    const groups = {
      words,
      modern: { total: modern.length, items: modern.slice(0, limit) },
      classical: { total: classical.length, items: classical.slice(0, limit) },
      translation: { total: translation.length, items: translation.slice(0, limit) },
      articles: titles,
    }
    return { id: 'wenyan', name: '文言文', total: words.length + modern.length + classical.length + translation.length + titles.length, groups }
  }

  const favBody = (b) => (b && (b.kind === 'word' || b.kind === 'sentence') && typeof b.ref === 'string' && b.ref && b.ref.length <= 40 ? { kind: b.kind, ref: b.ref } : null)

  // method: GET/POST/PUT/DELETE；path 不含查询串；openid 为空表示拿不到身份
  return async function handle({ method = 'GET', path = '/', query = {}, body = {}, openid = '' }) {
    if (path.startsWith('/me/english/')) return englishApi ? englishApi({ method, path, body, openid }) : fail(503, '英语同步服务未启用')
    const seg = path.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s) } catch { return s } })
    const route = method + ' /' + seg.slice(0, 2).join('/')

    if (route === 'GET /health') return ok({ ok: true })
    if (route === 'POST /auth/wx-login') return ok({ token: 'cloud' })
    if (route === 'GET /subjects') return ok({ subjects: SUBJECTS })

    if (route === 'GET /search') {
      const q = String(query.q || '').trim().slice(0, 30)
      if (!q) return fail(400, '请输入要查的字词')
      const mods = (SUBJECTS.find((s) => s.id === (query.subject || 'yuwen')) || { modules: [] }).modules.map(({ id, name, online }) => ({ id, name, online }))
      const results = []
      if ((!query.module || query.module === 'wenyan') && mods.some((m) => m.id === 'wenyan' && m.online)) results.push(searchWenyan(q, clamp(query.limit, 5, 50)))
      return ok({ q, modules: mods, results })
    }

    if (route === 'GET /wenyan/hot') return ok({ words: entries.slice(0, 12).map((e) => ({ word: e.word, count: e.count })) })
    if (route === 'GET /wenyan/entries') {
      const e = entryByWord.get(seg[2])
      if (!e) return fail(404, '这个字还没有收录')
      return ok({ word: e.word, count: e.count, length: [...e.word].length, senses: e.senses })
    }
    if (route === 'GET /wenyan/articles') {
      if (seg.length === 2) return ok({ articles: articles.map(({ id, title, source, mark_count }) => ({ id, title, source, mark_count })) })
      const a = artById.get(Number(seg[2]))
      if (!a) return fail(404, '没有这一篇')
      return ok({ id: a.id, title: a.title, source: a.source, notes: a.notes, prev: artById.has(a.id - 1) ? a.id - 1 : null, next: artById.has(a.id + 1) ? a.id + 1 : null, sentences: a.sentences })
    }
    if (route === 'GET /wenyan/topics') {
      const type = seg[2]
      if (type === 'modern') return ok({ type, items: modernTopic })
      const items = topics[type]
      if (!items) return fail(404, '没有这个专题')
      const sentences = {}
      for (const it of items) for (const id of it.examples ? it.examples.map((x) => x.sentence) : [it.sentence]) sentences[id] = sentById.get(id)
      return ok({ type, items, sentences })
    }

    // ---- 以下需要身份 ----
    if (seg[0] !== 'me') return fail(404, '没有这个接口')
    if (!openid) return fail(401, '登录已失效')
    const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined)

    if (route === 'GET /me/profile') {
      const [u, favs, hist] = await Promise.all([store.getUser(openid), store.listFav(openid), store.listHistory(openid, 100)])
      return ok({ nickname: u.nickname || null, avatar: u.avatar || null, last_subject: u.last_subject || null, favorites: favs.length, history: hist.length })
    }
    if (route === 'PUT /me/profile') {
      const patch = {}
      const n = str(body.nickname, 30), a = str(body.avatar, 500), s = str(body.lastSubject, 20)
      if (n !== undefined) patch.nickname = n
      if (a !== undefined) patch.avatar = a
      if (s !== undefined) patch.last_subject = s
      await store.setUser(openid, patch)
      return ok({ ok: true })
    }

    if (route === 'GET /me/favorites' && seg[2] === 'check') return ok({ favorited: await store.hasFav(openid, String(query.kind), String(query.ref)) })
    if (route === 'GET /me/favorites') {
      const favs = await store.listFav(openid)
      const words = [], sentences = []
      for (const f of favs) {
        if (f.kind === 'word' && entryByWord.has(f.ref)) { const e = entryByWord.get(f.ref); words.push({ word: e.word, created_at: f.created_at, count: e.count, summary: e.summary }) }
        if (f.kind === 'sentence' && sentById.has(f.ref)) sentences.push({ created_at: f.created_at, ...sentById.get(f.ref) })
      }
      return ok({ words, sentences })
    }
    if (route === 'POST /me/favorites' || route === 'DELETE /me/favorites') {
      const b = favBody(body)
      if (!b) return fail(400, '参数不对')
      if (method === 'DELETE') { await store.delFav(openid, b.kind, b.ref); return ok({ ok: true }) }
      if (!(b.kind === 'word' ? entryByWord.has(b.ref) : sentById.has(b.ref))) return fail(404, '要收藏的内容不存在')
      await store.addFav(openid, b.kind, b.ref)
      return ok({ ok: true })
    }

    if (route === 'GET /me/history') return ok({ items: await store.listHistory(openid, clamp(query.limit, 100, 100)) })
    if (route === 'POST /me/history') {
      const q = String(body.q || '').trim().slice(0, 30)
      if (!q) return fail(400, '参数不对')
      await store.addHistory(openid, q)
      return ok({ ok: true })
    }
    if (route === 'DELETE /me/history') { await store.delHistory(openid, query.id ? String(query.id) : ''); return ok({ ok: true }) }

    if (route === 'PUT /me/progress') {
      const a = artById.get(Number(body.articleId))
      if (!a) return fail(404, '没有这一篇')
      await store.setUser(openid, { last_read: { module: 'wenyan', articleId: a.id, title: a.title } })
      return ok({ ok: true })
    }
    if (route === 'GET /me/recent') {
      const [u, hist] = await Promise.all([store.getUser(openid), store.listHistory(openid, 8)])
      return ok({ lastRead: u.last_read || null, lastSubject: u.last_subject || null, words: hist.map((h) => h.q) })
    }
    return fail(404, '没有这个接口')
  }
}

module.exports = { createApi }
