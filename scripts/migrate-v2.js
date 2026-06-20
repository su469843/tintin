/**
 * 数据库迁移脚本：添加邀请码表 + 用户词库表
 * 用法: node scripts/migrate-v2.js
 */
import { neon } from '@neondatabase/serverless'
import { loadEnv } from 'vite'

const env = loadEnv('', process.cwd(), '')
Object.assign(process.env, env)

const sql = neon(process.env.DATABASE_URL)

async function migrate() {
  console.log('迁移 v2: 邀请码 + 用户词库...\n')

  const steps = [
    // ============================================================
    // 邀请码表
    // ============================================================
    [
      '创建 invitations 表',
      `CREATE TABLE IF NOT EXISTS invitations (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL,
        used_by TEXT,
        used_by_email TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        used_at TIMESTAMPTZ
      )`
    ],
    [
      '邀请码索引',
      `CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);
       CREATE INDEX IF NOT EXISTS idx_invitations_created_by ON invitations(created_by);`
    ],

    // ============================================================
    // 用户词库表（用户自己上传的词库）
    // ============================================================
    [
      '创建 user_word_banks 表',
      `CREATE TABLE IF NOT EXISTS user_word_banks (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        lang TEXT NOT NULL DEFAULT 'en',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, name)
      )`
    ],
    [
      '词库索引',
      `CREATE INDEX IF NOT EXISTS idx_user_word_banks_user ON user_word_banks(user_id);`
    ],

    // ============================================================
    // 词库单词表
    // ============================================================
    [
      '创建 user_words 表',
      `CREATE TABLE IF NOT EXISTS user_words (
        id SERIAL PRIMARY KEY,
        bank_id INT NOT NULL REFERENCES user_word_banks(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        translation TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`
    ],
    [
      '单词索引',
      `CREATE INDEX IF NOT EXISTS idx_user_words_bank ON user_words(bank_id);`
    ],
  ]

  let success = 0
  let failed = 0

  for (const [name, query] of steps) {
    try {
      await sql.query(query)
      console.log(`✓ ${name}`)
      success++
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`)
      failed++
    }
  }

  console.log(`\n迁移完成: ${success} 成功, ${failed} 失败`)

  // 显示所有表
  console.log('\n当前数据库表:')
  const tables = await sql.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `)
  for (const row of tables) {
    console.log(`  - ${row.table_name}`)
  }
}

migrate().catch(console.error)
