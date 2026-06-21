import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env', 'utf-8')
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

const sql = neon(env.DATABASE_URL)

// 检查 NCXU8X3J
console.log('=== 检查 NCXU8X3J ===')
const r = await sql.query("SELECT code, is_active, used_by FROM invitations WHERE code = 'NCXU8X3J'")
console.log('结果:', JSON.stringify(r, null, 2))

const u = await sql.query("SELECT * FROM invitation_uses WHERE code = 'NCXU8X3J'")
console.log('使用记录:', JSON.stringify(u, null, 2))

// 所有邀请码
console.log('\n=== 所有邀请码 ===')
const all = await sql.query('SELECT code, is_active, used_by FROM invitations ORDER BY created_at DESC')
all.forEach(i => console.log(`  ${i.code}  active=${i.is_active}  used_by=${i.used_by || 'null'}`))

// 所有使用记录
console.log('\n=== 使用记录 ===')
const uses = await sql.query('SELECT * FROM invitation_uses ORDER BY created_at DESC')
uses.forEach(u => console.log(`  code=${u.code}  used_by=${u.used_by}  at=${u.created_at}`))
