/**
 * api/tts.js - Vercel Serverless Function
 * 
 * 生产环境 TTS 代理：
 * 1. 接收前端 POST 请求
 * 2. 从环境变量读取 API key（服务端安全）
 * 3. 转发到第三方 TTS 服务
 * 4. 返回音频流
 */
export default async function handler(req, res) {
  // 只允许 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.VITE_TTS_API_KEY
  const apiUrl = process.env.VITE_TTS_API_URL || 'https://tts.519965.xyz/v1/audio/speech'

  if (!apiKey) {
    return res.status(500).json({ error: 'TTS API key not configured' })
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(req.body)
    })

    // 转发状态码
    res.status(response.status)

    // 转发响应头（排除 transfer-encoding 避免冲突）
    response.headers.forEach((value, key) => {
      if (!['transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    })

    // 流式转发音频数据
    const audioBuffer = await response.arrayBuffer()
    res.end(Buffer.from(audioBuffer))
  } catch (err) {
    console.error('TTS proxy error:', err)
    res.status(500).json({ error: 'TTS proxy failed' })
  }
}
