/**
 * Vite 插件：本地开发用数据库 API 中间件
 * 将 /api/wrong-words 和 /api/stats 请求代理到 Neon PostgreSQL
 *
 * 所有请求需要 userId 参数，按用户隔离数据
 * 仅用于 npm run dev，生产环境由 Cloudflare Pages Functions 处理
 */
import { neon } from '@neondatabase/serverless'

function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[DB Plugin] DATABASE_URL 未配置，数据库 API 不可用')
    return null
  }
  return neon(url)
}

function sendJson(res, data, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

// Fisher-Yates 洗牌
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---- 路由处理 ----

async function handleWrongWords(req, res, url) {
  const sql = getDb()
  if (!sql) return sendJson(res, { error: 'DATABASE_URL 未配置' }, 500)

  try {
    if (req.method === 'GET') {
      const userId = url.searchParams.get('userId')
      if (!userId) return sendJson(res, { error: '缺少 userId 参数' }, 400)

      const bank = url.searchParams.get('bank')
      const limit = parseInt(url.searchParams.get('limit') || '200')
      let rows
      if (bank) {
        rows = await sql.query('SELECT * FROM wrong_words WHERE user_id = $1 AND bank_name = $2 ORDER BY created_at DESC LIMIT $3', [userId, bank, limit])
      } else {
        rows = await sql.query('SELECT * FROM wrong_words WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])
      }
      return sendJson(res, { data: rows, total: rows.length })
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      if (!body.userId) return sendJson(res, { error: '缺少 userId' }, 400)
      if (!body.word) return sendJson(res, { error: '缺少必填字段: word' }, 400)
      const result = await sql.query(
        'INSERT INTO wrong_words (user_id, word, word_zh, your_answer, bank_name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [body.userId, body.word, body.wordZh || null, body.yourAnswer || null, body.bankName || null]
      )
      return sendJson(res, { success: true, id: result[0]?.id }, 201)
    }

    if (req.method === 'DELETE') {
      const body = await readBody(req)
      if (!body.userId) return sendJson(res, { error: '缺少 userId' }, 400)

      let result
      if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
        result = await sql.query('DELETE FROM wrong_words WHERE user_id = $1 AND id = ANY($2)', [body.userId, body.ids])
      } else {
        result = await sql.query('DELETE FROM wrong_words WHERE user_id = $1', [body.userId])
      }
      return sendJson(res, { success: true, deleted: result?.count ?? 0 })
    }

    sendJson(res, { error: 'Method Not Allowed' }, 405)
  } catch (err) {
    console.error('[DB Plugin /api/wrong-words]', err.message)
    sendJson(res, { error: err.message }, 500)
  }
}

async function handleReview(req, res, url) {
  const sql = getDb()
  if (!sql) return sendJson(res, { error: 'DATABASE_URL 未配置' }, 500)

  if (req.method !== 'GET') return sendJson(res, { error: 'Method Not Allowed' }, 405)

  try {
    const userId = url.searchParams.get('userId')
    if (!userId) return sendJson(res, { error: '缺少 userId 参数' }, 400)

    const bank = url.searchParams.get('bank')
    let rows
    if (bank) {
      rows = await sql.query('SELECT * FROM wrong_words WHERE user_id = $1 AND bank_name = $2 ORDER BY created_at DESC', [userId, bank])
    } else {
      rows = await sql.query('SELECT * FROM wrong_words WHERE user_id = $1 ORDER BY created_at DESC', [userId])
    }

    const seen = new Set()
    const unique = []
    for (const row of rows) {
      if (!seen.has(row.word)) {
        seen.add(row.word)
        unique.push(row)
      }
    }
    const shuffled = shuffle(unique)
    sendJson(res, { data: shuffled, total: shuffled.length })
  } catch (err) {
    console.error('[DB Plugin /api/wrong-words/review]', err.message)
    sendJson(res, { error: err.message }, 500)
  }
}

async function handleStats(req, res, url) {
  const sql = getDb()
  if (!sql) return sendJson(res, { error: 'DATABASE_URL 未配置' }, 500)

  try {
    if (req.method === 'GET') {
      const userId = url.searchParams.get('userId')
      if (!userId) return sendJson(res, { error: '缺少 userId 参数' }, 400)

      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      let rows
      if (from && to) {
        rows = await sql.query('SELECT * FROM daily_stats WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date ASC', [userId, from, to])
      } else if (from) {
        rows = await sql.query('SELECT * FROM daily_stats WHERE user_id = $1 AND date >= $2 ORDER BY date ASC', [userId, from])
      } else {
        rows = await sql.query('SELECT * FROM daily_stats WHERE user_id = $1 ORDER BY date DESC LIMIT 30', [userId])
      }
      const stats = {}
      for (const row of rows) {
        const dateKey = typeof row.date === 'string' ? row.date.slice(0, 10) : new Date(row.date).toISOString().slice(0, 10)
        stats[dateKey] = { total: row.total, correct: row.correct, wrong: row.wrong }
      }
      return sendJson(res, { data: stats })
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      if (!body.userId) return sendJson(res, { error: '缺少 userId' }, 400)
      if (!body.date) return sendJson(res, { error: '缺少必填字段: date' }, 400)
      const { userId, date, total = 0, correct = 0, wrong = 0 } = body
      const result = await sql.query(
        `INSERT INTO daily_stats (user_id, date, total, correct, wrong) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, date) DO UPDATE SET total = daily_stats.total + $3, correct = daily_stats.correct + $4, wrong = daily_stats.wrong + $5
         RETURNING *`,
        [userId, date, total, correct, wrong]
      )
      return sendJson(res, { success: true, data: result[0] })
    }

    sendJson(res, { error: 'Method Not Allowed' }, 405)
  } catch (err) {
    console.error('[DB Plugin /api/stats]', err.message)
    sendJson(res, { error: err.message }, 500)
  }
}

// ---- Vite 插件导出 ----

export default function dbApiPlugin() {
  return {
    name: 'db-api',
    configureServer(server) {
      // /api/wrong-words/review 必须在 /api/wrong-words 前面注册，否则被截断
      server.middlewares.use('/api/wrong-words/review', (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        handleReview(req, res, url).catch(() => next())
      })

      server.middlewares.use('/api/wrong-words', (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        handleWrongWords(req, res, url).catch(() => next())
      })

      server.middlewares.use('/api/stats', (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        handleStats(req, res, url).catch(() => next())
      })
    },
  }
}
