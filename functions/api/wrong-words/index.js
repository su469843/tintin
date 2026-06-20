/**
 * Cloudflare Pages Function: /api/wrong-words
 *
 * GET    - 查询当前用户的错词列表（?userId=&bank=&limit=）
 * POST   - 添加错词记录 body: { userId, word, wordZh?, yourAnswer?, bankName? }
 * DELETE - 删除错词 body: { userId, ids?: [1,2,3] } 或不传 ids 清空该用户全部
 *
 * 环境变量: DATABASE_URL (Neon PostgreSQL)
 */
import { neon } from '@neondatabase/serverless'

function getDb(env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未配置')
  }
  return neon(env.DATABASE_URL)
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// GET /api/wrong-words?userId=xxx&bank=&limit=
export async function onRequestGet(context) {
  try {
    const sql = getDb(context.env)
    const url = new URL(context.request.url)
    const userId = url.searchParams.get('userId')
    const bank = url.searchParams.get('bank')
    const limit = parseInt(url.searchParams.get('limit') || '200')

    if (!userId) {
      return json({ error: '缺少 userId 参数' }, 400)
    }

    let query, params
    if (bank) {
      query = 'SELECT * FROM wrong_words WHERE user_id = $1 AND bank_name = $2 ORDER BY created_at DESC LIMIT $3'
      params = [userId, bank, limit]
    } else {
      query = 'SELECT * FROM wrong_words WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2'
      params = [userId, limit]
    }

    const rows = await sql.query(query, params)
    return json({ data: rows, total: rows.length })
  } catch (err) {
    console.error('[wrong-words GET]', err.message)
    return json({ error: err.message }, 500)
  }
}

// POST /api/wrong-words  body: { userId, word, wordZh?, yourAnswer?, bankName? }
export async function onRequestPost(context) {
  try {
    const sql = getDb(context.env)
    const body = await context.request.json()

    if (!body.userId) {
      return json({ error: '缺少 userId' }, 400)
    }
    if (!body.word) {
      return json({ error: '缺少必填字段: word' }, 400)
    }

    const result = await sql.query(
      `INSERT INTO wrong_words (user_id, word, word_zh, your_answer, bank_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [body.userId, body.word, body.wordZh || null, body.yourAnswer || null, body.bankName || null]
    )

    return json({ success: true, id: result[0]?.id }, 201)
  } catch (err) {
    console.error('[wrong-words POST]', err.message)
    return json({ error: err.message }, 500)
  }
}

// DELETE /api/wrong-words  body: { userId, ids?: [1,2,3] }
export async function onRequestDelete(context) {
  try {
    const sql = getDb(context.env)

    let body = {}
    try {
      body = await context.request.json()
    } catch {
      // body 为空
    }

    if (!body.userId) {
      return json({ error: '缺少 userId' }, 400)
    }

    let result
    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      result = await sql.query(
        'DELETE FROM wrong_words WHERE user_id = $1 AND id = ANY($2)',
        [body.userId, body.ids]
      )
    } else {
      // 清空该用户的全部错词
      result = await sql.query('DELETE FROM wrong_words WHERE user_id = $1', [body.userId])
    }

    return json({ success: true, deleted: result?.count ?? 0 })
  } catch (err) {
    console.error('[wrong-words DELETE]', err.message)
    return json({ error: err.message }, 500)
  }
}
