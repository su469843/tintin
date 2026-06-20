/**
 * Cloudflare Pages Function: /api/word-banks/[id]
 *
 * GET - 获取词库详情及所有单词
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
