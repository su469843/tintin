/**
 * Cloudflare Pages Function: /api/invitations
 *
 * GET  ?code=xxx  - 验证邀请码是否有效
 * GET  ?userId=xxx - 获取用户的邀请码信息（code + 已邀请人数 + 剩余名额）
 * POST body: { userId } - 获取或创建邀请码（每人固定一个）
 * PUT  body: { code, userId, email } - 使用邀请码
 *
 * 环境变量: DATABASE_URL (Neon PostgreSQL)
 * 限制: 每人最多邀请 3 人
 */
import { neon } from '@neondatabase/serverless'

const MAX_INVITES = 3

function getDb(env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL 未配置')
  return neon(env.DATABASE_URL)
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** 生成 8 位随机邀请码 */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// GET /api/invitations?code=xxx  验证邀请码是否有效
// GET /api/invitations?userId=xxx  获取用户的邀请码信息
export async function onRequestGet(context) {
  try {
    const sql = getDb(context.env)
    const url = new URL(context.request.url)
    const code = url.searchParams.get('code')
    const userId = url.searchParams.get('userId')

    // 按 code 验证
    if (code) {
      const rows = await sql.query(
        'SELECT * FROM invitations WHERE code = $1 AND is_active = true',
        [code.toUpperCase()]
      )
      if (rows.length === 0) {
        return json({ valid: false, message: '邀请码无效或已禁用' })
      }
      // 检查已使用次数
      const uses = await sql.query(
        'SELECT COUNT(*) as count FROM invitation_uses WHERE code = $1',
        [code.toUpperCase()]
      )
      const useCount = uses[0]?.count || 0
      if (useCount >= MAX_INVITES) {
        return json({ valid: false, message: '该邀请码已达到使用上限' })
      }
      return json({ valid: true, created_by: rows[0].created_by })
    }

    // 按 userId 获取邀请码信息
    if (userId) {
      // 查找该用户的邀请码
      const codes = await sql.query(
        'SELECT * FROM invitations WHERE created_by = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      )

      // 统计已邀请人数（从 invitation_uses 表）
      const uses = await sql.query(
        'SELECT COUNT(*) as count FROM invitation_uses WHERE code IN (SELECT code FROM invitations WHERE created_by = $1)',
        [userId]
      )
      const usedCount = uses[0]?.count || 0
      const remaining = MAX_INVITES - usedCount

      if (codes.length === 0) {
        return json({ hasCode: false, usedCount, remaining })
      }

      return json({
        hasCode: true,
        code: codes[0].code,
        isActive: codes[0].is_active,
        usedCount,
        remaining: Math.max(0, remaining),
      })
    }

    return json({ error: '缺少 code 或 userId 参数' }, 400)
  } catch (err) {
    console.error('[invitations GET]', err.message)
    return json({ error: err.message }, 500)
  }
}

// POST /api/invitations  body: { userId }
// 获取或创建邀请码（每人固定一个）
export async function onRequestPost(context) {
  try {
    const sql = getDb(context.env)
    const body = await context.request.json()

    if (!body.userId) {
      return json({ error: '缺少 userId' }, 400)
    }

    // 检查是否已有邀请码
    const existing = await sql.query(
      'SELECT * FROM invitations WHERE created_by = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
      [body.userId]
    )

    if (existing.length > 0) {
      return json({ success: true, code: existing[0].code, reused: true })
    }

    // 创建新邀请码
    let code
    let attempts = 0
    do {
      code = generateCode()
      const conflict = await sql.query('SELECT id FROM invitations WHERE code = $1', [code])
      if (conflict.length === 0) break
      attempts++
    } while (attempts < 10)

    await sql.query(
      'INSERT INTO invitations (code, created_by) VALUES ($1, $2)',
      [code, body.userId]
    )

    return json({ success: true, code, reused: false }, 201)
  } catch (err) {
    console.error('[invitations POST]', err.message)
    return json({ error: err.message }, 500)
  }
}

// PUT /api/invitations  body: { code, userId, email }  使用邀请码
export async function onRequestPut(context) {
  try {
    const sql = getDb(context.env)
    const body = await context.request.json()

    if (!body.code || !body.userId) {
      return json({ error: '缺少 code 或 userId' }, 400)
    }

    // 查询邀请码
    const rows = await sql.query(
      'SELECT * FROM invitations WHERE code = $1 AND is_active = true',
      [body.code.toUpperCase()]
    )

    if (rows.length === 0) {
      return json({ error: '邀请码无效或已禁用' }, 400)
    }

    // 检查该创建者是否已达到邀请上限
    const uses = await sql.query(
      'SELECT COUNT(*) as count FROM invitation_uses WHERE code = $1',
      [body.code.toUpperCase()]
    )

    if ((uses[0]?.count || 0) >= MAX_INVITES) {
      return json({ error: '该邀请码已达到使用上限' }, 400)
    }

    // 检查是否自己用自己的邀请码
    if (rows[0].created_by === body.userId) {
      return json({ error: '不能用自己的邀请码注册' }, 400)
    }

    // 检查是否已经用过该邀请码
    const alreadyUsed = await sql.query(
      'SELECT * FROM invitation_uses WHERE code = $1 AND used_by = $2',
      [body.code.toUpperCase(), body.userId]
    )
    if (alreadyUsed.length > 0) {
      return json({ error: '你已经用过该邀请码' }, 400)
    }

    // 记录使用（不将邀请码标记为已失效）
    await sql.query(
      'INSERT INTO invitation_uses (code, used_by, used_by_email) VALUES ($1, $2, $3)',
      [body.code.toUpperCase(), body.userId, body.email || null]
    )

    return json({ success: true })
  } catch (err) {
    console.error('[invitations PUT]', err.message)
    return json({ error: err.message }, 500)
  }
}
