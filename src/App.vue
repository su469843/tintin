<script setup>
/**
 * App.vue - 听写应用根组件（编排器）
 * 负责整体布局、主题、手势控制、词库初始化、认证守卫、DB 数据加载
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useDictationStore } from './stores/dictationStore'
import { useAuthStore } from './stores/authStore'
import { useStorage } from './composables/useStorage'
import DictationPlayer from './components/DictationPlayer.vue'
import WordBankManager from './components/WordBankManager.vue'
import ProgressDashboard from './components/ProgressDashboard.vue'
import WrongWordsReview from './components/WrongWordsReview.vue'
import AuthView from './components/AuthView.vue'

const store = useDictationStore()
const authStore = useAuthStore()
const { STORAGE_KEYS, load, save } = useStorage()

let unsubscribeStore = null

// ============================================================
// 标签页导航（4个标签）
// ============================================================
const activeTab = ref('dictation')

// ============================================================
// 暗色模式
// ============================================================
const isDark = ref(false)

function updateDarkMode() {
  isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}

// ============================================================
// 手势控制（左右滑动切换标签页）
// ============================================================
let touchStartX = 0
let touchStartY = 0

const tabOrder = ['bank', 'dictation', 'review', 'progress']

function onTouchStart(e) {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}

function onTouchEnd(e) {
  const endX = e.changedTouches[0].clientX
  const endY = e.changedTouches[0].clientY
  const diffX = endX - touchStartX
  const diffY = endY - touchStartY

  if (Math.abs(diffY) > Math.abs(diffX)) return
  if (Math.abs(diffX) < 80) return

  const currentIdx = tabOrder.indexOf(activeTab.value)
  if (diffX < 0 && currentIdx < tabOrder.length - 1) {
    activeTab.value = tabOrder[currentIdx + 1]
  } else if (diffX > 0 && currentIdx > 0) {
    activeTab.value = tabOrder[currentIdx - 1]
  }
}

// ============================================================
// 数据迁移：将 localStorage 旧数据迁移到 DB
// ============================================================
async function migrateLocalStorageToDB() {
  const MIGRATION_KEY = 'dictation_db_migrated'
  if (localStorage.getItem(MIGRATION_KEY)) return

  // 迁移错词
  const savedWrongWords = load(STORAGE_KEYS.WRONG_WORDS, [])
  if (savedWrongWords.length > 0) {
    console.log(`[迁移] 将 ${savedWrongWords.length} 条错词迁移到数据库...`)
    for (const item of savedWrongWords) {
      try {
        await fetch('/api/wrong-words', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            word: item.word,
            wordZh: item.wordZh || null,
            yourAnswer: item.yourAnswer || null,
            bankName: null,
          }),
        })
      } catch {
        // 忽略单条失败
      }
    }
  }

  // 迁移统计
  const savedStats = load(STORAGE_KEYS.DAILY_STATS, {})
  const statEntries = Object.entries(savedStats)
  if (statEntries.length > 0) {
    console.log(`[迁移] 将 ${statEntries.length} 天统计迁移到数据库...`)
    for (const [date, data] of statEntries) {
      try {
        await fetch('/api/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            total: data.total || 0,
            correct: data.correct || 0,
            wrong: data.wrong || 0,
          }),
        })
      } catch {
        // 忽略单条失败
      }
    }
  }

  // 标记迁移完成
  localStorage.setItem(MIGRATION_KEY, '1')
  // 清除旧数据
  localStorage.removeItem(STORAGE_KEYS.WRONG_WORDS)
  localStorage.removeItem(STORAGE_KEYS.DAILY_STATS)
  console.log('[迁移] localStorage 旧数据已清除')
}

// ============================================================
// 初始化
// ============================================================
onMounted(async () => {
  updateDarkMode()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateDarkMode)

  // 1. 检查认证状态
  await authStore.init()

  // 如果未登录，等待用户登录（AuthView 会显示）
  if (!authStore.isLoggedIn) return

  // 已登录，生成邀请码（如果还没有）
  if (!authStore.myInviteCode && authStore.userId) {
    await authStore.generateInviteCode(authStore.userId)
  }

  // 已登录，加载数据
  await loadAppData()
})

/** 登录后加载应用数据 */
async function loadAppData() {
  // 1. 迁移旧数据到 DB
  await migrateLocalStorageToDB()

  // 2. 从数据库加载错词和统计
  await Promise.all([
    store.fetchWrongWords(),
    store.fetchStats(),
  ])

  // 3. 加载词库
  async function loadWordBank(url) {
    try {
      const resp = await fetch(url)
      const data = await resp.json()
      Object.entries(data).forEach(([name, words]) => {
        store.importBank(name, words)
      })
      return Object.keys(data)[0]
    } catch (err) {
      console.error(`词库加载失败 (${url}):`, err)
      return null
    }
  }

  const firstBank = await loadWordBank('/words.json')
  await loadWordBank('/words-g6.json')
  await loadWordBank('/words-g6-chinese.json')

  if (firstBank) {
    store.loadWordBank(firstBank, store.customBanks[firstBank])
  }
}

onUnmounted(() => {
  if (unsubscribeStore) {
    unsubscribeStore()
    unsubscribeStore = null
  }
})

/** 错词复习组件请求切换到听写标签 */
function switchToDictation() {
  activeTab.value = 'dictation'
}

