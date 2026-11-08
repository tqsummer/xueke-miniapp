import type { Mode, Progress, RecordItem } from './core'
import { emptyProgress, keyOf, updateRecord } from './core'
export interface Draft { wordId: string; mode: Mode; correct: boolean; at: number }
export interface SyncEvent extends Draft { seq: number }
export interface ServerState { accountId: string; version: number; progress: Progress; acknowledged: Record<string, number> }
export interface AccountCache { accountId: string; deviceId: string; nextSeq: number; server: ServerState; pending: SyncEvent[]; draft?: Draft }
export interface SyncBody { accountId: string; deviceId: string; events: SyncEvent[] }
export const MAX_PENDING = 5000
const MAX_RECORDS = 5000
const MAX_DEVICES = 100
const MAX_TIME = 8640000000000000 - 30 * 86400000
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
function fail(): never { throw new Error('Invalid English account cache or sync state') }
function obj(v: any): boolean { return !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) }
function exact(v: any, required: string[], optional: string[] = []) {
 if (!obj(v) || required.some(k => !Object.prototype.hasOwnProperty.call(v, k)) || Object.keys(v).some(k => !required.includes(k) && !optional.includes(k))) fail()
}
function integer(n: any, max = Number.MAX_SAFE_INTEGER - 1): boolean { return Number.isSafeInteger(n) && n >= 0 && n <= max }
function identity(v: any): boolean { return typeof v === 'string' && v.length > 0 && v.length <= 256 && !/[\u0000-\u0020\u007f]/.test(v) && !forbidden.has(v) }
function wordId(v: any): boolean { return typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v) && !forbidden.has(v) }
function draft(v: any, event = false): Draft | SyncEvent {
 exact(v, event ? ['seq','wordId','mode','correct','at'] : ['wordId','mode','correct','at'])
 if (!wordId(v.wordId) || !['zh-en','en-zh'].includes(v.mode) || typeof v.correct !== 'boolean' || !integer(v.at, MAX_TIME) || (event && (!integer(v.seq) || v.seq < 1))) fail()
 return event ? { seq:v.seq, wordId:v.wordId, mode:v.mode, correct:v.correct, at:v.at } : { wordId:v.wordId, mode:v.mode, correct:v.correct, at:v.at }
}
function state(v: any, accountId: string): ServerState {
 exact(v, ['accountId','version','progress','acknowledged'])
 if (v.accountId !== accountId || !identity(v.accountId) || !integer(v.version)) fail()
 exact(v.progress, ['version','records'])
 if (v.progress.version !== 1 || !obj(v.progress.records) || Object.keys(v.progress.records).length > MAX_RECORDS || !obj(v.acknowledged) || Object.keys(v.acknowledged).length > MAX_DEVICES) fail()
 const records: Record<string,RecordItem> = {}
 for (const [k,r] of Object.entries(v.progress.records) as [string,any][]) {
  const suffix = k.endsWith(':zh-en') || k.endsWith(':en-zh')
  if (!suffix || !wordId(k.slice(0,-6))) fail()
  exact(r,['correct','wrong','streak','due','last','mistake'])
  if (!integer(r.correct) || !integer(r.wrong) || !integer(r.streak,5) || !integer(r.due,8640000000000000) || !integer(r.last,MAX_TIME) || typeof r.mistake !== 'boolean') fail()
  records[k] = { ...r }
 }
 const acknowledged: Record<string,number> = {}
 for (const [k,n] of Object.entries(v.acknowledged)) { if (!identity(k) || !integer(n)) fail(); acknowledged[k] = n as number }
 return {accountId,version:v.version,progress:{version:1,records},acknowledged}
}
export function cacheKey(accountId: string): string { if (!identity(accountId)) fail(); return 'english-account-v1:' + accountId }
export function createCache(accountId: string, deviceId: string, server?: ServerState): AccountCache {
 if (!identity(accountId) || !identity(deviceId)) fail()
 const s = state(server || {accountId,version:0,progress:emptyProgress(),acknowledged:{}},accountId)
 return {accountId,deviceId,nextSeq:(s.acknowledged[deviceId] || 0)+1,server:s,pending:[]}
}
export function parseCache(input: unknown, expectedAccountId: string): AccountCache {
 if (!identity(expectedAccountId)) fail()
 if (typeof input === 'string' && input.length > 8000000) fail()
 const v:any = typeof input === 'string' ? JSON.parse(input) : input
 exact(v,['accountId','deviceId','nextSeq','server','pending'],['draft'])
 if (v.accountId !== expectedAccountId || !identity(v.deviceId) || !integer(v.nextSeq) || v.nextSeq < 1 || !Array.isArray(v.pending) || v.pending.length > MAX_PENDING) fail()
 const s = state(v.server,expectedAccountId)
 const pending = v.pending.map((e:any) => draft(e,true) as SyncEvent)
 let next = (s.acknowledged[v.deviceId] || 0) + 1
 for (const e of pending) { if (e.seq !== next++) fail() }
 if (next !== v.nextSeq) fail()
 const result:AccountCache = {accountId:expectedAccountId,deviceId:v.deviceId,nextSeq:next,server:s,pending}
 if (Object.prototype.hasOwnProperty.call(v,'draft')) result.draft = draft(v.draft) as Draft
 return result
}
export function projectProgress(cache: AccountCache): Progress {
 const c = parseCache(cache,cache.accountId)
 const records = c.server.progress.records
 for (const e of [...c.pending,...(c.draft ? [c.draft] : [])]) {
  const key = keyOf(e.wordId,e.mode)
  records[key] = updateRecord(records[key],e.correct,e.at)
 }
 if (Object.keys(records).length > MAX_RECORDS) fail()
 return {version:1,records}
}
export function setDraft(cache: AccountCache, value: Draft | null): AccountCache {
 const c = parseCache(cache,cache.accountId)
 if (value === null) delete c.draft
 else c.draft = draft(value) as Draft
 return c
}
export function finalizeDraft(cache: AccountCache): AccountCache {
 const c = parseCache(cache,cache.accountId)
 if (!c.draft) return c
 if (c.pending.length >= MAX_PENDING || c.nextSeq >= Number.MAX_SAFE_INTEGER - 1) throw new Error('English sync queue full; sync before continuing')
 c.pending.push({ ...c.draft, seq:c.nextSeq++ })
 delete c.draft
 return c
}
export function mergeState(cache: AccountCache, value: ServerState): AccountCache {
 const c = parseCache(cache,cache.accountId)
 const s = state(value,c.accountId)
 // An older overlapping request cannot roll back state or erase local events.
 if (s.version <= c.server.version) return c
 for (const [device,ack] of Object.entries(c.server.acknowledged)) if ((s.acknowledged[device] || 0) < ack) fail()
 const ack = s.acknowledged[c.deviceId] || 0
 if (ack >= c.nextSeq) fail()
 c.server = s
 c.pending = c.pending.filter(e => e.seq > ack)
 return parseCache(c,c.accountId)
}
export function nextBatch(cache: AccountCache, limit = 50): SyncBody {
 const c = parseCache(cache,cache.accountId)
 if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) fail()
 return {accountId:c.accountId,deviceId:c.deviceId,events:c.pending.slice(0,limit)}
}

