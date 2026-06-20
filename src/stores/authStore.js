import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { neonClient } from '../lib/neonClient'

/**
 * 认证状态管理
 * 使用 Neon Auth（Better Auth vanilla 模式）
 */
export const useAuthStore = defineStore('auth', () => {
  // ============================================================
  // 状态
  // ============================================================
  const user = ref(null)        // 当前用户 { id, name, email, ... }
  const session = ref(null)     // 当前会话
  const isLoading = ref(false)  // 登录/注册中
  const isInitialized = ref(false) // 初始化完成（首次 getSession 后）
  const errorMsg = ref('')

  // ============================================================
  // 计算属性
  // ============================================================
  const isLoggedIn = computed(() => !!user.value)
  const userId = computed(() => user.value?.id || null)

  // ============================================================
  // Actions
  // ============================================================

  /**
   * 初始化：检查是否有已保存的会话
   * 应在 App.vue onMounted 中调用
   */
  async function init() {
    try {
      const result = await neonClient.auth.getSession()
      if (result?.data) {
        session.value = result.data
        user.value = result.data.user || null
      }
    } catch (err) {
      console.warn('[Auth] getSession 失败:', err)
    } finally {
      isInitialized.value = true
    }
  }

  /**
   * 邮箱注册
   */
  async function signUp(email, password, name) {
    isLoading.value = true
    errorMsg.value = ''
    try {
      const result = await neonClient.auth.signUp.email({
        email,
        password,
        name: name || email.split('@')[0],
      })

      if (result?.error) {
        errorMsg.value = result.error.message || '注册失败'
        return false
      }

      // 注册成功后自动登录
      if (result?.data) {
        session.value = result.data
        user.value = result.data.user || null
      }
      return true
    } catch (err) {
      errorMsg.value = err.message || '注册失败，请稍后重试'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 邮箱登录
   */
  async function signIn(email, password) {
    isLoading.value = true
    errorMsg.value = ''
    try {
      const result = await neonClient.auth.signIn.email({
        email,
        password,
      })

      if (result?.error) {
        errorMsg.value = result.error.message || '登录失败'
        return false
      }

      if (result?.data) {
        session.value = result.data
        user.value = result.data.user || null
      }
      return true
    } catch (err) {
      errorMsg.value = err.message || '登录失败，请稍后重试'
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 登出
   */
  async function signOut() {
    try {
      await neonClient.auth.signOut()
    } catch (err) {
      console.warn('[Auth] signOut 错误:', err)
    } finally {
      user.value = null
      session.value = null
    }
  }

  /**
   * 清除错误信息
   */
  function clearError() {
    errorMsg.value = ''
  }

  return {
    // 状态
    user,
    session,
    isLoading,
    isInitialized,
    errorMsg,
    // 计算属性
    isLoggedIn,
    userId,
    // Actions
    init,
    signUp,
    signIn,
    signOut,
    clearError,
  }
})
