import pg from 'pg'

export interface DB {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<void>
  close(): Promise<void>
}

// postgres:// 连接真实数据库；其余情况用内嵌的 PGlite（开发与测试）
export async function openDb(url?: string): Promise<DB> {
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const pool = new pg.Pool({ connectionString: url, max: 10 })
    return {
      query: (sql, params) => pool.query(sql, params as any[]) as any,
      exec: async (sql) => { await pool.query(sql) },
      close: () => pool.end(),
    }
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const lite = new PGlite(url || undefined)
  return {
    query: (sql, params) => lite.query(sql, params as any[]) as any,
    exec: async (sql) => { await lite.exec(sql) },
    close: () => lite.close(),
  }
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS subjects (id text PRIMARY KEY, name text NOT NULL, sort int NOT NULL, online boolean NOT NULL);
CREATE TABLE IF NOT EXISTS modules (id text PRIMARY KEY, subject_id text NOT NULL REFERENCES subjects(id), name text NOT NULL, glyph text NOT NULL, intro text NOT NULL, sort int NOT NULL, online boolean NOT NULL);

CREATE TABLE IF NOT EXISTS wy_articles (id int PRIMARY KEY, title text NOT NULL, source text NOT NULL, notes text NOT NULL, mark_count int NOT NULL);
CREATE TABLE IF NOT EXISTS wy_sentences (id text PRIMARY KEY, article_id int NOT NULL REFERENCES wy_articles(id), idx int NOT NULL, classical text NOT NULL, modern text NOT NULL, marks jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS wy_sentences_article ON wy_sentences(article_id, idx);
CREATE TABLE IF NOT EXISTS wy_entries (word text PRIMARY KEY, count int NOT NULL, sort int NOT NULL);
CREATE TABLE IF NOT EXISTS wy_senses (id int PRIMARY KEY, word text NOT NULL REFERENCES wy_entries(word), idx int NOT NULL, meaning text NOT NULL, pos text NOT NULL, hint text NOT NULL);
CREATE TABLE IF NOT EXISTS wy_examples (id int PRIMARY KEY, sense_id int NOT NULL REFERENCES wy_senses(id), word text NOT NULL, idx int NOT NULL, sentence_id text NOT NULL REFERENCES wy_sentences(id), gloss text NOT NULL, snippet text NOT NULL, snippet_offset int NOT NULL, sentence_offset int NOT NULL);
CREATE INDEX IF NOT EXISTS wy_examples_sense ON wy_examples(sense_id, idx);
CREATE TABLE IF NOT EXISTS wy_modern (modern text NOT NULL, word text NOT NULL, sense text NOT NULL, sort int NOT NULL);
CREATE TABLE IF NOT EXISTS wy_topics (type text PRIMARY KEY, items jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS users (id serial PRIMARY KEY, openid text UNIQUE NOT NULL, nickname text, avatar text, last_subject text, last_read jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS favorites (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES users(id), kind text NOT NULL, ref text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, kind, ref));
CREATE TABLE IF NOT EXISTS search_history (id serial PRIMARY KEY, user_id int NOT NULL REFERENCES users(id), q text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS search_history_user ON search_history(user_id, id DESC);
`

export async function insertMany(db: DB, table: string, cols: string[], rows: unknown[][]) {
  const size = Math.max(1, Math.floor(1000 / cols.length))
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size)
    const params: unknown[] = []
    const tuples = chunk.map((r) => '(' + r.map((v) => { params.push(v); return '$' + params.length }).join(',') + ')')
    await db.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')}`, params)
  }
}
