const BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3000'
// cloud：走微信云开发的云函数（不需要域名和备案）；其余情况走自有服务器的 HTTP 接口
const CLOUD = import.meta.env.VITE_BACKEND === 'cloud'
declare const wx: any

export function initBackend() {
  // #ifdef MP-WEIXIN
  if (CLOUD) wx.cloud.init({ env: import.meta.env.VITE_CLOUD_ENV || undefined, traceUser: true })
  // #endif
}

function splitUrl(url: string) {
  const [path, qs = ''] = url.split('?')
  const query: Record<string, string> = {}
  for (const kv of qs.split('&')) {
    if (!kv) continue
    const i = kv.indexOf('=')
    const k = i < 0 ? kv : kv.slice(0, i)
    try { query[k] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1)) } catch { query[k] = kv.slice(i + 1) }
  }
  return { path, query }
}

function rawCloud<T>(method: string, url: string, data?: unknown): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    wx.cloud.callFunction({
      name: 'api',
      data: { method, ...splitUrl(url), body: data ?? {} },
      success: (r: any) => resolve(r.result || { status: 500, data: { error: '请求失败' } }),
      fail: (e: any) => reject(new Error(e.errMsg || '网络连接失败')),
    })
    // #endif
    // #ifndef MP-WEIXIN
    reject(new Error('云开发只能在微信小程序里使用'))
    // #endif
  })
}
const TOKEN_KEY = 'token'

let token: string = uni.getStorageSync(TOKEN_KEY) || ''
let pending: Promise<string> | null = null

function getCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.login({ provider: 'weixin', success: (r) => resolve(r.code), fail: reject })
    // #endif
    // #ifndef MP-WEIXIN
    // 浏览器里调试用：固定一个本机身份
    let id = uni.getStorageSync('devId')
    if (!id) { id = 'h5-' + Math.random().toString(36).slice(2, 10); uni.setStorageSync('devId', id) }
    resolve(id)
    // #endif
  })
}

function raw<T>(method: string, url: string, data?: unknown, auth = true): Promise<{ status: number; data: T }> {
  if (CLOUD) return rawCloud<T>(method, url, data)
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE + url,
      method: method as any,
      data: (data ?? (method === 'GET' ? undefined : {})) as any,
      timeout: 8000,
      header: auth && token ? { Authorization: 'Bearer ' + token } : {},
      success: (r) => resolve({ status: r.statusCode, data: r.data as T }),
      fail: (e) => reject(new Error(e.errMsg || '网络连接失败')),
    })
  })
}

// 静默登录；并发调用共用同一次请求
export function login(force = false): Promise<string> {
  // 云开发里身份由微信直接带给云函数，不需要换 token
  if (CLOUD) return Promise.resolve('cloud')
  if (token && !force) return Promise.resolve(token)
  if (!pending) {
    pending = getCode()
      .then((code) => raw<{ token?: string }>('POST', '/auth/wx-login', { code }, false))
      .then((r) => {
        if (r.status !== 200 || !r.data.token) throw new Error('登录失败')
        token = r.data.token
        uni.setStorageSync(TOKEN_KEY, token)
        return token
      })
      .finally(() => { pending = null })
  }
  return pending
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function call<T>(method: string, url: string, data?: unknown, needAuth = false): Promise<T> {
  if (needAuth) await login()
  let r = await raw<any>(method, url, data)
  if (r.status === 401 && needAuth) {
    await login(true)
    r = await raw<any>(method, url, data)
  }
  if (r.status >= 400) throw new ApiError(r.status, r.data?.error || '请求失败')
  return r.data as T
}

export const api = {
  get: <T = any>(url: string) => call<T>('GET', url),
  me: {
    get: <T = any>(url: string) => call<T>('GET', url, undefined, true),
    post: <T = any>(url: string, data?: unknown) => call<T>('POST', url, data, true),
    put: <T = any>(url: string, data?: unknown) => call<T>('PUT', url, data, true),
    del: <T = any>(url: string, data?: unknown) => call<T>('DELETE', url, data, true),
  },
}

export const enc = encodeURIComponent
export function dec(v: unknown): string {
  try { return decodeURIComponent(String(v ?? '')) } catch { return String(v ?? '') }
}

export function toast(title: string) { uni.showToast({ title, icon: 'none' }) }

export const go = {
  entry: (word: string, sense?: number) => uni.navigateTo({ url: `/pkg-yuwen/entry/index?word=${enc(word)}${sense ? '&sense=' + sense : ''}` }),
  reader: (id: number | string, s?: string) => uni.navigateTo({ url: `/pkg-yuwen/reader/index?id=${id}${s ? '&s=' + s : ''}` }),
  search: (q = '', module = '') => uni.navigateTo({ url: `/pkg-yuwen/search/index?q=${enc(q)}&module=${module}` }),
}

// 把一段文字按关键词切开，用于高亮
export function splitHl(text: string, q: string): { t: string; on: boolean }[] {
  if (!q || !text.includes(q)) return [{ t: text, on: false }]
  const out: { t: string; on: boolean }[] = []
  let p = 0
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, p)) {
    if (i > p) out.push({ t: text.slice(p, i), on: false })
    out.push({ t: q, on: true })
    p = i + q.length
  }
  if (p < text.length) out.push({ t: text.slice(p), on: false })
  return out
}

// 收藏开关：返回切换后的状态
export async function toggleFav(kind: 'word' | 'sentence', ref: string, on: boolean): Promise<boolean> {
  try {
    if (on) await api.me.del('/me/favorites', { kind, ref })
    else await api.me.post('/me/favorites', { kind, ref })
    toast(on ? '已从生词本移除' : '已加入生词本')
    return !on
  } catch {
    toast('没有保存成功，请稍后再试')
    return on
  }
}
