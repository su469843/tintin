<script setup>
/**
 * DictationPlayer.vue - 核心听写区
 * 显示当前单词、播放控制、输入对比
 */
import { ref } from 'vue'
import { useDictationStore } from '../stores/dictationStore'
import { EdgeTTS } from 'edge-tts-universal/browser'

const VOICE = 'en-US-JennyNeural'
const store = useDictationStore()

/** 朗读当前单词 */
async function speakCurrent() {
  if (store.isPlaying || store.isFinished) return
  store.setPlaying(true)
  store.setStatus('正在朗读...')

  try {
    const tts = new EdgeTTS(store.currentWord, VOICE)
    const { audio } = await tts.synthesize()

    const url = URL.createObjectURL(audio)
    const audioEl = new Audio(url)

    await new Promise((resolve) => {
      audioEl.onended = resolve
      audioEl.onerror = resolve
      audioEl.play()
    })

    URL.revokeObjectURL(url)
    store.setStatus('')
  } catch (err) {
    console.error('朗读出错:', err)
    store.setStatus('朗读出错，请重试')
  } finally {
    store.setPlaying(false)
  }
}

/** 提交输入答案 */
function handleSubmit() {
  store.submitAnswer()
}

/** 继续下一词（答对后自动/手动） */
function handleNext() {
  if (store.isSubmitted && store.isCorrect) {
    store.nextWord()
    if (!store.isFinished && store.autoNext) {
      setTimeout(() => speakCurrent(), 400)
    }
  }
}

/** 手动下一词（跳过） */
function skipWord() {
  store.nextWord()
  if (!store.isFinished) {
    setTimeout(() => speakCurrent(), 400)
  }
}
</script>

<template>
  <div class="dictation-player">
    <!-- 单词展示 -->
    <div class="word-display">
      <template v-if="!store.isFinished">
        <!-- 盲听模式：隐藏单词 -->
        <p v-if="store.playMode === 'blind' && !store.isSubmitted" class="word-hidden">
          ···
        </p>
        <p v-else class="word">{{ store.currentWord }}</p>
      </template>
      <p v-else class="celebrate">🎉 全部完成！</p>
    </div>

    <!-- 状态提示 -->
    <p v-if="store.statusMsg" class="status">{{ store.statusMsg }}</p>

    <!-- 输入框（听写模式） -->
    <div v-if="!store.isFinished" class="input-area">
      <input
        v-model="store.inputText"
        type="text"
        class="word-input"
        placeholder="输入单词拼写..."
        :disabled="store.isPlaying || store.isSubmitted"
        @keyup.enter="handleSubmit"
      />
      <div class="input-buttons">
        <button
          v-if="!store.isSubmitted"
          class="btn btn-primary"
          :disabled="!store.inputText.trim() || store.isPlaying"
          @click="handleSubmit"
        >
          ✅ 确认
        </button>
        <button
          v-if="store.isSubmitted && store.isCorrect"
          class="btn btn-success"
          @click="handleNext"
        >
          ➡️ 下一词
        </button>
        <button
          v-if="store.isSubmitted && !store.isCorrect"
          class="btn btn-next"
          @click="skipWord"
        >
          ⏭ 跳过
        </button>
        <button
          class="btn btn-secondary"
          :disabled="store.isPlaying"
          @click="speakCurrent"
        >
          🔊 重读
        </button>
        <button
          v-if="!store.isFinished"
          class="btn btn-secondary"
          @click="skipWord"
        >
          ⏭ 跳过
        </button>
      </div>
    </div>

    <!-- 答题反馈 -->
    <div v-if="store.isSubmitted" class="feedback" :class="{ correct: store.isCorrect, wrong: !store.isCorrect }">
      <template v-if="store.isCorrect">
        ✅ 正确！
      </template>
      <template v-else>
        ❌ 错误，正确答案：<strong>{{ store.currentWord }}</strong>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dictation-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: 100%;
}

.word-display {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.word {
  font-size: 52px;
  font-weight: 800;
  color: var(--text-primary, #1e293b);
  letter-spacing: 2px;
  text-align: center;
  margin: 0;
}

.word-hidden {
  font-size: 52px;
  font-weight: 800;
  color: var(--text-muted, #94a3b8);
  text-align: center;
  margin: 0;
  letter-spacing: 8px;
}

.celebrate {
  font-size: 36px;
  font-weight: 700;
  color: #10b981;
  text-align: center;
  margin: 0;
}

.status {
  font-size: 16px;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}

.input-area {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.word-input {
  width: 100%;
  height: 56px;
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  font-size: 24px;
  font-weight: 600;
  text-align: center;
  letter-spacing: 2px;
  outline: none;
  transition: border-color 0.2s;
  background: var(--bg-input, #fff);
  color: var(--text-primary, #1e293b);
  box-sizing: border-box;
}

.word-input:focus {
  border-color: #3b82f6;
}

.word-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
}

.btn {
  height: 60px;
  min-width: 120px;
  padding: 0 24px;
  border: none;
  border-radius: 14px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.1s, opacity 0.15s;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
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
}

.btn-success {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
}

.btn-next {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  box-shadow: 0 4px 16px rgba(245, 158, 11, 0.35);
}

.btn-secondary {
  background: var(--bg-secondary, #e2e8f0);
  color: var(--text-secondary, #475569);
}

.feedback {
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.feedback.correct {
  background: #d1fae5;
  color: #065f46;
}

.feedback.wrong {
  background: #fee2e2;
  color: #991b1b;
}

.feedback strong {
  font-size: 22px;
}
</style>
