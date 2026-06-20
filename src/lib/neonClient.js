/**
 * Neon Auth 客户端
 * 使用 @neondatabase/neon-js 的 vanilla（框架无关）模式
 *
 * 安全设计：当 VITE_NEON_AUTH_URL 未配置时，自动使用 Mock 客户端，
 * 所有 Auth 方法返回空结果，确保应用不白屏。
 * 用户可在界面上看到"认证未配置"的错误提示。
 */
import { createClient } from '@neondatabase/neon-js'
import { BetterAuthVanillaAdapter } from '@neondatabase/auth/vanilla/adapters'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL

/** Mock 客户端：所有方法返回空，确保不崩溃 */
function createMockClient() {
  const noop = () => Promise.resolve({ data: null, error: { message: '认证未配置，请检查 .env 文件中的 VITE_NEON_AUTH_URL' } })
  return {
    auth: {
      getSession: noop,
      signIn: { email: noop },
      signUp: { email: noop },
      signOut: noop,
    },
  }
}

let neonClient
let configError = null

try {
  if (!authUrl) {
    throw new Error('VITE_NEON_AUTH_URL 未配置')
  }
  // createClient 需要同时传 auth 和 dataApi，但我们只用 auth
  // dataApi 传个占位地址，实际不会被用到
  neonClient = createClient({
    auth: {
      url: authUrl,
      adapter: BetterAuthVanillaAdapter(),
    },
    dataApi: {
      url: 'http://localhost:3000',
    },
  })
} catch (err) {
  configError = err.message || 'Unknown error'
  console.warn('[Auth]', configError, '- 使用 Mock 客户端，登录/注册不可用')
  neonClient = createMockClient()
}

export { neonClient, configError }
