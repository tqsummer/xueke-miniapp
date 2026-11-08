// All recordings are local, synthetic English speech; no external service.
declare const wx: {
  loadSubpackage(options: {name: string; success: () => void; fail: (error: unknown) => void}): unknown
}
const loaded = new Set<string>()
export function audioPackage(day: number): string {
  if (!Number.isInteger(day) || day < 1 || day > 60) throw new Error('Invalid vocabulary day')
  return 'pkg-english-audio-' + String(Math.ceil(day / 6)).padStart(2, '0')
}
export async function prepareEnglishAudio(word: {id: string; day: number}): Promise<string> {
  const root = audioPackage(word.day)
  if (!/^d\d+-[a-z0-9-]+$/.test(word.id)) throw new Error('Invalid vocabulary id')
  // #ifdef MP-WEIXIN
  if (!loaded.has(root)) {
    await new Promise<void>((resolve, reject) => wx.loadSubpackage({
      name: root,
      success: () => { loaded.add(root); resolve() },
      fail: reject,
    }))
  }
  // #endif
  return '/' + root + '/static/' + word.id + '.mp3'
}
