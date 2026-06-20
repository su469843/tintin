/**
 * Cloudflare Pages Function: /api/tts
 *
 * 生产环境 TTS 代理：
 * 1. 接收前端 POST 请求
 * 2. 从 Cloudflare 环境变量读取 API Key
 * 3. 转发到 tts.519965.xyz
 * 4. 返回音频流
 *
 * 环境变量（在 Cloudflare Dashboard → Settings → Variables 中配置）：
 *   TTS_API_KEY  - TTS 服务的 API Key
 *   TTS_API_URL  - (可选) TTS 服务地址，默认为 https://tts.519965.xyz/v1/audio/speech
 */
export async function onRequestPost(context) {
  const { request, env } = context

  const apiUrl = env.TTS_API_URL || 'https://tts.519965.xyz/v1/audio/speech'
  const apiKey = env.TTS_API_KEY || ''

  // 解析请求体
  let params
  try {
    params = await request.json()
  } catch (err) {
    return new Response(JSON.stringify({ error: `Invalid JSON body: ${err.message}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 校验必填参数
  if (!params.input) {
    return new Response(JSON.stringify({ error: 'Missing required parameter: input' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 构造转发请求
  const forwardBody = JSON.stringify({
    model: params.model || 'tts-1',
    input: params.input,
    voice: params.voice || 'en-US-JennyNeural',
    speed: params.speed ?? 1.0,
    ...(params.style ? { style: params.style } : {}),
  })

  const headers = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: forwardBody,
    })

    // 上游错误
    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[TTS] 上游返回 ${response.status}: ${errorBody}`)
      return new Response(
        JSON.stringify({
          error: `上游 TTS API 返回 ${response.status}`,
          upstream_status: response.status,
          upstream_body: errorBody.substring(0, 300),
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // 读取音频数据
    const audioBuffer = await response.arrayBuffer()

    if (audioBuffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: '上游返回了空音频数据' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 返回音频
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })
  } catch (err) {
    console.error(`[TTS] 请求异常:`, err.message)
    return new Response(JSON.stringify({ error: `TTS proxy failed: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
