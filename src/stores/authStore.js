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
  const myInviteCode = ref(null) // 当前用户的邀请码
  const inviteRemaining = ref(0) // 剩余可邀请名额
  const inviteUsedCount = ref(0) // 已邀请人数
  const displayId = ref(null)    // 8 位数字 ID

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
        // 加载 profile 信息
        if (user.value?.id) {
          try {
            const resp = await fetch(`/api/profiles?userId=${encodeURIComponent(user.value.id)}`)
            const json = await resp.json()
            if (json.data?.display_id) displayId.value = json.data.display_id
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.warn('[Auth] getSession 失败:', err)
    } finally {
      isInitialized.value = true
    }
  }

  /**
   * 邮箱注册
   * @param {string} inviteCode - 邀请码（可选）
   */
  async function signUp(email, password, name, inviteCode) {
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

        // 注册成功后创建 profile + 邀请码
        const newUserId = result.data.user?.id
        if (newUserId) {
          const displayId = await createProfile(newUserId, name)

          // 如果有邀请码，标记为已使用
          if (inviteCode) {
            await fetch('/api/invitations', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: inviteCode, userId: newUserId, email }),
            }).catch(() => {})
          }

          // 生成邀请码
          await generateInviteCode(newUserId)
        }
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
   * 创建用户资料（含 8 位数字 ID）
   */
  async function createProfile(userId, name) {
    try {
      const resp = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name: name || '' }),
      })
      const json = await resp.json()
      if (json.data?.display_id) {
        displayId.value = json.data.display_id
        return json.data.display_id
      }
    } catch (err) {
      console.warn('[Auth] 创建 profile 失败:', err.message)
    }
    return null
  }

  /**
   * 获取邀请码信息（有则返回，无则创建）
   */
  async function generateInviteCode(userId) {
    try {
      // 先查询用户邀请码信息
      const infoResp = await fetch(`/api/invitations?userId=${encodeURIComponent(userId)}`)
      const info = await infoResp.json()

      if (info.hasCode) {
        myInviteCode.value = info.code
        inviteUsedCount.value = info.usedCount
        inviteRemaining.value = info.remaining
        return
      }

      // 没有则创建
      const resp = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const json = await resp.json()
      if (json.success && json.code) {
        myInviteCode.value = json.code
        inviteUsedCount.value = 0
        inviteRemaining.value = 3
      }
    } catch (err) {
      console.warn('[Auth] 获取邀请码失败:', err.message)
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
    myInviteCode,
    inviteRemaining,
    inviteUsedCount,
    displayId,
    // 计算属性
    isLoggedIn,
    userId,
    // Actions
    init,
    signUp,
    signIn,
    signOut,
    clearError,
    generateInviteCode,
  }
})
