import { computed, ref } from 'vue'
import { api, ApiError } from '../utils/request'
import { emptyProgress, parseProgress, STORAGE_KEY } from './core'
import { createCache, parseCache, projectProgress, setDraft, finalizeDraft, mergeState, nextBatch, cacheKey } from './sync-core'
import type { AccountCache, Draft, ServerState } from './sync-core'

const DEVICE_KEY = 'english-sync-device-v1'
const CLAIM_KEY = 'english-legacy-import-v1'
interface Claim { accountId: string; importId: string; completed?: boolean }
function uniqueId(prefix: string) { return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) }
function readClaim(): Claim | null {
 const raw: unknown = uni.getStorageSync(CLAIM_KEY)
 if (raw === '' || raw === undefined || raw === null) return null
 const c: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
 if (!c || typeof c !== 'object' || typeof (c as Claim).accountId !== 'string' || !(c as Claim).accountId ||
     typeof (c as Claim).importId !== 'string' || !(c as Claim).importId ||
     ('completed' in c && typeof (c as Claim).completed !== 'boolean')) throw new Error('Invalid legacy claim')
 return c as Claim
}
function writeStorage(key: string, value: unknown) {
 const encoded = JSON.stringify(value)
 uni.setStorageSync(key, encoded)
 // Detect silent storage failure as well as quota exceptions.
 if (uni.getStorageSync(key) !== encoded) throw new Error('Storage verification failed')
}

