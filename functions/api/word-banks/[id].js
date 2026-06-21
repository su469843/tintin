/**
 * Cloudflare Pages Function: /api/word-banks/[id]
 *
 * GET - 获取词库详情及所有单词
 * POST - 添加单词到已有词库
 *
 * 路径参数: id (词库 ID)
 * 查询参数: userId (用户 ID)
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

// GET /api/word-banks/:id?userId=xxx
export async function onRequestGet(context) {
  try {
    const sql = getDb(context.env)
    const url = new URL(context.request.url)
    const userId = url.searchParams.get('userId')

    // 从路径提取 bank id (Cloudflare Pages Functions 的 params)
    const bankId = context.params?.id || url.searchParams.get('id')

    if (!userId || !bankId) {
      return json({ error: '缺少 userId 或 bankId' }, 400)
    }

    // 获取词库信息
    const bankRows = await sql.query(
      'SELECT * FROM user_word_banks WHERE id = $1 AND user_id = $2',
      [bankId, userId]
    )

    if (bankRows.length === 0) {
      return json({ error: '词库不存在或无权限' }, 404)
    }

    // 获取单词列表
    const words = await sql.query(
      'SELECT * FROM user_words WHERE bank_id = $1 ORDER BY sort_order ASC, id ASC',
      [bankId]
    )

    return json({
      data: {
        ...bankRows[0],
        words: words.map(w => ({
          id: w.id,
          word: w.word,
          translation: w.translation,
        })),
      },
    })
  } catch (err) {
    console.error('[word-banks/:id GET]', err.message)
    return json({ error: err.message }, 500)
  }
}

// POST /api/word-banks/:id 添加单词到词库
export async function onRequestPost(context) {
  try {
    const sql = getDb(context.env)
    const url = new URL(context.request.url)
    const bankId = context.params?.id || url.searchParams.get('id')

    if (!bankId) {
      return json({ error: '缺少 bankId' }, 400)
    }

    // 检查词库是否存在
    const bankRows = await sql.query(
      'SELECT * FROM user_word_banks WHERE id = $1',
      [bankId]
    )
    if (bankRows.length === 0) {
      return json({ error: '词库不存在' }, 404)
    }

    const body = await context.request.json()
    if (!body.word) {
      return json({ error: '缺少 word 字段' }, 400)
    }

    // 检查权限：如果不是词库所有者，需要 allow_import = true
    const bank = bankRows[0]
    const isOwner = body.userId && body.userId === bank.user_id
    if (!isOwner && !bank.allow_import) {
      return json({ error: '该词库不允许他人添加单词' }, 403)
    }

    // 获取当前最大 sort_order
    const maxOrder = await sql.query(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM user_words WHERE bank_id = $1',
      [bankId]
    )
    const sortOrder = (maxOrder[0]?.max_order ?? -1) + 1

    await sql.query(
      `INSERT INTO user_words (bank_id, word, translation, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [bankId, body.word, body.translation || null, sortOrder]
    )

    // 更新词库的 updated_at
    await sql.query(
      'UPDATE user_word_banks SET updated_at = NOW() WHERE id = $1',
      [bankId]
    )

    return json({ success: true }, 201);
  } catch (err) {
    console.error('[word-banks/:id POST]', err.message)
    return json({ error: err.message }, 500)
  }
}
