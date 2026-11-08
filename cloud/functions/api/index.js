'use strict'
// 云函数入口。小程序用 wx.cloud.callFunction({ name: 'api', data: { method, path, query, body } }) 调用。
const cloud = require('wx-server-sdk')
const { createApi } = require('./core')
const { createEnglishApi } = require('./english')
const { createEnglishStore } = require('./english-store')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const COLLECTIONS = ['users', 'favorites', 'history', 'english_progress']

// 集合不存在时自动创建；已存在会报错，忽略即可
const ready = Promise.all(COLLECTIONS.map((n) => db.createCollection(n).catch(() => {})))

const users = db.collection('users')
const favorites = db.collection('favorites')
const history = db.collection('history')

// 用户数据都以 openid 为主键，备案完成后可以按 openid 原样迁到自有服务器
const store = {
  async getUser(openid) {
    const r = await users.where({ _id: openid }).limit(1).get()
    return r.data[0] || {}
  },
  async setUser(openid, patch) {
    if (!Object.keys(patch).length) return
    const r = await users.where({ _id: openid }).update({ data: patch })
    if (!r.stats.updated) await users.add({ data: { _id: openid, created_at: new Date().toISOString(), ...patch } }).catch(() => users.where({ _id: openid }).update({ data: patch }))
  },
  async listFav(openid) {
    const r = await favorites.where({ openid }).orderBy('created_at', 'desc').limit(1000).get()
    return r.data.map((f) => ({ kind: f.kind, ref: f.ref, created_at: f.created_at }))
  },
  async hasFav(openid, kind, ref) {
    return (await favorites.where({ openid, kind, ref }).count()).total > 0
  },
  async addFav(openid, kind, ref) {
    if (await this.hasFav(openid, kind, ref)) return
    await favorites.add({ data: { openid, kind, ref, created_at: new Date().toISOString() } })
  },
  async delFav(openid, kind, ref) {
    await favorites.where({ openid, kind, ref }).remove()
  },
  async listHistory(openid, limit) {
    const r = await history.where({ openid }).orderBy('created_at', 'desc').limit(limit).get()
    return r.data.map((h) => ({ id: h._id, q: h.q, created_at: h.created_at }))
  },
  async addHistory(openid, q) {
    await history.where({ openid, q }).remove()
    await history.add({ data: { openid, q, created_at: new Date().toISOString() } })
    const old = await history.where({ openid }).orderBy('created_at', 'desc').skip(100).limit(100).get()
    if (old.data.length) await history.where({ openid, _id: _.in(old.data.map((h) => h._id)) }).remove()
  },
  async delHistory(openid, id) {
    await history.where(id ? { openid, _id: id } : { openid }).remove()
  },
}

const handle = createApi(require('./data.json'), store, createEnglishApi(createEnglishStore(db)))

exports.main = async (event) => {
  await ready
  const { OPENID } = cloud.getWXContext()
  try {
    return await handle({ method: event.method, path: event.path, query: event.query || {}, body: event.body || {}, openid: OPENID })
  } catch (e) {
    console.error(e)
    return { status: 500, data: { error: '服务出了点问题，请稍后再试' } }
  }
}
