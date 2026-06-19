<script setup>
/**
 * DictationPlayer.vue - 核心听写区
 * 显示当前单词、播放控制、输入对比
 *
 * 语音策略：
 *   1. 优先使用后端 TTS 代理（/api/tts → tts.519965.xyz），高质量神经网络语音
 *   2. 失败时自动降级为浏览器内置 Web Speech API
 */
import { ref } from 'vue'
import { useDictationStore } from '../stores/dictationStore'

// ============================================================
// 🎙️ 语音配置
// ============================================================
// TTS API 语音角色（通过后端代理调用 tts.519965.xyz）
const TTS_VOICE = 'en-US-JennyNeural'
// 如需中文语音，改为：
// const TTS_VOICE = 'zh-CN-XiaoxiaoNeural'

// Web Speech API 回退语音语言
const SPEECH_LANG = 'en-US'
// 如需中文，改为：
// const SPEECH_LANG = 'zh-CN'

const store = useDictationStore()

/** 标记当前使用的语音引擎 */
const ttsEngine = ref('api') // 'api' | 'web'

/**
 * 根据文本自动检测语言，返回对应语音角色
 */
function detectVoice(text) {
  if (/[\u4e00-\u9fa5]/.test(text)) return 'zh-CN-XiaoxiaoNeural'
  if (/[\u3040-\u30ff]/.test(text)) return 'ja-JP-NanamiNeural'
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR-SunHiNeural'
  return TTS_VOICE // 默认英文
}

/**
 * 通过后端代理调用 TTS API（带 10 秒超时保护）
 * 后端转发到 tts.519965.xyz，避免 CORS 问题
 *
 * 日志说明：所有 console.group/console.log 可在浏览器 DevTools 中查看
 */
async function speakWithAPI(text) {
  const TIMEOUT_MS = 10000
  const reqId = Date.now().toString(36)

  const fetchPromise = (async () => {
    const voice = detectVoice(text)

    console.group(`[TTS:${reqId}] 请求 TTS API`)
    console.log('朗读文本:', text)
    console.log('语音角色:', voice)
    console.log('请求地址:', '/api/tts')

    let resp
    try {
      resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: voice,
          speed: 0.9,
        }),
      })
      console.log('响应状态:', resp.status, resp.statusText)
      console.log('响应耗时:', resp.headers.get('X-TTS-Elapsed') || '未知')
    } catch (err) {
      console.error('网络请求失败:', err.message)
      console.groupEnd()
      throw new Error(`网络错误: ${err.message}`)
    }

    if (!resp.ok) {
      let errData = {}
      try {
        errData = await resp.json()
        console.error('API 错误详情:', errData)
      } catch {
        const errText = await resp.text().catch(() => '')
        console.error('API 错误(非JSON):', errText.substring(0, 200))
      }
      console.groupEnd()
      throw new Error(errData.error || errData.upstream_body || `TTS API 返回 ${resp.status}`)
    }

    // API 返回 audio/mpeg，转为 Blob 播放
    console.log('正在读取音频流...')
    const blob = await resp.blob()
    console.log('音频大小:', blob.size, 'bytes')
    console.log('音频类型:', blob.type)

    if (blob.size === 0) {
      console.error('收到空音频')
      console.groupEnd()
      throw new Error('TTS 返回空音频')
    }

    const url = URL.createObjectURL(blob)
    const audioEl = new Audio(url)

    console.log('开始播放音频...')
    await new Promise((resolve, reject) => {
      audioEl.onended = () => {
        console.log('播放完成')
        resolve()
      }
      audioEl.onerror = () => reject(new Error('Audio playback error'))
      audioEl.play().catch(reject)
    })

    URL.revokeObjectURL(url)
    console.groupEnd()
  })()

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => {
      console.error(`[TTS:${reqId}] ❌ 请求超时 (${TIMEOUT_MS}ms)`)
      reject(new Error('TTS API 超时'))
    }, TIMEOUT_MS)
  )

  await Promise.race([fetchPromise, timeoutPromise])
}

/**
 * 使用浏览器内置 Web Speech API 朗读（回退方案）
 */
function speakWithWebSpeech(text) {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = SPEECH_LANG
    utterance.rate = 0.9  // 稍慢，便于听清
    utterance.onend = resolve
    utterance.onerror = (e) => reject(new Error(`Web Speech error: ${e.error}`))
    speechSynthesis.speak(utterance)
  })
}

/** 朗读当前单词（TTS API 优先，失败自动降级 Web Speech API） */
async function speakCurrent() {
  if (store.isPlaying || store.isFinished) return
  store.setPlaying(true)

  const word = store.currentWord

  // 优先尝试后端 TTS API
  if (ttsEngine.value === 'api') {
    store.setStatus('正在朗读...')
    try {
      await speakWithAPI(word)
      store.setStatus('')
      store.setPlaying(false)
      return
    } catch (err) {
      console.warn('TTS API 失败，降级为 Web Speech API:', err.message)
      // 标记降级，后续直接走 Web Speech 避免重复失败
      ttsEngine.value = 'web'
    }
  }

  // 使用 Web Speech API（回退）
  store.setStatus('正在朗读（内置语音）...')
  try {
    await speakWithWebSpeech(word)
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
