/**
 * Vite 插件：本地开发用数据库 API 中间件
 * 将 /api/wrong-words 和 /api/stats 请求代理到 Neon PostgreSQL
 *
 * 所有请求需要 userId 参数，按用户隔离数据
 * 仅用于 npm run dev，生产环境由 Cloudflare Pages Functions 处理
 */
import { neon } from '@neondatabase/serverless'

let tablesInitialized = false

async function ensureTables(sql) {
  if (tablesInitialized) return
  tablesInitialized = true
  console.log('[DB Plugin] 初始化数据库表...')
  const stmts = [
    `CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY, display_id TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS invitations (
      id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL, used_by TEXT, used_by_email TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(), used_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS invitation_uses (
      id SERIAL PRIMARY KEY, code TEXT NOT NULL,
      used_by TEXT NOT NULL, used_by_email TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS user_word_banks (
      id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'en', is_public BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, name)
    )`,
    `CREATE TABLE IF NOT EXISTS user_words (
      id SERIAL PRIMARY KEY, bank_id INT NOT NULL REFERENCES user_word_banks(id) ON DELETE CASCADE,
      word TEXT NOT NULL, translation TEXT, sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS wrong_words (
      id SERIAL PRIMARY KEY, user_id TEXT NOT NULL,
      word TEXT NOT NULL, word_zh TEXT, your_answer TEXT,
      bank_name TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS daily_stats (
      id SERIAL PRIMARY KEY, user_id TEXT NOT NULL,
      date DATE NOT NULL, total INT DEFAULT 0,
      correct INT DEFAULT 0, wrong INT DEFAULT 0,
      UNIQUE(user_id, date)
    )`,
  ]
  for (const stmt of stmts) {
    try { await sql.query(stmt) } catch (err) { console.warn('[DB Plugin] 建表警告:', err.message) }
  }
  // 迁移旧表：添加可能缺失的列
  const migrations = [
    `ALTER TABLE user_word_banks ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`,
    `ALTER TABLE user_word_banks ADD COLUMN IF NOT EXISTS allow_import BOOLEAN DEFAULT true`,
    `ALTER TABLE wrong_words ADD COLUMN IF NOT EXISTS user_id TEXT`,
    `ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS user_id TEXT`,
  ]
  for (const stmt of migrations) {
    try { await sql.query(stmt) } catch (err) { console.warn('[DB Plugin] 迁移警告:', err.message) }
  }
  console.log('[DB Plugin] 数据库表初始化完成')
}

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

// ---- 邀请码处理 ----

/** 生成 8 位随机邀请码 */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

