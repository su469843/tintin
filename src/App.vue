<script setup>
/**
 * App.vue - 听写应用根组件（编排器）
 * 负责整体布局、主题、手势控制、词库初始化
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useDictationStore } from './stores/dictationStore'
import { useStorage } from './composables/useStorage'
import DictationPlayer from './components/DictationPlayer.vue'
import WordBankManager from './components/WordBankManager.vue'
import ProgressDashboard from './components/ProgressDashboard.vue'

const store = useDictationStore()
const { STORAGE_KEYS, load, save } = useStorage()

/** 取消订阅 Pinia store 变化（onUnmounted 时清理） */
let unsubscribeStore = null

// ============================================================
// 📱 标签页导航
// ============================================================
const activeTab = ref('dictation')

// ============================================================
// ☀️ 暗色模式
// ============================================================
const isDark = ref(false)

function updateDarkMode() {
  isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}

// ============================================================
// 🖱️ 手势控制（左右滑动切换单词/标签）
// ============================================================
let touchStartX = 0
let touchStartY = 0

function onTouchStart(e) {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}

function onTouchEnd(e) {
  const endX = e.changedTouches[0].clientX
  const endY = e.changedTouches[0].clientY
  const diffX = endX - touchStartX
  const diffY = endY - touchStartY

  // 忽略垂直滑动
  if (Math.abs(diffY) > Math.abs(diffX)) return
  // 最小滑动距离 80px
  if (Math.abs(diffX) < 80) return

  if (diffX < 0) {
    // 左滑 → 进度看板
    activeTab.value = 'progress'
  } else {
    // 右滑 → 词库管理
    activeTab.value = 'bank'
  }
}

// ============================================================
// 🚀 初始化
// ============================================================
onMounted(async () => {
  // 监听暗色模式变化
  updateDarkMode()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateDarkMode)

  // 从 localStorage 恢复持久化状态
  const savedWrongWords = load(STORAGE_KEYS.WRONG_WORDS, [])
  const savedDailyStats = load(STORAGE_KEYS.DAILY_STATS, {})
  savedWrongWords.forEach(item => store.wrongWords.push(item))
  Object.assign(store.dailyStats, savedDailyStats)

  // 监听状态变化，自动保存到 localStorage
  unsubscribeStore = store.$subscribe((mutation, state) => {
    save(STORAGE_KEYS.WRONG_WORDS, state.wrongWords)
    save(STORAGE_KEYS.DAILY_STATS, state.dailyStats)
  })

  // 从 /words.json 加载内置词库
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

  // 加载通用词库 + 六年级词库
  const firstBank = await loadWordBank('/words.json')
  const g6Bank = await loadWordBank('/words-g6.json')

  // 默认加载第一个词库
  if (firstBank) {
    store.loadWordBank(firstBank, store.customBanks[firstBank])
  }
})

onUnmounted(() => {
  if (unsubscribeStore) {
    unsubscribeStore()
    unsubscribeStore = null
  }
})
</script>

<template>
  <div
    class="app"
    :class="{ dark: isDark }"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
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
      <WordBankManager v-else-if="activeTab === 'bank'" />
      <ProgressDashboard v-else-if="activeTab === 'progress'" />
    </main>
  </div>
</template>

<style>
/* ============================================================
   🌍 全局 CSS 变量（亮色/暗色）
   ============================================================ */
:root,
[data-theme='light'] {
  --bg-primary: #f0f4f8;
  --bg-card: #ffffff;
  --bg-secondary: #e2e8f0;
  --bg-input: #ffffff;
  --text-primary: #1e293b;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border-color: #e2e8f0;
}

[data-theme='dark'] {
  --bg-primary: #0f172a;
  --bg-card: #1e293b;
  --bg-secondary: #334155;
  --bg-input: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #cbd5e1;
  --text-muted: #64748b;
  --border-color: #334155;
}

/* 全局样式 */
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
.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 16px 40px;
  transition: background-color 0.3s;
}

/* 标签栏 */
.tab-bar {
  display: flex;
  gap: 8px;
  width: 100%;
  max-width: 520px;
  margin-bottom: 20px;
  background: var(--bg-card);
  border-radius: 16px;
  padding: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.tab {
  flex: 1;
  height: 44px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tab.active {
  background: #3b82f6;
  color: #fff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.tab:active:not(.active) {
  background: var(--bg-secondary);
}

/* 内容区 */
.content {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
