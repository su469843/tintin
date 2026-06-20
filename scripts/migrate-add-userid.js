/**
 * 数据库迁移脚本：为现有表添加 user_id 列
 * 用法: node scripts/migrate-add-userid.js
 * 需要先配置 .env 中的 DATABASE_URL
 */
import { neon } from '@neondatabase/serverless'
import { loadEnv } from 'vite'

// 手动加载 .env
const env = loadEnv('', process.cwd(), '')
Object.assign(process.env, env)

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('错误: DATABASE_URL 未配置，请在 .env 文件中设置')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

async function migrate() {
  console.log('正在连接数据库...\n')

  const migrations = [
    // 1. 给 wrong_words 表添加 user_id 列（允许为空，后续再设为必填）
    {
      name: 'wrong_words 添加 user_id 列',
      sql: `ALTER TABLE wrong_words ADD COLUMN IF NOT EXISTS user_id TEXT`,
    },
    // 2. 给 daily_stats 表添加 user_id 列
    {
      name: 'daily_stats 添加 user_id 列',
      sql: `ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS user_id TEXT`,
    },
    // 3. 删除旧的 date 唯一约束，添加 (user_id, date) 唯一约束
    {
      name: 'daily_stats 更新唯一约束',
      sql: `
        ALTER TABLE daily_stats DROP CONSTRAINT IF EXISTS daily_stats_date_key;
        ALTER TABLE daily_stats DROP CONSTRAINT IF EXISTS daily_stats_user_id_date_key;
        ALTER TABLE daily_stats ADD CONSTRAINT daily_stats_user_id_date_key UNIQUE (user_id, date);
      `,
    },
    // 4. 添加索引
    {
      name: '添加 user_id 索引',
      sql: `
        CREATE INDEX IF NOT EXISTS idx_wrong_words_user ON wrong_words(user_id);
        CREATE INDEX IF NOT EXISTS idx_wrong_words_user_bank ON wrong_words(user_id, bank_name);
        CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, date DESC);
      `,
    },
  ]

  let success = 0
  let failed = 0

  for (const m of migrations) {
    try {
      await sql.query(m.sql)
      console.log(`✓ ${m.name}`)
      success++
    } catch (err) {
      console.error(`✗ ${m.name}: ${err.message}`)
      failed++
    }
  }

  console.log(`\n迁移完成: ${success} 成功, ${failed} 失败`)

  // 显示当前表结构
  console.log('\n当前表结构:')
  const tables = await sql.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `)
  for (const row of tables) {
    console.log(`  ${row.table_name}.${row.column_name} (${row.data_type}, nullable=${row.is_nullable})`)
  }
}

migrate().catch(console.error)