async function handleInvitations(req, res, url) {
  const sql = getDb()
  if (!sql) return sendJson(res, { error: 'DATABASE_URL 未配置' }, 500)

  try {
    if (req.method === 'GET') {
      const code = url.searchParams.get('code')
      const userId = url.searchParams.get('userId')

      // 按 code 验证邀请码
      if (code) {
        // 检查邀请码是否存在且未禁用
        const rows = await sql.query(
          'SELECT * FROM invitations WHERE code = $1 AND is_active = true',
          [code.toUpperCase()]
        )
        if (rows.length === 0) {
          return sendJson(res, { valid: false, message: '邀请码无效或已禁用' })
        }
        // 检查已使用次数
        const uses = await sql.query(
          'SELECT COUNT(*) as count FROM invitation_uses WHERE code = $1',
          [code.toUpperCase()]
        )
        const useCount = uses[0]?.count || 0
        if (useCount >= 3) {
          return sendJson(res, { valid: false, message: '该邀请码已达到使用上限' })
        }
        return sendJson(res, { valid: true })
      }

      // 按 userId 获取用户的邀请码信息
      if (userId) {
        const codes = await sql.query(
          'SELECT * FROM invitations WHERE created_by = $1 ORDER BY created_at DESC LIMIT 1',
          [userId]
        )
        const uses = await sql.query(
          'SELECT COUNT(*) as count FROM invitation_uses WHERE code IN (SELECT code FROM invitations WHERE created_by = $1)',
          [userId]
        )
        const usedCount = uses[0]?.count || 0
        const remaining = 3 - usedCount

        if (codes.length === 0) {
          return sendJson(res, { hasCode: false, usedCount, remaining })
        }
        return sendJson(res, {
          hasCode: true, code: codes[0].code, isActive: codes[0].is_active,
          usedCount, remaining: Math.max(0, remaining),
        })
      }

      return sendJson(res, { error: '缺少 code 或 userId' }, 400)
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      if (!body.userId) return sendJson(res, { error: '缺少 userId' }, 400)

      // 检查是否已有邀请码
      const existing = await sql.query(
        'SELECT * FROM invitations WHERE created_by = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
        [body.userId]
      )
      if (existing.length > 0) {
        return sendJson(res, { success: true, code: existing[0].code, reused: true })
      }

      let code, attempts = 0
      do {
        code = generateCode()
        const conflict = await sql.query('SELECT id FROM invitations WHERE code = $1', [code])
        if (conflict.length === 0) break
        attempts++
      } while (attempts < 10)
      await sql.query('INSERT INTO invitations (code, created_by) VALUES ($1, $2)', [code, body.userId])
      return sendJson(res, { success: true, code, reused: false }, 201)
    }

    if (req.method === 'PUT') {
      const body = await readBody(req)
      if (!body.code || !body.userId) return sendJson(res, { error: '缺少 code 或 userId' }, 400)
      // 检查邀请码是否存在且有效
      const rows = await sql.query(
        'SELECT * FROM invitations WHERE code = $1 AND is_active = true',
        [body.code.toUpperCase()]
      )
      if (rows.length === 0) return sendJson(res, { error: '邀请码无效或已禁用' }, 400)

      // 检查已使用次数
      const uses = await sql.query(
        'SELECT COUNT(*) as count FROM invitation_uses WHERE code = $1',
        [body.code.toUpperCase()]
      )
      if ((uses[0]?.count || 0) >= 3) {
        return sendJson(res, { error: '该邀请码已达到使用上限' }, 400)
      }

      // 检查是否自己用自己的邀请码
      if (rows[0].created_by === body.userId) {
        return sendJson(res, { error: '不能用自己的邀请码注册' }, 400)
      }

      // 检查是否已经用过该邀请码
      const alreadyUsed = await sql.query(
        'SELECT * FROM invitation_uses WHERE code = $1 AND used_by = $2',
        [body.code.toUpperCase(), body.userId]
      )
      if (alreadyUsed.length > 0) {
        return sendJson(res, { error: '你已经用过该邀请码' }, 400)
      }

      // 记录使用（不将邀请码标记为已失效）
      await sql.query(
        'INSERT INTO invitation_uses (code, used_by, used_by_email) VALUES ($1, $2, $3)',
        [body.code.toUpperCase(), body.userId, body.email || null]
      )
      return sendJson(res, { success: true })
    }

    sendJson(res, { error: 'Method Not Allowed' }, 405)
  } catch (err) {
    console.error('[DB Plugin /api/invitations]', err.message)
    sendJson(res, { error: err.message }, 500)
  }
}

// ---- 用户词库处理 ----

