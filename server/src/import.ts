import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DB, SCHEMA, insertMany, openDb } from './db.js'

const SUBJECTS = [
  ['yuwen', '语文', 1, true], ['shuxue', '数学', 2, false], ['yingyu', '英语', 3, false], ['wuli', '物理', 4, false], ['huaxue', '化学', 5, false],
]
const MODULES = [
  ['wenyan', 'yuwen', '文言文', '文', '100 篇原文对译 · 121 个重点字', 1, true],
  ['shici', 'yuwen', '古诗词', '诗', '背诵默写', 2, false],
  ['yuedu', 'yuwen', '阅读理解', '读', '课内与课外', 3, false],
  ['mingzhu', 'yuwen', '名著导读', '著', '14 本', 4, false],
]

// 可重复执行：内容表整体重建，用户数据不动
export async function importData(db: DB, file: string) {
  const d = JSON.parse(readFileSync(file, 'utf8'))
  const sentences: unknown[][] = []
  await db.exec(SCHEMA)
  await db.exec('BEGIN')
  try {
    await db.exec('TRUNCATE wy_modern, wy_topics, wy_examples, wy_senses, wy_entries, wy_sentences, wy_articles, modules, subjects CASCADE')
    await insertMany(db, 'subjects', ['id', 'name', 'sort', 'online'], SUBJECTS)
    await insertMany(db, 'modules', ['id', 'subject_id', 'name', 'glyph', 'intro', 'sort', 'online'], MODULES)
    await insertMany(db, 'wy_articles', ['id', 'title', 'source', 'notes', 'mark_count'],
      d.articles.map((a: any) => [a.id, a.title, a.source, a.notes, a.sentences.reduce((n: number, s: any) => n + s.marks.length, 0)]))
    for (const a of d.articles) a.sentences.forEach((s: any, i: number) => sentences.push([s.id, a.id, i, s.classical, s.modern, JSON.stringify(s.marks)]))
    await insertMany(db, 'wy_sentences', ['id', 'article_id', 'idx', 'classical', 'modern', 'marks'], sentences)
    await insertMany(db, 'wy_entries', ['word', 'count', 'sort'], d.entries.map((e: any, i: number) => [e.word, e.count, i]))
    const senses: unknown[][] = []; const examples: unknown[][] = []
    for (const e of d.entries) e.senses.forEach((s: any, i: number) => {
      const sid = senses.length + 1
      senses.push([sid, e.word, i, s.meaning, s.pos, s.hint])
      s.examples.forEach((x: any, j: number) => examples.push([examples.length + 1, sid, e.word, j, x.sentence, x.gloss, x.snippet, x.snippet_offset, x.sentence_offset]))
    })
    await insertMany(db, 'wy_senses', ['id', 'word', 'idx', 'meaning', 'pos', 'hint'], senses)
    await insertMany(db, 'wy_examples', ['id', 'sense_id', 'word', 'idx', 'sentence_id', 'gloss', 'snippet', 'snippet_offset', 'sentence_offset'], examples)
    const modern: unknown[][] = []
    d.modern_to_classical.forEach((m: any, i: number) => m.classical.forEach((c: any) => modern.push([m.modern, c.word, c.sense, i])))
    await insertMany(db, 'wy_modern', ['modern', 'word', 'sense', 'sort'], modern)
    await insertMany(db, 'wy_topics', ['type', 'items'], [
      ['tongjia', JSON.stringify(d.tongjia)], ['huoyong', JSON.stringify(d.huoyong)], ['gujin', JSON.stringify(d.gujin)],
    ])
    await db.exec('COMMIT')
  } catch (e) {
    await db.exec('ROLLBACK')
    throw e
  }
  return { articles: d.articles.length, sentences: sentences.length, entries: d.entries.length }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = await openDb(process.env.DATABASE_URL || './.pgdata')
  const r = await importData(db, process.env.DATA_FILE || '../data/文言文字词数据.json')
  console.log('导入完成', r)
  await db.close()
}
