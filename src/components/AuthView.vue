<script setup>
/**
 * AuthView.vue - 登录/注册界面
 * Neon Auth 邮箱 + 密码认证 + 邀请码
 */
import { ref, watch, onMounted } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { configError } from '../lib/neonClient'

const authStore = useAuthStore()

const isSignUp = ref(false)
const email = ref('')
const password = ref('')
const name = ref('')
const inviteCode = ref('')

// 从 URL 参数自动读取邀请码
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const invite = params.get('invite')
  if (invite) {
    inviteCode.value = invite.toUpperCase()
    isSignUp.value = true // 有邀请码直接跳到注册
  }
})

// ============================================================
// 邀请码开关：设为 true 启用邀请码验证
// 首次注册时可设为 false，注册成功后再开启
// ============================================================
const REQUIRE_INVITE = false // ← 控制是否需要邀请码

/** 注册时验证邀请码 */
async function validateInviteCode(code) {
  if (!REQUIRE_INVITE) return true
  if (!code) return false

  try {
    const resp = await fetch(`/api/invitations?code=${encodeURIComponent(code)}`)
    const json = await resp.json()
    return json.valid === true
  } catch {
    return false
  }
}

async function handleSubmit() {
  if (!email.value || !password.value) {
    return
  }

  let ok
  if (isSignUp.value) {
    // 注册前验证邀请码
    if (REQUIRE_INVITE && !inviteCode.value) {
      authStore.errorMsg = '请输入邀请码'
      return
    }

    if (REQUIRE_INVITE) {
      const valid = await validateInviteCode(inviteCode.value)
      if (!valid) {
        authStore.errorMsg = '邀请码无效或已使用'
        return
      }
    }

    ok = await authStore.signUp(email.value, password.value, name.value, inviteCode.value)
  } else {
    ok = await authStore.signIn(email.value, password.value)
  }

  if (ok) {
    email.value = ''
    password.value = ''
    name.value = ''
    inviteCode.value = ''
  }
}

function toggleMode() {
  isSignUp.value = !isSignUp.value
  authStore.clearError()
}

// 切换模式时清除错误
watch(isSignUp, () => authStore.clearError())
</script>

<template>
  <div class="auth-container">
    <div class="auth-card">
      <h1 class="auth-title">📖 听写助手</h1>
      <p class="auth-subtitle">{{ isSignUp ? '创建新账号' : '登录你的账号' }}</p>

      <form class="auth-form" @submit.prevent="handleSubmit">
        <div v-if="isSignUp" class="form-group">
          <label class="form-label">昵称</label>
          <input
            v-model="name"
            type="text"
            class="form-input"
            placeholder="你的昵称（选填）"
            autocomplete="name"
          />
        </div>

        <div class="form-group">
          <label class="form-label">邮箱</label>
          <input
            v-model="email"
            type="email"
            class="form-input"
            placeholder="your@email.com"
            autocomplete="email"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label">密码</label>
          <input
            v-model="password"
            type="password"
            class="form-input"
            placeholder="至少 6 位"
            autocomplete="current-password"
            required
            minlength="6"
          />
        </div>

        <!-- 邀请码（仅注册时显示，且 REQUIRE_INVITE 开启时必填） -->
        <div v-if="isSignUp" class="form-group">
          <label class="form-label">
            邀请码
            <span v-if="!REQUIRE_INVITE" class="label-hint">（暂不强制）</span>
          </label>
          <input
            v-model="inviteCode"
            type="text"
            class="form-input"
            :placeholder="REQUIRE_INVITE ? '请输入邀请码' : '有邀请码可填入'"
            :required="REQUIRE_INVITE"
            maxlength="10"
            style="text-transform: uppercase; letter-spacing: 2px;"
          />
        </div>

        <p v-if="authStore.errorMsg" class="error-msg">{{ authStore.errorMsg }}</p>

        <button
          type="submit"
          class="btn-submit"
          :disabled="authStore.isLoading || !email || !password"
        >
          {{ authStore.isLoading ? '处理中...' : (isSignUp ? '注册' : '登录') }}
        </button>
      </form>

      <p class="auth-toggle">
        {{ isSignUp ? '已有账号？' : '没有账号？' }}
        <button class="link-btn" @click="toggleMode">
          {{ isSignUp ? '去登录' : '去注册' }}
        </button>
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-primary);
}

.auth-card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-card);
  border-radius: 20px;
  padding: 40px 32px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

.auth-title {
  font-size: 28px;
  font-weight: 800;
  text-align: center;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.auth-subtitle {
  text-align: center;
  color: var(--text-secondary);
  font-size: 15px;
  margin-bottom: 32px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.label-hint {
  font-weight: 400;
  font-size: 12px;
  color: var(--text-muted);
}

.form-input {
  height: 52px;
  padding: 0 16px;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: #3b82f6;
}

.form-input::placeholder {
  color: var(--text-muted);
}

.error-msg {
  color: #ef4444;
  font-size: 14px;
  text-align: center;
  padding: 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 8px;
}

.btn-submit {
  height: 56px;
  border: none;
  border-radius: 12px;
  background: #3b82f6;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
}

.btn-submit:hover:not(:disabled) {
  background: #2563eb;
}

.btn-submit:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.auth-toggle {
  text-align: center;
  margin-top: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}

.link-btn {
  background: none;
  border: none;
  color: #3b82f6;
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}
</style>
