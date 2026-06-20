/**
 * 数据库初始化脚本
 * 用法: node scripts/init-db.js
 * 需要先配置 .env 中的 DATABASE_URL
 */
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 手动加载 .env（避免依赖 dotenv）
import { loadEnv } from 'vite'
const env = loadEnv('', process.cwd(), '')
Object.assign(process.env, env)

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('错误: DATABASE_URL 未配置，请在 .env 文件中设置')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

// 逐条执行建表语句
const statements = [
  // 错词本表
  `CREATE TABLE IF NOT EXISTS wrong_words (
    id SERIAL PRIMARY KEY,
    word TEXT NOT NULL,
    word_zh TEXT,
    your_answer TEXT,
    bank_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  // 索引
  `CREATE INDEX IF NOT EXISTS idx_wrong_words_bank ON wrong_words(bank_name)`,
  `CREATE INDEX IF NOT EXISTS idx_wrong_words_created ON wrong_words(created_at DESC)`,
  // 每日统计表
  `CREATE TABLE IF NOT EXISTS daily_stats (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    total INT DEFAULT 0,
    correct INT DEFAULT 0,
    wrong INT DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC)`,
]

console.log(`正在连接 Neon PostgreSQL...`)
console.log(`执行 ${statements.length} 条 SQL 语句...`)

for (const stmt of statements) {
  try {
    await sql.unsafe(stmt)
    const name = stmt.match(/(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i)?.[1] || '?'
    console.log(`  OK: ${name}`)
  } catch (err) {
    console.error(`  FAIL: ${err.message}`)
  }
}

console.log('数据库初始化完成!')
