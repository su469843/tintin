/**
 * Cloudflare Pages Function: /api/word-banks
 *
 * GET  ?userId=xxx           - 获取用户私有词库
 * GET  ?public=true          - 获取所有公开词库（含创建者信息）
 * GET  ?id=xxx              - 获取单个词库的单词列表
 * POST   - 创建词库 + 添加单词 body: { userId, name, lang, isPublic, words }
 * DELETE - 删除词库 body: { userId, bankId }
 *
 * 环境变量: DATABASE_URL (Neon PostgreSQL)
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

// GET /api/word-banks
export async function onRequestGet(context) {
  try {
    const sql = getDb(context.env)
    const url = new URL(context.request.url)
    const userId = url.searchParams.get('userId')
    const isPublic = url.searchParams.get('public')
    const id = url.searchParams.get('id')

    // 获取单个词库的单词
    if (id) {
      const words = await sql.query(
        'SELECT * FROM user_words WHERE bank_id = $1 ORDER BY sort_order',
        [id]
      )
      const bankInfo = await sql.query(
        'SELECT b.*, u.name as creator_name FROM user_word_banks b LEFT JOIN users u ON u.id = b.user_id WHERE b.id = $1',
        [id]
      )
      return json({ data: words, bank: bankInfo[0] || null })
    }

    // 获取公开词库
    if (isPublic === 'true') {
      const banks = await sql.query(
        `SELECT b.*, u.name as creator_name, COUNT(w.id) as word_count
         FROM user_word_banks b
         LEFT JOIN user_words w ON w.bank_id = b.id
         LEFT JOIN users u ON u.id = b.user_id
         WHERE b.is_public = true
         GROUP BY b.id, u.name
         ORDER BY b.updated_at DESC`
      )
      return json({ data: banks })
    }

    // 获取用户私有词库
    if (!userId) return json({ error: '缺少 userId' }, 400)

    const banks = await sql.query(
      `SELECT b.*, COUNT(w.id) as word_count
       FROM user_word_banks b
       LEFT JOIN user_words w ON w.bank_id = b.id
       WHERE b.user_id = $1 AND (b.is_public IS NULL OR b.is_public = false)
       GROUP BY b.id
       ORDER BY b.updated_at DESC`,
      [userId]
    )

    return json({ data: banks })
  } catch (err) {
    console.error('[word-banks GET]', err.message)
    return json({ error: err.message }, 500)
  }
}

// POST /api/word-banks  创建词库 + 添加单词
export async function onRequestPost(context) {
  try {
    const sql = getDb(context.env)
    const body = await context.request.json()

    if (!body.userId || !body.name || !body.lang) {
      return json({ error: '缺少 userId, name 或 lang' }, 400)
    }

    const isPublic = body.isPublic === true

    const bankResult = await sql.query(
      `INSERT INTO user_word_banks (user_id, name, lang, is_public)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, name) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [body.userId, body.name, body.lang, isPublic]
    )

    const bankId = bankResult[0]?.id

    if (body.words && Array.isArray(body.words) && body.words.length > 0) {
      for (let i = 0; i < body.words.length; i++) {
        const w = body.words[i]
        await sql.query(
          `INSERT INTO user_words (bank_id, word, translation, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [bankId, w.word, w.translation || null, i]
        )
      }
    }

    return json({ success: true, bankId, wordCount: body.words?.length || 0, isPublic }, 201)
  } catch (err) {
    console.error('[word-banks POST]', err.message)
    return json({ error: err.message }, 500)
  }
}

// DELETE /api/word-banks  删除词库（级联删除单词）
export async function onRequestDelete(context) {
  try {
    const sql = getDb(context.env)
    const body = await context.request.json()

    if (!body.userId || !body.bankId) {
      return json({ error: '缺少 userId 或 bankId' }, 400)
    }

    const bank = await sql.query(
      'SELECT * FROM user_word_banks WHERE id = $1 AND user_id = $2',
      [body.bankId, body.userId]
    )

    if (bank.length === 0) {
      return json({ error: '词库不存在或无权限' }, 404)
    }

    await sql.query('DELETE FROM user_word_banks WHERE id = $1', [body.bankId])
    return json({ success: true })
  } catch (err) {
    console.error('[word-banks DELETE]', err.message)
    return json({ error: err.message }, 500)
  }
}