async function handleWordBankById(req, res, url, bankId) {
  const sql = getDb()
  if (!sql) return sendJson(res, { error: 'DATABASE_URL 未配置' }, 500)

  try {
    if (req.method === 'POST') {
      // 添加单词到已有词库
      if (!bankId) return sendJson(res, { error: '缺少 bankId' }, 400)

      const bankRows = await sql.query(
        'SELECT * FROM user_word_banks WHERE id = $1', [bankId]
      )
      if (bankRows.length === 0) return sendJson(res, { error: '词库不存在' }, 404)

      const body = await readBody(req)
      if (!body.word) return sendJson(res, { error: '缺少 word 字段' }, 400)

      // 检查权限：如果不是词库所有者，需要 allow_import = true
      const bank = bankRows[0]
      const isOwner = body.userId && body.userId === bank.user_id
      if (!isOwner && !bank.allow_import) {
        return sendJson(res, { error: '该词库不允许他人添加单词' }, 403)
      }

      const maxOrder = await sql.query(
        'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM user_words WHERE bank_id = $1',
        [bankId]
      )
      const sortOrder = (maxOrder[0]?.max_order ?? -1) + 1

      await sql.query(
        'INSERT INTO user_words (bank_id, word, translation, sort_order) VALUES ($1, $2, $3, $4)',
        [bankId, body.word, body.translation || null, sortOrder]
      )
      await sql.query('UPDATE user_word_banks SET updated_at = NOW() WHERE id = $1', [bankId])
      return sendJson(res, { success: true }, 201)
    }

    if (req.method === 'GET') {
      if (!bankId) return sendJson(res, { error: '缺少 bankId' }, 400)
      const words = await sql.query(
        'SELECT * FROM user_words WHERE bank_id = $1 ORDER BY sort_order', [bankId]
      )
      const bankInfo = await sql.query(
        'SELECT b.*, p.name as creator_name FROM user_word_banks b LEFT JOIN profiles p ON p.id = b.user_id WHERE b.id = $1',
        [bankId]
      )
      return sendJson(res, { data: words, bank: bankInfo[0] || null })
    }

    sendJson(res, { error: 'Method Not Allowed' }, 405)
  } catch (err) {
    console.error(`[DB Plugin /api/word-banks/${bankId}]`, err.message)
    sendJson(res, { error: err.message }, 500)
  }
}

