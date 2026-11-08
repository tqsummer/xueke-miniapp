// 运行：node --test cloud/test    （在项目根目录）
// 用内存 store 验证云函数的核心逻辑与 server/ 的接口返回一致。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createApi } = require('../functions/api/core.js')
const data = JSON.parse(readFileSync(new URL('../../data/文言文字词数据.json', import.meta.url), 'utf8'))

function memoryStore() {
  const users = new Map(); let favs = []; let hist = []; let n = 0
  return {
    getUser: async (o) => users.get(o) || {},
    setUser: async (o, p) => { users.set(o, { ...(users.get(o) || {}), ...p }) },
    listFav: async (o) => favs.filter((f) => f.openid === o).sort((a, b) => b.n - a.n),
    hasFav: async (o, kind, ref) => favs.some((f) => f.openid === o && f.kind === kind && f.ref === ref),
    async addFav(o, kind, ref) { if (!(await this.hasFav(o, kind, ref))) favs.push({ openid: o, kind, ref, created_at: new Date().toISOString(), n: ++n }) },
    delFav: async (o, kind, ref) => { favs = favs.filter((f) => !(f.openid === o && f.kind === kind && f.ref === ref)) },
    listHistory: async (o, limit) => hist.filter((h) => h.openid === o).sort((a, b) => b.n - a.n).slice(0, limit).map((h) => ({ id: String(h.n), q: h.q, created_at: h.created_at })),
    addHistory: async (o, q) => { hist = hist.filter((h) => !(h.openid === o && h.q === q)); hist.push({ openid: o, q, created_at: new Date().toISOString(), n: ++n }) },
    delHistory: async (o, id) => { hist = hist.filter((h) => !(h.openid === o && (!id || String(h.n) === id))) },
  }
}

const handle = createApi(data, memoryStore())
const get = async (path, query = {}, openid = '') => (await handle({ method: 'GET', path, query, openid })).data
const me = (method, path, body = {}, query = {}) => handle({ method, path, body, query, openid: 'u1' })

test('内容接口', async () => {
  assert.deepEqual((await get('/subjects')).subjects.map((s) => s.name), ['语文', '数学', '英语', '物理', '化学'])
  assert.deepEqual((await get('/wenyan/hot')).words.slice(0, 3), [{ word: '为', count: 32 }, { word: '使', count: 25 }, { word: '过', count: 20 }])
  const yi = await get('/wenyan/entries/' + encodeURIComponent('遗'))
  assert.equal(yi.senses.length, 4)
  assert.equal(yi.senses.flatMap((s) => s.examples).length, 9)
  const x = yi.senses[0].examples[0]
  assert.equal(x.classical.substr(x.sentence_offset, 1), '遗')
  assert.equal((await get('/wenyan/entries/' + encodeURIComponent('为'))).senses.flatMap((s) => s.examples).length, 32)
  assert.equal((await handle({ path: '/wenyan/entries/' + encodeURIComponent('龘') })).status, 404)
  assert.equal((await get('/wenyan/articles')).articles.length, 100)
  const a = await get('/wenyan/articles/19')
  assert.equal(a.title, '王猛斩强德'); assert.equal(a.prev, 18); assert.equal(a.next, 20)
  assert.equal((await get('/wenyan/articles/1')).prev, null)
  const t = await get('/wenyan/topics/tongjia')
  assert.ok(t.sentences[t.items[0].examples[0].sentence].classical.includes('说'))
  assert.deepEqual((await get('/wenyan/topics/modern')).items.find((i) => i.modern === '如果').classical.map((c) => c.word).sort(), ['使', '若', '苟'].sort())
})

test('搜索', async () => {
  let w = (await get('/search', { q: '遗', limit: 50 })).results[0]
  assert.equal(w.groups.words.length, 1)
  assert.deepEqual({ word: w.groups.words[0].word, count: w.groups.words[0].count, senses: w.groups.words[0].senses }, { word: '遗', count: 9, senses: 4 })
  assert.equal(w.groups.classical.total, 10)
  assert.equal(w.total, 15)
  w = (await get('/search', { q: '路不拾遗', limit: 50 })).results[0]
  assert.deepEqual(w.groups.classical.items.map((s) => s.article), [19, 58, 72])
  w = (await get('/search', { q: '离开' })).results[0]
  assert.ok(w.groups.modern.items.map((m) => m.word).includes('去'))
  w = (await get('/search', { q: '之' })).results[0]
  assert.equal(w.groups.classical.items.length, 5)
  assert.ok(w.groups.classical.total > 5)
  assert.equal((await handle({ path: '/search', query: { q: '' } })).status, 400)
})

test('个人数据', async () => {
  assert.equal((await handle({ path: '/me/favorites' })).status, 401)
  await me('POST', '/me/favorites', { kind: 'word', ref: '遗' })
  await me('POST', '/me/favorites', { kind: 'word', ref: '遗' })
  await me('POST', '/me/favorites', { kind: 'sentence', ref: 'a19-s3' })
  assert.equal((await me('POST', '/me/favorites', { kind: 'word', ref: '龘' })).status, 404)
  let f = (await me('GET', '/me/favorites')).data
  assert.equal(f.words.length, 1)
  assert.ok(f.words[0].summary.includes('赠送'))
  assert.equal(f.sentences[0].title, '王猛斩强德')
  assert.equal((await me('GET', '/me/favorites/check', {}, { kind: 'word', ref: '遗' })).data.favorited, true)
  await me('DELETE', '/me/favorites', { kind: 'word', ref: '遗' })
  assert.equal((await me('GET', '/me/favorites')).data.words.length, 0)

  for (const q of ['遗', '为', '遗']) await me('POST', '/me/history', { q })
  await me('PUT', '/me/progress', { articleId: 19 })
  await me('PUT', '/me/profile', { nickname: '小金', lastSubject: 'yuwen' })
  const r = (await me('GET', '/me/recent')).data
  assert.deepEqual(r.words, ['遗', '为'])
  assert.equal(r.lastRead.title, '王猛斩强德')
  const p = (await me('GET', '/me/profile')).data
  assert.deepEqual({ n: p.nickname, s: p.last_subject, h: p.history, f: p.favorites }, { n: '小金', s: 'yuwen', h: 2, f: 1 })
  await me('DELETE', '/me/history')
  assert.equal((await me('GET', '/me/history')).data.items.length, 0)
})
