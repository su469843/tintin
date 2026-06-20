/**
 * Cloudflare Pages Function: /api/wrong-words/review
 *
 * GET - 获取当前用户的错词（打乱顺序），用于复习听写
 *
 * 参数: ?userId=xxx&bank=
 * 返回格式: { data: [...], total: number }
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

// Fisher-Yates 洗牌
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// GET /api/wrong-words/review?userId=xxx&bank=
export async function onRequestGet(context) {
  try {
    const sql = getDb(context.env)
    const url = new URL(context.request.url)
    const userId = url.searchParams.get('userId')
    const bank = url.searchParams.get('bank')

    if (!userId) {
      return json({ error: '缺少 userId 参数' }, 400)
    }

    let query, params
    if (bank) {
      query = 'SELECT * FROM wrong_words WHERE user_id = $1 AND bank_name = $2 ORDER BY created_at DESC'
      params = [userId, bank]
    } else {
      query = 'SELECT * FROM wrong_words WHERE user_id = $1 ORDER BY created_at DESC'
      params = [userId]
    }

    const rows = await sql.query(query, params)
    // 去重：同一个 word 只保留最新的一条
    const seen = new Set()
    const unique = []
    for (const row of rows) {
      if (!seen.has(row.word)) {
        seen.add(row.word)
        unique.push(row)
      }
    }

    // 打乱顺序
    const shuffled = shuffle(unique)

    return json({ data: shuffled, total: shuffled.length })
  } catch (err) {
    console.error('[review GET]', err.message)
    return json({ error: err.message }, 500)
  }
}