async function handleWordBanks(req, res, url) {
  const sql = getDb()
  if (!sql) return sendJson(res, { error: 'DATABASE_URL 未配置' }, 500)
  await ensureTables(sql)

  try {
    if (req.method === 'GET') {
      const userId = url.searchParams.get('userId')
      const isPublic = url.searchParams.get('public')
      const id = url.searchParams.get('id')

      // 获取单个词库的单词
      if (id) {
        const words = await sql.query(
          'SELECT * FROM user_words WHERE bank_id = $1 ORDER BY sort_order', [id]
        )
        const bankInfo = await sql.query(
          'SELECT b.*, p.name as creator_name FROM user_word_banks b LEFT JOIN profiles p ON p.id = b.user_id WHERE b.id = $1',
          [id]
        )
        return sendJson(res, { data: words, bank: bankInfo[0] || null })
      }

      // 获取公开词库
      if (isPublic === 'true') {
        const banks = await sql.query(
          `SELECT b.*, p.name as creator_name, COUNT(w.id) as word_count
           FROM user_word_banks b
           LEFT JOIN user_words w ON w.bank_id = b.id
           LEFT JOIN profiles p ON p.id = b.user_id
           WHERE b.is_public = true
           GROUP BY b.id, p.name
           ORDER BY b.updated_at DESC`
        )
        return sendJson(res, { data: banks })
      }

      // 获取用户所有词库（包括公开和私有）
      if (!userId) return sendJson(res, { error: '缺少 userId' }, 400)
      const banks = await sql.query(
        `SELECT b.*, COUNT(w.id) as word_count
         FROM user_word_banks b
         LEFT JOIN user_words w ON w.bank_id = b.id
         WHERE b.user_id = $1
         GROUP BY b.id
         ORDER BY b.updated_at DESC`,
        [userId]
      )
      return sendJson(res, { data: banks })
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      if (!body.userId || !body.name || !body.lang) {
        return sendJson(res, { error: '缺少 userId, name 或 lang' }, 400)
      }
      const bankResult = await sql.query(
        `INSERT INTO user_word_banks (user_id, name, lang, is_public, allow_import)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, name) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [body.userId, body.name, body.lang, body.isPublic === true, body.allowImport !== false]
      )
      const bankId = bankResult[0]?.id
      if (body.words && Array.isArray(body.words) && body.words.length > 0) {
        for (let i = 0; i < body.words.length; i++) {
          const w = body.words[i]
          await sql.query(
            'INSERT INTO user_words (bank_id, word, translation, sort_order) VALUES ($1, $2, $3, $4)',
            [bankId, w.word, w.translation || null, i]
          )
        }
      }
      return sendJson(res, { success: true, bankId, wordCount: body.words?.length || 0, isPublic: body.isPublic === true }, 201)
    }

    if (req.method === 'DELETE') {
      const body = await readBody(req)
      if (!body.userId || !body.bankId) return sendJson(res, { error: '缺少 userId 或 bankId' }, 400)
      const bank = await sql.query(
        'SELECT * FROM user_word_banks WHERE id = $1 AND user_id = $2',
        [body.bankId, body.userId]
      )
      if (bank.length === 0) return sendJson(res, { error: '词库不存在或无权限' }, 404)
      await sql.query('DELETE FROM user_word_banks WHERE id = $1', [body.bankId])
      return sendJson(res, { success: true })
    }

    sendJson(res, { error: 'Method Not Allowed' }, 405)
  } catch (err) {
    console.error('[DB Plugin /api/word-banks]', err.message)
    sendJson(res, { error: err.message }, 500)
  }
}

// ---- 用户资料处理 ----

async function handleProfiles(req, res, url) {
  const sql = getDb()
  if (!sql) return sendJson(res, { error: 'DATABASE_URL 未配置' }, 500)

  try {
    // 自动建表
    await sql.query(`CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      display_id TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
    if (req.method === 'POST') {
      const body = await readBody(req)
      if (!body.userId) return sendJson(res, { error: '缺少 userId' }, 400)

      // 检查是否已有 profile
      const existing = await sql.query('SELECT * FROM profiles WHERE id = $1', [body.userId])
      if (existing.length > 0) {
        return sendJson(res, { data: existing[0], existed: true })
      }

      // 生成 8 位数字 ID
      let displayId
      for (let attempt = 0; attempt < 20; attempt++) {
        displayId = String(10000000 + Math.floor(Math.random() * 90000000))
        const exist = await sql.query('SELECT id FROM profiles WHERE display_id = $1', [displayId])
        if (exist.length === 0) break
        displayId = null
      }
      if (!displayId) return sendJson(res, { error: '无法生成唯一 display_id' }, 500)

      await sql.query('INSERT INTO profiles (id, display_id, name) VALUES ($1, $2, $3)',
        [body.userId, displayId, body.name || ''])
      return sendJson(res, { data: { id: body.userId, display_id: displayId, name: body.name || '' } }, 201)
    }

    if (req.method === 'GET') {
      const userId = url.searchParams.get('userId')
      const displayId = url.searchParams.get('displayId')
      if (userId) {
        const rows = await sql.query('SELECT * FROM profiles WHERE id = $1', [userId])
        return sendJson(res, { data: rows[0] || null })
      }
      if (displayId) {
        const rows = await sql.query('SELECT * FROM profiles WHERE display_id = $1', [displayId])
        return sendJson(res, { data: rows[0] || null })
      }
      return sendJson(res, { error: '缺少 userId 或 displayId' }, 400)
    }

    sendJson(res, { error: 'Method Not Allowed' }, 405)
  } catch (err) {
    console.error('[DB Plugin /api/profiles]', err.message)
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

      server.middlewares.use('/api/invitations', (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        handleInvitations(req, res, url).catch(() => next())
      })

      server.middlewares.use('/api/word-banks', (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        // 检查是否是 /api/word-banks/:id 模式
        const pathMatch = url.pathname.match(/^\/api\/word-banks\/(\d+)\/?$/)
        if (pathMatch) {
          handleWordBankById(req, res, url, pathMatch[1]).catch(() => next())
        } else {
          handleWordBanks(req, res, url).catch(() => next())
        }
      })

      server.middlewares.use('/api/profiles', (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        handleProfiles(req, res, url).catch(() => next())
      })
    },
  }
}
