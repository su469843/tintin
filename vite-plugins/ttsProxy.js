/**
 * Vite 插件：TTS 后端代理
 * 将前端 /api/tts 请求代理到 tts.519965.xyz，避免 CORS 问题
 *
 * 使用 Node.js 原生 https 模块发请求，不依赖第三方库
 */
import https from 'node:https'
import http from 'node:http'

/** TTS API 配置 */
const TTS_API_URL = 'https://tts.519965.xyz/v1/audio/speech'
const TTS_API_KEY = process.env.TTS_API_KEY || '' // 必须在 .env 文件中配置

/**
 * 向 TTS API 发送请求并返回音频 Blob
 * @param {object} body - 请求体 { model, input, voice, speed?, style? }
 * @returns {Promise<Buffer>} 音频数据
 */
function fetchTTS(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const url = new URL(TTS_API_URL)
    const isHttps = url.protocol === 'https:'
    const transport = isHttps ? https : http

    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(TTS_API_KEY ? { Authorization: `Bearer ${TTS_API_KEY}` } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          let errBody = ''
          res.on('data', (chunk) => (errBody += chunk))
          res.on('end', () => reject(new Error(`TTS API 返回 ${res.statusCode}: ${errBody}`)))
          return
        }

        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }
    )

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('TTS API 请求超时'))
    })

    req.write(payload)
    req.end()
  })
}

/**
 * Vite 插件：注册 /api/tts 中间件
 */
export default function ttsProxyPlugin() {
  return {
    name: 'tts-proxy',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res, next) => {
        // 仅处理 POST
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }

        // 读取请求体
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const params = JSON.parse(body)
            const audioBuffer = await fetchTTS(params)

            res.setHeader('Content-Type', 'audio/mpeg')
            res.setHeader('Content-Length', audioBuffer.length)
            res.end(audioBuffer)
          } catch (err) {
            console.error('[TTS Proxy] 错误:', err.message)
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })
    },
  }
}
