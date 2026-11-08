import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { openDb, type DB } from '../src/db.js'
import { importData } from '../src/import.js'

let app: FastifyInstance
let db: DB
let token = ''

beforeAll(async () => {
  db = await openDb()
  await importData(db, '../data/文言文字词数据.json')
  app = await buildApp({ db, jwtSecret: 'test-secret-test-secret-test-secret', wxLogin: async (c) => { if (c === 'bad') throw new Error('bad'); return 'openid-' + c } })
  token = (await app.inject({ method: 'POST', url: '/auth/wx-login', payload: { code: 'u1' } })).json().token
}, 60000)
afterAll(async () => { await app.close(); await db.close() })

const get = async (url: string, auth = false) => (await app.inject({ url: encodeURI(url), headers: auth ? { authorization: 'Bearer ' + token } : {} })).json()
const send = (method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, headers: { authorization: 'Bearer ' + token } })

describe('内容', () => {
  it('科目与模块', async () => {
    const r = await get('/subjects')
    expect(r.subjects.map((s: any) => s.name)).toEqual(['语文', '数学', '英语', '物理', '化学'])
    expect(r.subjects[0].modules[0]).toMatchObject({ id: 'wenyan', online: true })
  })
  it('热门字按出现次数', async () => {
    const r = await get('/wenyan/hot')
    expect(r.words.slice(0, 3)).toEqual([{ word: '为', count: 32 }, { word: '使', count: 25 }, { word: '过', count: 20 }])
  })
  it('字词详情：遗 4 个义项 9 处；为 8 个义项 32 处', async () => {
    const yi = await get('/wenyan/entries/遗')
    expect(yi.senses).toHaveLength(4)
    expect(yi.senses.flatMap((s: any) => s.examples)).toHaveLength(9)
    const x = yi.senses[0].examples[0]
    expect(x.classical.substr(x.sentence_offset, 1)).toBe('遗')
    const wei = await get('/wenyan/entries/为')
    expect(wei.senses).toHaveLength(8)
    expect(wei.senses.flatMap((s: any) => s.examples)).toHaveLength(32)
    expect((await app.inject({ url: encodeURI('/wenyan/entries/龘') })).statusCode).toBe(404)
  })
  it('篇目与原文', async () => {
    expect((await get('/wenyan/articles')).articles).toHaveLength(100)
    const a = await get('/wenyan/articles/19')
    expect(a).toMatchObject({ title: '王猛斩强德', prev: 18, next: 20 })
    for (const s of a.sentences) for (const m of s.marks) expect(s.classical.substr(m.offset, m.length)).toBe(m.word)
    expect((await get('/wenyan/articles/1')).prev).toBeNull()
  })
  it('专题', async () => {
    const t = await get('/wenyan/topics/tongjia')
    expect(t.items[0]).toMatchObject({ char: '说', reads_as: '悦' })
    expect(t.sentences[t.items[0].examples[0].sentence].classical).toContain('说')
    expect((await get('/wenyan/topics/modern')).items.find((i: any) => i.modern === '如果').classical.map((c: any) => c.word).sort()).toEqual(['使', '若', '苟'].sort())
  })
})

describe('搜索', () => {
  it('文言 → 字词与原句', async () => {
    const w = (await get('/search?q=遗&limit=50')).results[0]
    expect(w.groups.words).toHaveLength(1)
    expect(w.groups.words[0]).toMatchObject({ word: '遗', count: 9, senses: 4 })
    expect(w.groups.classical.total).toBeGreaterThanOrEqual(9)
  })
  it('成语 → 三篇里的原句', async () => {
    const w = (await get('/search?q=路不拾遗&limit=50')).results[0]
    expect(w.groups.classical.items.map((s: any) => s.article)).toEqual([19, 58, 72])
  })
  it('现代文 → 文言', async () => {
    const w = (await get('/search?q=离开')).results[0]
    expect(w.groups.modern.items.map((m: any) => m.word)).toContain('去')
    expect(w.groups.translation.total).toBeGreaterThan(0)
  })
  it('默认每组 5 条但给出总数；特殊字符不报错', async () => {
    const w = (await get('/search?q=之')).results[0]
    expect(w.groups.classical.items).toHaveLength(5)
    expect(w.groups.classical.total).toBeGreaterThan(5)
    expect((await get('/search?q=%25_')).results[0].total).toBe(0)
    expect((await app.inject({ url: '/search?q=' })).statusCode).toBe(400)
  })
})

describe('登录与个人数据', () => {
  it('未登录拿不到个人数据；登录失败返回 401', async () => {
    expect((await app.inject({ url: '/me/favorites' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/auth/wx-login', payload: { code: 'bad' } })).statusCode).toBe(401)
  })
  it('收藏字词和句子，重复收藏不重复，可删除', async () => {
    await send('POST', '/me/favorites', { kind: 'word', ref: '遗' })
    await send('POST', '/me/favorites', { kind: 'word', ref: '遗' })
    await send('POST', '/me/favorites', { kind: 'sentence', ref: 'a19-s3' })
    expect((await send('POST', '/me/favorites', { kind: 'word', ref: '龘' })).statusCode).toBe(404)
    let f = await get('/me/favorites', true)
    expect(f.words).toHaveLength(1)
    expect(f.words[0].summary).toContain('赠送')
    expect(f.sentences[0]).toMatchObject({ id: 'a19-s3', title: '王猛斩强德' })
    expect((await get('/me/favorites/check?kind=word&ref=遗', true)).favorited).toBe(true)
    await send('DELETE', '/me/favorites', { kind: 'word', ref: '遗' })
    f = await get('/me/favorites', true)
    expect(f.words).toHaveLength(0)
  })
  it('历史去重、最近记录、阅读进度、资料', async () => {
    for (const q of ['遗', '为', '遗']) await send('POST', '/me/history', { q })
    await send('PUT', '/me/progress', { articleId: 19 })
    await send('PUT', '/me/profile', { nickname: '小金', lastSubject: 'yuwen' })
    const r = await get('/me/recent', true)
    expect(r.words).toEqual(['遗', '为'])
    expect(r.lastRead).toMatchObject({ articleId: 19, title: '王猛斩强德' })
    expect(await get('/me/profile', true)).toMatchObject({ nickname: '小金', last_subject: 'yuwen', history: 2 })
    await send('DELETE', '/me/history')
    expect((await get('/me/history', true)).items).toHaveLength(0)
  })
  it('同一个 code 再登录还是同一个人', async () => {
    const t2 = (await app.inject({ method: 'POST', url: '/auth/wx-login', payload: { code: 'u1' } })).json().token
    const f = (await app.inject({ url: '/me/favorites', headers: { authorization: 'Bearer ' + t2 } })).json()
    expect(f.sentences).toHaveLength(1)
  })
})
