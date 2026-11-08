import type { Word } from './words'
export type Mode = 'zh-en' | 'en-zh'
export interface RecordItem { correct: number; wrong: number; streak: number; due: number; last: number; mistake: boolean }
export type Progress = { version: 1; records: Record<string, RecordItem> }
export const STORAGE_KEY = 'english-day12-progress-v1'
export const emptyProgress = (): Progress => ({ version: 1, records: {} })
export const keyOf = (id: string, mode: Mode) => id + ':' + mode
export function normalizeEnglish(value: string) {
 return value.normalize('NFKC').trim().replace(/[’‘]/g, "'").replace(/…/g, '...').replace(/\s+/g, ' ').toLowerCase()
}
export function normalizeChinese(value: string) { return value.normalize('NFKC').replace(/[\s，,。.;；!！?？]/g, '').trim() }
export function judge(word: Word, mode: Mode, input: string) {
 if (!input.trim()) return false
 if (mode === 'zh-en') return word.acceptedEnglish.some(v => normalizeEnglish(v) === normalizeEnglish(input))
 // Only exact listed meanings, never substring matching. Multiple meanings may be separated.
 const tokens = input.split(/[;；、,，\n]+/).filter(s => s.trim())
 const accepted = word.acceptedChinese.map(normalizeChinese)
 return tokens.length > 0 && tokens.every(t => accepted.includes(normalizeChinese(t)))
}
export function updateRecord(old: RecordItem | undefined, correct: boolean, now: number): RecordItem {
 const streak = correct ? Math.min((old?.streak || 0) + 1, 5) : 0
 const days = [1, 3, 7, 14, 30]
 return { correct: (old?.correct || 0) + Number(correct), wrong: (old?.wrong || 0) + Number(!correct), streak,
  due: now + (correct ? days[streak - 1] * 86400000 : 600000), last: now, mistake: !correct }
}
export function parseProgress(value: unknown): Progress {
 if (value === '' || value === undefined || value === null) return emptyProgress()
 const p = typeof value === 'string' ? JSON.parse(value) : value
 if (!p || p.version !== 1 || !p.records || typeof p.records !== 'object' || Array.isArray(p.records)) throw new Error('invalid progress')
 for (const r of Object.values(p.records) as any[]) {
  if (!r || !['correct','wrong','streak','due','last'].every(k => Number.isFinite(r[k]) && r[k] >= 0) ||
   r.streak > 5 || typeof r.mistake !== 'boolean') throw new Error('invalid progress')
 }
 return p
}
export function selectWords(words: Word[], day: number, mode: Mode, kind: 'all'|'mistakes'|'due', progress: Progress, now: number) {
 return words.filter(w => {
  if (day && w.day !== day) return false
  const r = progress.records[keyOf(w.id, mode)]
  return kind === 'all' || (kind === 'mistakes' ? !!r?.mistake : !!r && r.due <= now)
 })
}
export function shuffle<T>(values: T[], random = Math.random) {
 const result = [...values]
 for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i+1)); [result[i],result[j]]=[result[j],result[i]] }
 return result
}
