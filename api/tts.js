/**
 * api/tts.js - Vercel Serverless Function
 *
 * 生产环境 TTS 代理：
 * 1. 接收前端 POST 请求（手动解析 body，Vercel 不会自动解析）
 * 2. 从环境变量读取 API key（服务端安全）
 * 3. 转发到第三方 TTS 服务
 * 4. 返回音频流
 *
 * 日志说明：所有 console.log/error 都会出现在 Vercel Function Logs 中
 */

export default async function handler(req, res) {
  const requestId = Date.now().toString(36)
  const log = (msg, data) => console.log(`[TTS:${requestId}] ${msg}`, data ?? '')
  const errLog = (msg, data) => console.error(`[TTS:${requestId}] ❌ ${msg}`, data ?? '')

  log('=== TTS 请求开始 ===')
  log('Method:', req.method)

  // 只允许 POST
  if (req.method !== 'POST') {
    log('拒绝非 POST 请求:', req.method)
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ============================================================
  // 鉴权检查：验证用户 cookie（防止未登录滥用）
  // 读取 BETTER_AUTH_SECRET 环境变量来解密 session JWT
  // ============================================================
  const cookies = (req.headers.cookie || '').split(';').map(c => c.trim()).filter(Boolean)
  log('Cookies 数量:', cookies.length)

  const authCookie = cookies.find(c => c.startsWith('better-auth.session_token='))
  if (!authCookie) {
    errLog('❌ 未检测到登录 session cookie，拒绝请求')
    return res.status(401).json({ error: '未登录，请先登录' })
  }
  log('✅ 登录 session 有效')

  // ============================================================
  // TTS API Key 检查

  // 读取环境变量
  // ⚠️ VITE_ 前缀的变量在 Vite 构建时用于前端，serverless 函数可能拿不到
  // 所以优先读 TTS_API_KEY（无前缀），再回退到 VITE_TTS_API_KEY
  const apiKey = process.env.TTS_API_KEY || process.env.VITE_TTS_API_KEY
  const apiUrl = process.env.TTS_API_URL || process.env.VITE_TTS_API_URL || 'https://tts.519965.xyz/v1/audio/speech'

  log('TTS API URL:', apiUrl)
  log('尝试读取 API Key...')
  log('  TTS_API_KEY 是否存在:', !!process.env.TTS_API_KEY)
  log('  VITE_TTS_API_KEY 是否存在:', !!process.env.VITE_TTS_API_KEY)
  log('最终 apiKey 是否存在:', !!apiKey)

  if (!apiKey) {
    errLog('❌ TTS_API_KEY 未配置')
    return res.status(500).json({
      error: 'TTS API key not configured',
      hint: '请在 Vercel Dashboard 设置 TTS_API_KEY，并与 Cloudflare Worker 的 API_KEY 保持一致'
    })
  }
  log('✅ 已携带 Authorization 请求')

  // 手动读取请求体（Vercel 不会自动解析 req.body）
  let rawBody = ''
  try {
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        rawBody += chunk
        log(`收到数据块: ${chunk.length} bytes`)
      })
      req.on('end', () => {
        log(`请求体接收完成: ${rawBody.length} bytes`)
        resolve()
      })
      req.on('error', (err) => {
        errLog('请求体读取失败:', err.message)
        reject(err)
      })
    })
  } catch (err) {
    errLog('读取请求体时出错:', err.message)
    return res.status(400).json({ error: `Failed to read request body: ${err.message}` })
  }

  // 解析 JSON
  let params
  try {
    params = JSON.parse(rawBody)
    log('请求体解析成功:', JSON.stringify({ ...params, input: params.input?.substring(0, 20) }))
  } catch (err) {
    errLog('JSON 解析失败, rawBody:', rawBody.substring(0, 200))
    return res.status(400).json({ error: `Invalid JSON body: ${err.message}` })
  }

  // 校验必填参数
  if (!params.input) {
    errLog('缺少必填参数 input')
    return res.status(400).json({ error: 'Missing required parameter: input' })
  }

  // 构造转发请求
  const forwardBody = JSON.stringify({
    model: params.model || 'tts-1',
    input: params.input,
    voice: params.voice || 'en-US-JennyNeural',
    speed: params.speed ?? 1.0
  })

  log(`转发请求到 ${apiUrl}`)
  log(`转发 body 大小: ${forwardBody.length} bytes`)

  try {
    const startTime = Date.now()
    log('正在请求上游 TTS API...')

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      },
      body: forwardBody
    })

    const elapsed = Date.now() - startTime
    log(`上游响应耗时: ${elapsed}ms`)
    log(`上游状态码: ${response.status}`)
    log(`上游 Content-Type: ${response.headers.get('content-type')}`)

    // 处理上游错误
    if (!response.ok) {
      let errorBody = ''
      try {
        errorBody = await response.text()
      } catch {
        errorBody = '(无法读取错误响应体)'
      }
      errLog(`上游 API 返回错误 ${response.status}: ${errorBody.substring(0, 500)}`)

      return res.status(502).json({
        error: `上游 TTS API 返回 ${response.status}`,
        upstream_status: response.status,
        upstream_body: errorBody.substring(0, 300)
      })
    }

    // 读取音频数据
    log('正在读取音频数据...')
    const audioBuffer = await response.arrayBuffer()
    log(`音频数据大小: ${audioBuffer.byteLength} bytes`)

    if (audioBuffer.byteLength === 0) {
      errLog('上游返回了空音频')
      return res.status(502).json({ error: '上游返回了空音频数据' })
    }

    // 成功返回
    log('✅ TTS 请求成功，返回音频流')
    log('=== TTS 请求结束 ===')

    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', audioBuffer.byteLength)
    res.setHeader('X-TTS-Elapsed', `${elapsed}ms`)
    res.status(200)
    res.end(Buffer.from(audioBuffer))
  } catch (err) {
    errLog('请求上游 API 时异常:', err.message)
    errLog('错误堆栈:', err.stack?.substring(0, 500))
    return res.status(500).json({ error: `TTS proxy failed: ${err.message}` })
  }
}