export function useAccountSync() {
 const enabled = import.meta.env.VITE_BACKEND === 'cloud'
 const cache = ref<AccountCache | null>(null)
 const status = ref(enabled ? '请联网确认微信账号' : '本机练习')
 const warning = ref('')
 const legacyAvailable = ref(false)
 const ready = computed(() => enabled && cache.value !== null)
 const progress = computed(() => cache.value ? projectProgress(cache.value) : emptyProgress())
 const pendingCount = computed(() => (cache.value?.pending.length || 0) + Number(!!cache.value?.draft))
 let generation = 0
 let running: Promise<void> | null = null
 let runningGeneration = -1
 let importing = false
 const current = (g: number, accountId: string) => generation === g && cache.value?.accountId === accountId
 function persist(c: AccountCache): boolean {
  try { writeStorage(cacheKey(c.accountId), c); return true }
  catch { warning.value = '本机保存失败，请勿继续下一题或关闭页面。请先导出备份后重试。'; status.value = '未保存成功'; return false }
 }
 function commit(c: AccountCache): boolean {
  if (!persist(c)) return false
  cache.value = c
  return true
 }
 function refreshLegacy(accountId: string) {
  legacyAvailable.value = false
  try {
   const claim = readClaim()
   if (claim && (claim.accountId !== accountId || claim.completed)) return
   const p = parseProgress(uni.getStorageSync(STORAGE_KEY))
   legacyAvailable.value = Object.keys(p.records).length > 0
  } catch { warning.value = '旧版记录或导入标记无法读取，已保留原数据，不会自动导入。' }
 }
 function invalidate(g: number, accountId?: string) {
  if (generation !== g || (accountId && cache.value?.accountId !== accountId)) return
  if (cache.value) persist(cache.value)
  generation++
  cache.value = null
  legacyAvailable.value = false
  status.value = '账号验证失效，请联网重新进入'
  warning.value = '为防止记录串号，已隐藏本机账号记录。重新确认账号后再继续。' + (warning.value.includes('保存失败') ? '本机保存曾失败，请保留已有备份。' : '')
 }
 function handleError(error: unknown, g: number, accountId?: string) {
  if (generation !== g || (accountId && cache.value?.accountId !== accountId)) return
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { invalidate(g, accountId); return }
  if (error instanceof ApiError && [400, 409, 413].includes(error.status)) {
   status.value = '服务器拒绝同步，本机记录保留'
   warning.value = `服务器拒绝请求（${error.status}）：${error.message}。待同步记录不会删除，请导出备份后处理原因。`
   return
  }
  status.value = cache.value ? '暂未同步，本机记录保留' : '需联网确认微信账号'
  if (!cache.value) warning.value = '暂时无法确认当前微信账号，为防串号不显示旧记录。联网后重新进入。'
 }
 async function open(): Promise<void> {
  const g = ++generation
  cache.value = null
  legacyAvailable.value = false
  warning.value = ''
  status.value = enabled ? '正在确认微信账号…' : '本机练习'
  if (!enabled) return
  try {
   const state = await api.me.get<ServerState>('/me/english/state')
   if (generation !== g) return
   // Validate the server-supplied identity before looking up any account cache.
   if (!state || typeof state.accountId !== 'string') throw new Error('Invalid identity')
   let device: unknown = uni.getStorageSync(DEVICE_KEY)
   if (typeof device !== 'string' || !device) {
    device = uniqueId('device-')
    try { uni.setStorageSync(DEVICE_KEY, device); if (uni.getStorageSync(DEVICE_KEY) !== device) throw new Error('Device persistence failed') }
    catch { warning.value = '本机无法保存设备标记，暂不能安全记录练习。请腾出存储空间后重试。'; status.value = '未保存成功'; return }
   }
   const fresh = createCache(state.accountId, device as string, state)
   const raw: unknown = uni.getStorageSync(cacheKey(state.accountId))
   let c: AccountCache
   try { c = raw === '' || raw === undefined || raw === null ? fresh : mergeState(parseCache(raw, state.accountId), state) }
   catch { warning.value = '当前账号缓存无法核验，已保留原数据。请勿清除存储，请先联系维护者处理。'; status.value = '缓存校验失败'; return }
   // A submitted answer survives a close/crash as a durable draft and is finalized exactly once.
   try { c = finalizeDraft(c) }
   catch { warning.value = '待同步记录过多，请先同步，再恢复上次答案。'; cache.value = c; refreshLegacy(c.accountId); await sync(); return }
   if (!commit(c)) return
   refreshLegacy(c.accountId)
   status.value = c.pending.length ? '本机有待同步记录' : '账号记录已载入'
   await sync()
  } catch (error) { handleError(error, g) }
 }
 function setAnswer(draft: Draft): boolean {
  if (!ready.value || !cache.value) { warning.value = '请先联网确认微信账号，再开始练习。'; return false }
  const existing = cache.value.draft
  if (existing && (existing.wordId !== draft.wordId || existing.mode !== draft.mode || existing.at !== draft.at)) {
   warning.value = '上次已提交的答案尚未完成保存，请先恢复或同步记录，不会覆盖旧答案。'
   return false
  }
  try {
   if (!commit(setDraft(cache.value, draft))) return false
   status.value = '本机已保存，进入下一题后同步'
   return true
  } catch { warning.value = '本题记录未保存，请重试或先导出备份。'; return false }
 }
 function finishAnswer(): boolean {
  if (!ready.value || !cache.value) return false
  try {
   if (!commit(finalizeDraft(cache.value))) return false
   status.value = cache.value.pending.length ? '本机已保存，等待同步' : '已保存'
   void sync()
   return true
  } catch { warning.value = '无法完成本题保存，可能待同步队列已满。请先同步或导出备份，不要继续下一题。'; return false }
 }
 async function sync(): Promise<void> {
  if (!enabled || !cache.value) return
  const g = generation
  const accountId = cache.value.accountId
  if (running) {
   if (runningGeneration === g) return running
   await running
   if (current(g, accountId)) return sync()
   return
  }
  runningGeneration = g
  const work = async () => {
   try {
    // GET also refreshes an idle account with another device's progress.
    if (current(g, accountId) && !cache.value!.pending.length) {
     status.value = '正在同步…'
     const response = await api.me.get<ServerState>('/me/english/state')
     if (!current(g, accountId)) return
     if (response.accountId !== accountId) { invalidate(g, accountId); return }
     if (!commit(mergeState(cache.value!, response))) return
    }
    while (current(g, accountId) && cache.value!.pending.length) {
     const body = nextBatch(cache.value!, 50)
     status.value = '正在同步…'
     const response = await api.me.post<ServerState>('/me/english/sync', body)
     if (!current(g, accountId)) return
     if (response.accountId !== accountId) { invalidate(g, accountId); return }
     // Merge into the latest cache, not the request snapshot: answers added while awaiting remain queued.
     const merged = mergeState(cache.value!, response)
     const lastSent = body.events[body.events.length - 1].seq
     if (!commit(merged)) return
     if ((merged.server.acknowledged[body.deviceId] || 0) < lastSent) {
      status.value = '同步未确认，本机记录保留'; warning.value = '服务器未确认全部记录，已保留待同步队列，请稍后重试。'; return
     }
    }
    if (current(g, accountId)) status.value = cache.value!.draft ? '本机已保存，进入下一题后同步' : '已同步到当前微信账号'
   } catch (error) { handleError(error, g, accountId) }
  }
  running = work()
  try { await running } finally { running = null; runningGeneration = -1 }
 }
 function close(): void {
  if (cache.value) {
   // The request is bound to this account and begins before generation changes.
   // Late replies are ignored; the durable queue is reconciled on the next verified open.
   try {
    const c = finalizeDraft(cache.value)
    if (commit(c)) void sync()
   } catch { warning.value = '退出时未能完成保存，上次已保存的答案草稿仍会在下次进入恢复。' }
  }
  generation++
  cache.value = null
  legacyAvailable.value = false
  status.value = '请联网确认微信账号'
 }
 async function importLegacy(): Promise<boolean> {
  if (!cache.value || !ready.value || importing) return false
  const g = generation, accountId = cache.value.accountId
  importing = true
  try {
   const claim = readClaim()
   if (claim && claim.accountId !== accountId) { warning.value = '旧版记录已绑定其他微信账号，不能重复导入。'; legacyAvailable.value = false; return false }
   if (claim?.completed) { legacyAvailable.value = false; status.value = '旧记录已导入'; return true }
   const legacy = parseProgress(uni.getStorageSync(STORAGE_KEY))
   if (!Object.keys(legacy.records).length) { legacyAvailable.value = false; return false }
   const confirmed = await new Promise<boolean>(resolve => uni.showModal({
    title: '确认旧记录属于本人', content: '旧版记录没有账号标记，可能属于这台设备的其他使用者。仅当全部记录属于您本人时确认导入当前微信账号。导入只补充云端没有的词条，不覆盖已有记录；原始本机记录保留。',
    confirmText: '属于我，导入', success: result => resolve(!!result.confirm), fail: () => resolve(false)
   }))
   if (!confirmed || !current(g, accountId)) return false
   // Re-read after the modal in case another page has claimed this legacy data.
   const latest = readClaim()
   if (latest && latest.accountId !== accountId) { warning.value = '旧版记录已绑定其他账号，未导入。'; return false }
   const binding = latest || { accountId, importId: uniqueId('legacy-') }
   try { writeStorage(CLAIM_KEY, binding) }
   catch { warning.value = '无法保存导入归属标记，未发送导入请求，请先腾出存储空间。'; return false }
   const response = await api.me.post<ServerState>('/me/english/import', { accountId, importId: binding.importId, progress: legacy })
   if (!current(g, accountId)) return false
   if (response.accountId !== accountId) { invalidate(g, accountId); return false }
   if (!commit(mergeState(cache.value!, response))) return false
   try {
    writeStorage(CLAIM_KEY, { ...binding, completed: true })
    legacyAvailable.value = false
    status.value = '旧记录已导入，原始记录保留'
   } catch {
    legacyAvailable.value = true
    status.value = '已导入，本机完成标记未保存'
    warning.value = '旧记录已导入，但本机完成标记保存失败。可使用同一账号重试，不会重复导入；原始记录保留。'
   }
   void sync()
   return true
  } catch (error) {
   handleError(error, g, accountId)
   if (current(g, accountId) && !(error instanceof ApiError && [400, 409, 413].includes(error.status))) warning.value = '导入暂未确认，原记录保留。仅当前账号可以使用同一标记重试，不会重复导入。'
   return false
  } finally { importing = false }
 }
 function exportData(): string {
  // Never enumerate storage: only the currently verified account is exportable.
  return cache.value ? JSON.stringify({ format: 'english-account-backup-v1', exportedAt: new Date().toISOString(), cache: cache.value }, null, 2) : ''
 }
 return { enabled, cache, progress, ready, status, warning, legacyAvailable, pendingCount, open, close, setAnswer, finishAnswer, sync, importLegacy, exportData }
}
