<script setup>
/**
 * AuthView.vue - 登录/注册界面
 * Neon Auth 邮箱 + 密码认证
 */
import { ref } from 'vue'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()

const isSignUp = ref(false)
const email = ref('')
const password = ref('')
const name = ref('')

async function handleSubmit() {
  if (!email.value || !password.value) {
    return
  }

  let ok
  if (isSignUp.value) {
    ok = await authStore.signUp(email.value, password.value, name.value)
  } else {
    ok = await authStore.signIn(email.value, password.value)
  }

  if (ok) {
    // 登录/注册成功，App.vue 会自动切换到主界面
    email.value = ''
    password.value = ''
    name.value = ''
  }
}

function toggleMode() {
  isSignUp.value = !isSignUp.value
  authStore.clearError()
}
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
