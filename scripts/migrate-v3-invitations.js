/**
 * 数据库迁移脚本 - 直接在 Neon PostgreSQL 执行
 * 用法: node scripts/migrate-v3-invitations.js
 *
 * 迁移内容:
 * 1. 创建 invitation_uses 表（支持邀请码多次使用）
 * 2. 重置所有 invitations 的 is_active = true
 * 3. 将旧 used_by 数据迁移到 invitation_uses
 * 4. user_word_banks 添加 allow_import 字段
 */

import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env')

// 手动解析 .env
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx > 0) {
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    env[key] = val
  }
}

const DATABASE_URL = env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 未在 .env 中配置')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

async function migrate() {
  console.log('🚀 开始数据库迁移...\n')

  // 1. 创建 invitation_uses 表
  console.log('📋 [1/6] 创建 invitation_uses 表...')
  try {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS invitation_uses (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL,
        used_by TEXT NOT NULL,
        used_by_email TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await sql.query(`CREATE INDEX IF NOT EXISTS idx_invitation_uses_code ON invitation_uses(code)`)
    await sql.query(`CREATE INDEX IF NOT EXISTS idx_invitation_uses_used_by ON invitation_uses(used_by)`)
    console.log('   ✅ invitation_uses 表已就绪')
  } catch (err) {
    console.warn('   ⚠️', err.message)
  }

  // 2. 重置所有邀请码为活跃状态
  console.log('🔄 [2/6] 重置邀请码 is_active...')
  try {
    const result = await sql.query(`UPDATE invitations SET is_active = true WHERE is_active = false`)
    console.log(`   ✅ 已重置 ${result.count || 0} 个邀请码为活跃状态`)
  } catch (err) {
    console.warn('   ⚠️', err.message)
  }

  // 3. 迁移旧 used_by 数据到 invitation_uses
  console.log('📦 [3/6] 迁移旧邀请记录...')
  try {
    const oldUses = await sql.query(
      `SELECT code, used_by, used_by_email FROM invitations WHERE used_by IS NOT NULL AND used_by != ''`
    )
    let migrated = 0
    for (const row of oldUses) {
      const existing = await sql.query(
        'SELECT id FROM invitation_uses WHERE code = $1 AND used_by = $2',
        [row.code, row.used_by]
      )
      if (existing.length === 0) {
        await sql.query(
          'INSERT INTO invitation_uses (code, used_by, used_by_email) VALUES ($1, $2, $3)',
          [row.code, row.used_by, row.used_by_email || null]
        )
        migrated++
      }
    }
    console.log(`   ✅ 已迁移 ${migrated} 条旧邀请记录`)
  } catch (err) {
    console.warn('   ⚠️', err.message)
  }

  // 4. 清空旧 used_by 字段
  console.log('🧹 [4/6] 清空旧 used_by 字段...')
  try {
    await sql.query(`UPDATE invitations SET used_by = NULL, used_by_email = NULL, used_at = NULL WHERE used_by IS NOT NULL`)
    console.log('   ✅ 旧字段已清空')
  } catch (err) {
    console.warn('   ⚠️', err.message)
  }

  // 5. user_word_banks 添加 allow_import 字段
  console.log('➕ [5/6] 添加 allow_import 字段...')
  try {
    await sql.query(`ALTER TABLE user_word_banks ADD COLUMN IF NOT EXISTS allow_import BOOLEAN DEFAULT true`)
    console.log('   ✅ allow_import 字段已添加')
  } catch (err) {
    console.warn('   ⚠️', err.message)
  }

  // 6. 验证结果
  console.log('\n📊 [6/6] 验证迁移结果...')
  try {
    const invCount = await sql.query('SELECT COUNT(*) as c FROM invitations')
    const activeCount = await sql.query('SELECT COUNT(*) as c FROM invitations WHERE is_active = true')
    const usesCount = await sql.query('SELECT COUNT(*) as c FROM invitation_uses')
    console.log(`   邀请码总数: ${invCount[0].c}`)
    console.log(`   活跃邀请码: ${activeCount[0].c}`)
    console.log(`   使用记录数: ${usesCount[0].c}`)

    // 验证一个具体的邀请码
    if (invCount[0].c > 0) {
      const sample = await sql.query('SELECT code, is_active FROM invitations LIMIT 1')
      const code = sample[0].code
      const validation = await sql.query(
        'SELECT * FROM invitations WHERE code = $1 AND is_active = true',
        [code]
      )
      console.log(`   测试邀请码 ${code}: ${validation.length > 0 ? '✅ 有效' : '❌ 无效'}`)
    }
  } catch (err) {
    console.warn('   ⚠️ 验证失败:', err.message)
  }

  console.log('\n✅ 迁移完成！')
}

migrate().catch(err => {
  console.error('❌ 迁移失败:', err)
  process.exit(1)
})
