/**
 * Cloudflare Pages Function: /api/profiles
 *
 * POST body: { userId, name } - 创建用户资料（含 display_id）
 * GET  ?userId=xxx            - 获取用户资料
 * GET  ?displayId=xxx         - 按 8 位数字 ID 查找用户
 */
import { neon } from '@neondatabase/serverless'

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

/** 生成 8 位数字 ID */
async function generateDisplayId(sql) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = String(10000000 + Math.floor(Math.random() * 90000000))
    const exist = await sql.query('SELECT id FROM profiles WHERE display_id = $1', [id])
    if (exist.length === 0) return id
  }
  throw new Error('无法生成唯一 display_id')
}

export async function onRequestPost(context) {
  try {
    const sql = getDb(context.env)
    const body = await context.request.json()

    if (!body.userId) {
      return json({ error: '缺少 userId' }, 400)
    }

    // 检查是否已有 profile
    const existing = await sql.query('SELECT * FROM profiles WHERE id = $1', [body.userId])
    if (existing.length > 0) {
      return json({ data: existing[0], existed: true })
    }

    // 生成 8 位数字 ID
    const displayId = await generateDisplayId(sql)

    await sql.query(
      'INSERT INTO profiles (id, display_id, name) VALUES ($1, $2, $3)',
      [body.userId, displayId, body.name || '']
    )

    return json({ data: { id: body.userId, display_id: displayId, name: body.name || '' } }, 201)
  } catch (err) {
    console.error('[profiles POST]', err.message)
    return json({ error: err.message }, 500)
  }
}

export async function onRequestGet(context) {
  try {
    const sql = getDb(context.env)
    const url = new URL(context.request.url)
    const userId = url.searchParams.get('userId')
    const displayId = url.searchParams.get('displayId')

    if (userId) {
      const rows = await sql.query('SELECT * FROM profiles WHERE id = $1', [userId])
      return json({ data: rows[0] || null })
    }

    if (displayId) {
      const rows = await sql.query('SELECT * FROM profiles WHERE display_id = $1', [displayId])
      return json({ data: rows[0] || null })
    }

    return json({ error: '缺少 userId 或 displayId' }, 400)
  } catch (err) {
    console.error('[profiles GET]', err.message)
    return json({ error: err.message }, 500)
  }
}
