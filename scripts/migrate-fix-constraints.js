/**
 * 数据库迁移脚本：修复约束和索引
 */
import { neon } from '@neondatabase/serverless'
import { loadEnv } from 'vite'

const env = loadEnv('', process.cwd(), '')
Object.assign(process.env, env)

const sql = neon(process.env.DATABASE_URL)

async function migrate() {
  console.log('修复约束和索引...\n')

  const steps = [
    ['删除旧 date 唯一约束', `ALTER TABLE daily_stats DROP CONSTRAINT IF EXISTS daily_stats_date_key`],
    ['删除旧 user_id_date 约束', `ALTER TABLE daily_stats DROP CONSTRAINT IF EXISTS daily_stats_user_id_date_key`],
    ['添加 (user_id, date) 唯一约束', `ALTER TABLE daily_stats ADD CONSTRAINT daily_stats_user_id_date_key UNIQUE (user_id, date)`],
    ['添加 wrong_words user 索引', `CREATE INDEX IF NOT EXISTS idx_wrong_words_user ON wrong_words(user_id)`],
    ['添加 wrong_words user_bank 索引', `CREATE INDEX IF NOT EXISTS idx_wrong_words_user_bank ON wrong_words(user_id, bank_name)`],
    ['添加 daily_stats user_date 索引', `CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, date DESC)`],
  ]

  for (const [name, query] of steps) {
    try {
      await sql.query(query)
      console.log(`✓ ${name}`)
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`)
    }
  }
  console.log('\n完成!')
}

migrate().catch(console.error)