/** 复制邀请链接到剪贴板 */
async function copyInviteLink() {
  if (!authStore.myInviteCode) return
  const link = `${window.location.origin}/?invite=${authStore.myInviteCode}`
  try {
    await navigator.clipboard.writeText(link)
    alert('✅ 邀请链接已复制：' + link)
  } catch {
    alert('📋 邀请码：' + authStore.myInviteCode)
  }
}
</script>

<template>
  <!-- 初始化中：显示加载动画，避免登录页闪烁 -->
  <div v-if="!authStore.isInitialized" class="loading-screen">
    <div class="loading-spinner"></div>
    <p class="loading-text">加载中...</p>
  </div>

  <!-- 未登录：显示登录/注册界面 -->
  <AuthView v-else-if="!authStore.isLoggedIn" />

  <!-- 已登录：主应用 -->
  <div
    v-else
    class="app"
    :class="{ dark: isDark }"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <!-- 顶部用户栏 -->
    <div class="user-bar">
      <span class="user-info">👤 {{ authStore.user?.name || authStore.user?.email }} <span class="user-id" v-if="authStore.displayId">#{{ authStore.displayId }}</span></span>
      <div class="user-actions">
        <div v-if="authStore.myInviteCode" class="invite-block" @click="copyInviteLink">
          <span class="invite-code" title="点击复制邀请链接">
            🎟️ {{ authStore.myInviteCode }}
          </span>
          <span class="invite-count">剩余 {{ authStore.inviteRemaining }}/3</span>
        </div>
        <button class="btn-logout" @click="authStore.signOut()">退出</button>
      </div>
    </div>

    <!-- 标签栏 -->
    <nav class="tab-bar">
      <button
        class="tab"
        :class="{ active: activeTab === 'dictation' }"
        @click="activeTab = 'dictation'"
      >
        🔊 听写
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'review' }"
        @click="activeTab = 'review'"
      >
        📝 错词
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'bank' }"
        @click="activeTab = 'bank'"
      >
        📚 词库
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'progress' }"
        @click="activeTab = 'progress'"
      >
        📊 进度
      </button>
    </nav>

    <!-- 内容区 -->
    <main class="content">
      <DictationPlayer v-if="activeTab === 'dictation'" />
      <WrongWordsReview v-else-if="activeTab === 'review'" @switch-to-dictation="switchToDictation" />
      <WordBankManager v-else-if="activeTab === 'bank'" />
      <ProgressDashboard v-else-if="activeTab === 'progress'" />
    </main>
  </div>
</template>

<style>
:root,
[data-theme='light'] {
  --bg-primary: #f0f9ff;
  --bg-card: #ffffff;
  --bg-secondary: #e0f2fe;
  --bg-input: #ffffff;
  --text-primary: #0c4a6e;
  --text-secondary: #0369a1;
  --text-muted: #7dd3fc;
  --border-color: #bae6fd;
  --accent: #0ea5e9;
  --accent-dark: #0284c7;
  --accent-light: #38bdf8;
  --accent-bg: #e0f2fe;
}

[data-theme='dark'] {
  --bg-primary: #0c1222;
  --bg-card: #1a2744;
  --bg-secondary: #253a5e;
  --bg-input: #1a2744;
  --text-primary: #e0f2fe;
  --text-secondary: #7dd3fc;
  --text-muted: #38bdf8;
  --border-color: #253a5e;
  --accent: #38bdf8;
  --accent-dark: #0ea5e9;
  --accent-light: #7dd3fc;
  --accent-bg: #1a2744;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.3s, color 0.3s;
}
</style>

<style scoped>
.user-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 520px;
  margin-bottom: 12px;
  padding: 0 4px;
}

.user-info {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.user-id {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 400;
}

.btn-logout {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-logout:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.user-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.invite-block {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(14, 165, 233, 0.1);
  transition: background 0.2s;
}

.invite-block:hover {
  background: rgba(14, 165, 233, 0.2);
}

.invite-code {
  font-size: 12px;
  font-weight: 600;
  color: #0ea5e9;
  letter-spacing: 1px;
  user-select: text;
  -webkit-user-select: text;
}

.invite-count {
  font-size: 11px;
  color: var(--text-muted);
}

/* 初始化加载动画 */
.loading-screen {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: var(--bg-primary);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--bg-secondary);
  border-top: 4px solid #0ea5e9;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 15px;
  color: var(--text-muted);
}

.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 12px 32px;
  transition: background-color 0.3s;
}

.tab-bar {
  display: flex;
  gap: 4px;
  width: 100%;
  max-width: 520px;
  margin-bottom: 16px;
  background: var(--bg-card);
  border-radius: 14px;
  padding: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.tab {
  flex: 1;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  padding: 0 4px;
}

.tab.active {
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
  color: #fff;
  box-shadow: 0 2px 12px rgba(14, 165, 233, 0.4);
}

.tab:active:not(.active) {
  background: var(--accent-bg);
}

.content {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 手机端适配 */
@media (max-width: 420px) {
  .app {
    padding: 8px 8px 24px;
  }

  .user-bar {
    max-width: 100%;
    margin-bottom: 8px;
    flex-wrap: wrap;
    gap: 6px;
  }

  .user-info {
    font-size: 13px;
  }

  .invite-code {
    font-size: 11px;
  }

  .invite-count {
    font-size: 10px;
  }

  .tab-bar {
    gap: 2px;
    padding: 3px;
    margin-bottom: 12px;
    border-radius: 12px;
  }

  .tab {
    height: 36px;
    font-size: 12px;
    border-radius: 9px;
  }

  .content {
    max-width: 100%;
  }
}
</style>
