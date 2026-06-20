/**
 * Cloudflare Pages Function: /api/stats
 *
 * GET  - 查询当前用户的每日统计（?userId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD）
 * POST - 更新/插入当日统计 body: { userId, date, total, correct, wrong }
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

// GET /api/stats?userId=xxx&from=2026-06-01&to=2026-06-20
export async function onRequestGet(context) {
  try {
    const sql = getDb(context.env)
    const url = new URL(context.request.url)
    const userId = url.searchParams.get('userId')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    if (!userId) {
      return json({ error: '缺少 userId 参数' }, 400)
    }

    let query, params
    if (from && to) {
      query = 'SELECT * FROM daily_stats WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date ASC'
      params = [userId, from, to]
    } else if (from) {
      query = 'SELECT * FROM daily_stats WHERE user_id = $1 AND date >= $2 ORDER BY date ASC'
      params = [userId, from]
    } else {
      // 默认最近 30 天
      query = 'SELECT * FROM daily_stats WHERE user_id = $1 ORDER BY date DESC LIMIT 30'
      params = [userId]
    }

    const rows = await sql.query(query, params)

    // 转换为 { 'YYYY-MM-DD': { total, correct, wrong } } 格式
    const stats = {}
    for (const row of rows) {
      const dateKey = typeof row.date === 'string'
        ? row.date.slice(0, 10)
        : new Date(row.date).toISOString().slice(0, 10)
      stats[dateKey] = {
        total: row.total,
        correct: row.correct,
        wrong: row.wrong,
      }
    }

    return json({ data: stats })
  } catch (err) {
    console.error('[stats GET]', err.message)
    return json({ error: err.message }, 500)
  }
}

// POST /api/stats  body: { userId, date, total, correct, wrong }
// 使用 UPSERT：如果当日已有记录，则累加
export async function onRequestPost(context) {
  try {
    const sql = getDb(context.env)
    const body = await context.request.json()

    if (!body.userId) {
      return json({ error: '缺少 userId' }, 400)
    }
    if (!body.date) {
      return json({ error: '缺少必填字段: date' }, 400)
    }

    const { userId, date, total = 0, correct = 0, wrong = 0 } = body

    // UPSERT: 存在则累加，不存在则插入
    const result = await sql.query(
      `INSERT INTO daily_stats (user_id, date, total, correct, wrong)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, date) DO UPDATE SET
         total = daily_stats.total + $3,
         correct = daily_stats.correct + $4,
         wrong = daily_stats.wrong + $5
       RETURNING *`,
      [userId, date, total, correct, wrong]
    )

    return json({ success: true, data: result[0] })
  } catch (err) {
    console.error('[stats POST]', err.message)
    return json({ error: err.message }, 500)
  }
}
