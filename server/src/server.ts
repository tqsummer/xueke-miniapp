import { existsSync, readFileSync } from 'node:fs'
import { buildApp } from './app.js'
import { openDb, SCHEMA } from './db.js'
import { importData } from './import.js'

// 极简 .env 读取，避免多一个依赖
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

const prod = process.env.NODE_ENV === 'production'
const { WX_APPID, WX_SECRET, JWT_SECRET, DATABASE_URL } = process.env
if (prod && (!WX_APPID || !WX_SECRET || !JWT_SECRET || JWT_SECRET.length < 32 || !DATABASE_URL)) {
  console.error('生产环境必须设置 WX_APPID、WX_SECRET、DATABASE_URL，以及至少 32 位的 JWT_SECRET')
  process.exit(1)
}

async function wxLogin(code: string): Promise<string> {
  if (!WX_APPID || !WX_SECRET) {
    // 开发模式：没有配置小程序密钥时，用 code 直接当作身份
    return 'dev-' + code.slice(0, 40)
  }
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
  const r = (await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json()) as { openid?: string; errcode?: number; errmsg?: string }
  if (!r.openid) throw new Error(`jscode2session 失败: ${r.errcode} ${r.errmsg}`)
  return r.openid
}

const db = await openDb(DATABASE_URL || './.pgdata')
await db.exec(SCHEMA)
const { rows } = await db.query('SELECT count(*)::int AS n FROM wy_articles')
if (rows[0].n === 0) console.log('首次启动，导入数据', await importData(db, process.env.DATA_FILE || '../data/文言文字词数据.json'))

const app = await buildApp({ db, jwtSecret: JWT_SECRET || 'dev-only-secret-do-not-use-in-production', wxLogin, logger: true, cors: !prod })
await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
