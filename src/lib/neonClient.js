/**
 * Neon Auth 客户端
 * 使用 @neondatabase/neon-js 的 vanilla（框架无关）模式
 */
import { createClient } from '@neondatabase/neon-js'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL

if (!authUrl) {
  console.error('[Auth] VITE_NEON_AUTH_URL 未配置，请检查 .env 文件')
}

/**
 * Neon 客户端实例
 * 用法:
 *   await neonClient.auth.signIn.email({ email, password })
 *   await neonClient.auth.signUp.email({ email, password, name })
 *   const session = await neonClient.auth.getSession()
 *   await neonClient.auth.signOut()
 */
export const neonClient = createClient({
  auth: {
    url: authUrl,
  },
})
