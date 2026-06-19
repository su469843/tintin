<script setup>
/**
 * 听写应用 - Vue 3 <script setup>
 * 使用 edge-tts-universal 实现语音朗读
 * 针对华为平板触摸操作优化
 */
import { ref, computed } from 'vue'
import { EdgeTTS } from 'edge-tts-universal/browser'

// ============================================================
// 📚 词库配置 —— 替换成你自己的词库即可
// ============================================================
const wordList = [
  'apple',
  'banana',
  'cat',
  'dog',
  'elephant',
]

// ============================================================
// 🎙️ 语音配置
// ============================================================
// 英文语音（默认）
const VOICE = 'en-US-JennyNeural'
// 如需中文语音，改为：
// const VOICE = 'zh-CN-YunxiNeural'

// ============================================================
// 状态
// ============================================================
const currentIndex = ref(0)
const isPlaying = ref(false)
const isFinished = ref(false)
const statusMsg = ref('')

// 计算属性
const total = computed(() => wordList.length)
const currentWord = computed(() => wordList[currentIndex.value] ?? '')
const progressText = computed(() => `第 ${currentIndex.value + 1} / ${total.value} 个`)

// ============================================================
// 核心：朗读当前单词
// ============================================================
async function speakCurrent() {
  if (isPlaying.value || isFinished.value) return
  isPlaying.value = true
  statusMsg.value = '正在朗读...'

  try {
    // ⚠️ EdgeTTS 实例必须在函数内部创建，不能放在 onMounted 里
    const tts = new EdgeTTS(currentWord.value, VOICE)
    const { audio } = await tts.synthesize()

    // 将 Blob 转为可播放的 URL
    const url = URL.createObjectURL(audio)
    const audioEl = new Audio(url)

    await new Promise((resolve) => {
      audioEl.onended = resolve
      audioEl.onerror = resolve
      audioEl.play()
    })

    // 释放 URL
    URL.revokeObjectURL(url)

    // 自动切换下一个单词
    if (currentIndex.value < total.value - 1) {
      currentIndex.value++
      statusMsg.value = ''
      // 自动朗读下一个（延迟 400ms，给用户反应时间）
      setTimeout(() => speakCurrent(), 400)
    } else {
      // 全部完成
      isFinished.value = true
      statusMsg.value = ''
    }
  } catch (err) {
    console.error('朗读出错:', err)
    statusMsg.value = '朗读出错，请重试'
  } finally {
    isPlaying.value = false
  }
}

// ============================================================
// 重播当前单词
// ============================================================
async function replay() {
  if (isPlaying.value) return
  isFinished.value = false
  await speakCurrent()
}

// ============================================================
// 重置：回到第一个单词
// ============================================================
function reset() {
  if (isPlaying.value) return
  currentIndex.value = 0
  isFinished.value = false
  statusMsg.value = ''
}
</script>

<template>
  <div class="app">
    <!-- 顶部进度 -->
    <header class="header">
      <p class="progress">{{ isFinished ? '已完成' : progressText }}</p>
    </header>

    <!-- 主卡片 -->
    <main class="card">
      <!-- 当前单词展示区 -->
      <div class="word-display">
        <p v-if="!isFinished" class="word">{{ currentWord }}</p>
        <p v-else class="celebrate">🎉 全部完成！</p>
      </div>

      <!-- 状态提示 -->
      <p v-if="statusMsg" class="status">{{ statusMsg }}</p>

      <!-- 按钮区 -->
      <div class="buttons">
        <button
          class="btn btn-primary"
          :disabled="isPlaying || isFinished"
          @click="speakCurrent"
        >
          🔊 朗读
        </button>
        <button
          class="btn btn-secondary"
          :disabled="isPlaying"
          @click="replay"
        >
          🔁 重播
        </button>
        <button
          class="btn btn-secondary"
          :disabled="isPlaying"
          @click="reset"
        >
          ↩️ 重置
        </button>
      </div>
    </main>

    <!-- 底部单词列表预览 -->
    <footer class="footer">
      <div class="word-chips">
        <span
          v-for="(w, i) in wordList"
          :key="i"
          class="chip"
          :class="{ active: i === currentIndex, done: i < currentIndex || isFinished }"
        >
          {{ w }}
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* 全局背景 */
.app {
  min-height: 100dvh;
  background-color: #f0f4f8;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px 60px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  box-sizing: border-box;
  /* 禁止用户选中文本，防止触摸误操作 */
  user-select: none;
  -webkit-user-select: none;
  /* 禁止双击放大 */
  touch-action: manipulation;
}

/* 顶部进度 */
.header {
  width: 100%;
  max-width: 480px;
  text-align: center;
  margin-bottom: 24px;
}
.progress {
  font-size: 18px;
  color: #64748b;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin: 0;
}

/* 主卡片 */
.card {
  background: #ffffff;
  border-radius: 24px;
  box-shadow: 0 8px 32px rgba(100, 116, 139, 0.12);
  padding: 48px 32px 40px;
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}

/* 单词展示区 */
.word-display {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.word {
  font-size: 52px;
  font-weight: 800;
  color: #1e293b;
  letter-spacing: 2px;
  text-align: center;
  margin: 0;
}
.celebrate {
  font-size: 36px;
  font-weight: 700;
  color: #10b981;
  text-align: center;
  margin: 0;
}

/* 状态提示 */
.status {
  font-size: 16px;
  color: #94a3b8;
  margin: 0;
}

/* 按钮组 */
.buttons {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}
.btn {
  width: 100%;
  height: 64px;
  border: none;
  border-radius: 16px;
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.1s, opacity 0.15s;
  /* 触摸优化 */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  letter-spacing: 1px;
}
.btn:active:not(:disabled) {
  transform: scale(0.97);
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
  font-size: 22px;
  height: 72px;
}
.btn-primary:active:not(:disabled) {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
}

.btn-secondary {
  background: #e2e8f0;
  color: #475569;
}
.btn-secondary:active:not(:disabled) {
  background: #cbd5e1;
}

/* 底部单词列表 */
.footer {
  width: 100%;
  max-width: 480px;
  margin-top: 32px;
}
.word-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.chip {
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 600;
  background: #e2e8f0;
  color: #64748b;
  transition: all 0.2s;
}
.chip.active {
  background: #3b82f6;
  color: #fff;
  transform: scale(1.08);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}
.chip.done {
  background: #bbf7d0;
  color: #166534;
}
</style>
