<script setup>
/**
 * DictationPlayer.vue - 核心听写区（双模式）
 *
 * 模式 A - 屏幕显示：显示单词 + 释义/拼音，用户看着屏幕听写
 * 模式 B - 纯听力：屏幕无任何文字提示，只播放音频，完成后统一揭晓
 *
 * 语音策略（三引擎降级）：
 *   1. 后端 TTS 代理（/api/tts → tts.519965.xyz）
 *   2. edge-tts-universal（浏览器 WebSocket）
 *   3. Web Speech API（最终降级）
 */
import { ref, watch, nextTick } from 'vue'
import { useDictationStore } from '../stores/dictationStore'
import { EdgeTTS } from 'edge-tts-universal/browser'

const TTS_VOICE = 'en-US-JennyNeural'
const SPEECH_LANG = 'en-US'

const store = useDictationStore()
const ttsEngine = ref('api')

// ============================================================
// 语音检测
// ============================================================
function detectVoice(text) {
  if (/[\u4e00-\u9fa5]/.test(text)) return 'zh-CN-XiaoxiaoNeural'
  if (/[\u3040-\u30ff]/.test(text)) return 'ja-JP-NanamiNeural'
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR-SunHiNeural'
  return TTS_VOICE
}

// ============================================================
// 引擎 1：后端 TTS 代理
// ============================================================
async function speakWithAPI(text) {
  const TIMEOUT_MS = 10000
  const fetchPromise = (async () => {
    const voice = detectVoice(text)
    const resp = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: text, voice, speed: 0.9 }),
    })
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}))
      throw new Error(errData.error || `TTS API ${resp.status}`)
    }
    const blob = await resp.blob()
    if (blob.size === 0) throw new Error('TTS 返回空音频')
    const url = URL.createObjectURL(blob)
    const audioEl = new Audio(url)
    await new Promise((resolve, reject) => {
      audioEl.onended = resolve
      audioEl.onerror = () => reject(new Error('Audio error'))
      audioEl.play().catch(reject)
    })
    URL.revokeObjectURL(url)
  })()

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TTS API 超时')), TIMEOUT_MS)
  )
  await Promise.race([fetchPromise, timeoutPromise])
}

// ============================================================
// 引擎 2：edge-tts-universal
// ============================================================
async function speakWithEdgeTTS(text) {
  const TIMEOUT_MS = 5000
  const ttsPromise = (async () => {
    const tts = new EdgeTTS(text, TTS_VOICE)
    const { audio } = await tts.synthesize()
    if (audio.size === 0) throw new Error('EdgeTTS 空音频')
    const url = URL.createObjectURL(audio)
    const audioEl = new Audio(url)
    await new Promise((resolve, reject) => {
      audioEl.onended = resolve
      audioEl.onerror = () => reject(new Error('Audio error'))
      audioEl.play().catch(reject)
    })
    URL.revokeObjectURL(url)
  })()
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('edge-tts 超时')), TIMEOUT_MS)
  )
  await Promise.race([ttsPromise, timeoutPromise])
}

// ============================================================
// 引擎 3：Web Speech API
// ============================================================
function speakWithWebSpeech(text) {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = SPEECH_LANG
    utterance.rate = 0.9
    utterance.onend = resolve
    utterance.onerror = (e) => reject(new Error(`Web Speech: ${e.error}`))
    speechSynthesis.speak(utterance)
  })
}

// ============================================================
// 统一入口：三引擎降级
// ============================================================
async function speakCurrent() {
  if (store.isPlaying || store.isFinished) return
  store.setPlaying(true)
  const word = store.currentWord

  if (ttsEngine.value === 'api') {
    store.setStatus('正在朗读...')
    try {
      await speakWithAPI(word)
      store.setStatus(''); store.setPlaying(false); return
    } catch (err) {
      ttsEngine.value = 'edge'
    }
  }
  if (ttsEngine.value === 'edge') {
    store.setStatus('正在朗读（Edge TTS）...')
    try {
      await speakWithEdgeTTS(word)
      store.setStatus(''); store.setPlaying(false); return
    } catch (err) {
      ttsEngine.value = 'web'
    }
  }
  store.setStatus('正在朗读（内置语音）...')
  try {
    await speakWithWebSpeech(word)
    store.setStatus('')
  } catch (err) {
    store.setStatus('朗读出错，请重试')
  } finally {
    store.setPlaying(false)
  }
}

// ============================================================
// 交互逻辑
// ============================================================

function handleSubmit() {
  store.submitAnswer()
}

/** 显示模式下的下一词 */
function handleNext() {
  if (store.isSubmitted && store.isCorrect) {
    store.nextWord()
    if (!store.isFinished && store.autoNext) {
      setTimeout(() => speakCurrent(), 400)
    }
  }
}

/** 跳过当前词 */
function skipWord() {
  store.nextWord()
  if (!store.isFinished) {
    setTimeout(() => speakCurrent(), 400)
  }
}

/** 纯听力模式：提交后直接下一词（不显示对错） */
function handleListeningNext() {
  if (!store.isSubmitted) return
  store.nextWord()
  if (!store.isFinished) {
    setTimeout(() => speakCurrent(), 400)
  }
}

/** 纸笔模式：下一个单词 */
function nextWordPaper() {
  if (store.currentIndex < store.total - 1) {
    store.currentIndex++
    store.isSubmitted = false
    store.isCorrect = null
    store.inputText = ''
    store.statusMsg = ''
  } else {
    store.paperFinish()
  }
}

/** 纸笔模式：上一个单词 */
function prevWordPaper() {
  if (store.currentIndex > 0) {
    store.currentIndex--
    store.isSubmitted = false
    store.isCorrect = null
    store.inputText = ''
    store.statusMsg = ''
  }
}

// ============================================================
// 纸笔模式：自动续播
// ============================================================
let autoPlayTimer = null
const isAutoPlaying = ref(false)

/** 开始/停止自动续播 */
function toggleAutoPlay() {
  if (isAutoPlaying.value) {
    stopAutoPlay()
  } else {
    startAutoPlay()
  }
}

function startAutoPlay() {
  if (store.isFinished || store.paperPhase !== 'playing') return
  isAutoPlaying.value = true
  playCurrentAndSchedule()
}

function stopAutoPlay() {
  isAutoPlaying.value = false
  if (autoPlayTimer) {
    clearTimeout(autoPlayTimer)
    autoPlayTimer = null
  }
}

async function playCurrentAndSchedule() {
  if (!isAutoPlaying.value || store.paperPhase !== 'playing') return

  await speakCurrent()

  if (!isAutoPlaying.value || store.paperPhase !== 'playing') return

  // 检查是否是最后一个
  if (store.currentIndex >= store.total - 1) {
    store.paperFinish()
    isAutoPlaying.value = false
    return
  }

  // 按设置的间隔自动进入下一词
  autoPlayTimer = setTimeout(() => {
    if (!isAutoPlaying.value) return
    nextWordPaper()
    playCurrentAndSchedule()
  }, store.paperInterval * 1000)
}

// 纯听力模式：切换到此词时自动朗读
watch(() => store.currentIndex, () => {
  if (store.dictationMode === 'listening' && !store.isFinished) {
    nextTick(() => {
      setTimeout(() => speakCurrent(), 300)
    })
  }
})

/** 重新开始听写（当前词库） */
function restartDictation() {
  const name = store.currentBank
  const words = [...store.wordList]
  store.loadWordBank(name, words)
  setTimeout(() => speakCurrent(), 400)
}
</script>

<template>
  <div class="dictation-player">

    <!-- ============================================================
         纸笔模式：设置阶段
    ============================================================ -->
    <template v-if="store.dictationMode === 'paper' && store.paperPhase === 'setup'">
      <!-- 模式切换 -->
      <div class="mode-selector">
        <button :class="{ active: store.dictationMode === 'display' }" @click="store.setDictationMode('display')">👁 屏幕</button>
        <button :class="{ active: store.dictationMode === 'chinese_only' }" @click="store.setDictationMode('chinese_only')">📝 中文提示</button>
        <button :class="{ active: store.dictationMode === 'listening' }" @click="store.setDictationMode('listening')">👂 纯听力</button>
        <button :class="{ active: store.dictationMode === 'paper' }" @click="store.setDictationMode('paper')">📄 纸笔</button>
      </div>
      <div class="paper-setup">
        <h3 class="setup-title">📄 纸笔听写设置</h3>

        <div class="setup-group">
          <label class="setup-label">选择词库</label>
          <div class="bank-list">
            <button v-for="name in store.bankNames" :key="name"
              class="bank-chip" :class="{ active: store.currentBank === name }"
              @click="store.switchBank(name)">
              {{ name }}
            </button>
          </div>
        </div>

        <div class="setup-group">
          <label class="setup-label">播放间隔：{{ store.paperInterval }} 秒</label>
          <input type="range" min="2" max="10" step="1"
            v-model.number="store.paperInterval" class="setup-slider" />
        </div>

        <div class="setup-group">
          <label class="setup-label">每个单词播放次数</label>
          <div class="repeat-options">
            <button :class="{ active: store.paperRepeatCount === 2 }"
              @click="store.paperRepeatCount = 2">2 遍</button>
            <button :class="{ active: store.paperRepeatCount === 3 }"
              @click="store.paperRepeatCount = 3">3 遍</button>
          </div>
        </div>

        <button class="btn btn-primary btn-start" @click="store.paperStart()">
          🎯 开始听写（共 {{ store.total }} 词）
        </button>
      </div>
    </template>

    <!-- ============================================================
         纸笔模式：播放阶段（简洁版）
         上面中文提示，下面播报 + 上/下一个
    ============================================================ -->
    <template v-else-if="store.dictationMode === 'paper' && store.paperPhase === 'playing'">
      <!-- 模式选择器 -->
      <div class="mode-selector">
        <button :class="{ active: store.dictationMode === 'display' }" @click="stopAutoPlay(); store.setDictationMode('display')">👁 屏幕</button>
        <button :class="{ active: store.dictationMode === 'chinese_only' }" @click="stopAutoPlay(); store.setDictationMode('chinese_only')">📝 中文提示</button>
        <button :class="{ active: store.dictationMode === 'listening' }" @click="stopAutoPlay(); store.setDictationMode('listening')">👂 纯听力</button>
        <button :class="{ active: store.dictationMode === 'paper' }" @click="store.setDictationMode('paper')">📄 纸笔</button>
      </div>

      <div class="paper-playing">
        <!-- 进度 -->
        <p class="paper-progress">{{ store.currentIndex + 1 }} / {{ store.total }}</p>

        <!-- 中文提示 -->
        <div class="paper-hint-area">
          <p v-if="store.currentWordZh" class="paper-hint-text">{{ store.currentWordZh }}</p>
          <p v-else class="paper-hint-text">{{ store.currentWord }}</p>
        </div>

        <!-- 状态 -->
        <p v-if="store.statusMsg" class="status">{{ store.statusMsg }}</p>
        <p v-else-if="isAutoPlaying" class="paper-sub-hint">
          自动续播中，{{ store.paperInterval }} 秒后下一个
        </p>
        <p v-else class="paper-sub-hint">点击 ▶ 开始自动听写</p>

        <!-- 控制栏 -->
        <div class="paper-controls">
          <button class="btn btn-secondary" :disabled="store.currentIndex === 0" @click="stopAutoPlay(); prevWordPaper()">
            ◀ 上一个
          </button>
          <button class="btn btn-primary btn-play" @click="toggleAutoPlay">
            {{ isAutoPlaying ? '⏸' : '▶' }}
          </button>
          <button class="btn btn-secondary" @click="stopAutoPlay(); nextWordPaper()">
            下一个 ▶
          </button>
        </div>
      </div>
    </template>

    <!-- ============================================================
         纸笔模式：标记阶段
    ============================================================ -->
    <template v-else-if="store.dictationMode === 'paper' && store.paperPhase === 'marking'">
      <div class="paper-marking">
        <h3 class="marking-title">✏️ 标记错词</h3>
        <p class="marking-hint">点击你写错的单词打 ❌，正确的不用动</p>
        <div class="marking-list">
          <div v-for="(w, i) in store.wordList" :key="i"
            class="marking-item"
            :class="{ wrong: store.paperWrongIndices.includes(i) }"
            @click="store.paperToggleWrong(i)">
            <div class="marking-word">
              <span class="marking-en">{{ store.getWordEn(w) }}</span>
              <span class="marking-zh">{{ store.getWordZh(w) }}</span>
            </div>
            <span class="marking-status">
              {{ store.paperWrongIndices.includes(i) ? '❌' : '✅' }}
            </span>
          </div>
        </div>
        <div class="marking-actions">
          <p class="marking-summary">
            标记 {{ store.paperWrongIndices.length }} 个错误
          </p>
          <button class="btn btn-primary" @click="store.paperSubmit()">
            ✅ 确认提交
          </button>
        </div>
      </div>
    </template>

    <!-- ============================================================
         纸笔模式：完成 + 庆祝
    ============================================================ -->
    <template v-else-if="store.dictationMode === 'paper' && store.paperPhase === 'done'">
      <div class="session-result">
        <!-- 庆祝动画 -->
        <div v-if="store.showCelebration" class="celebration-overlay">
          <div class="confetti-container">
            <div v-for="i in 30" :key="i" class="confetti"
              :style="{
                left: Math.random() * 100 + '%',
                animationDelay: Math.random() * 2 + 's',
                animationDuration: (1.5 + Math.random() * 2) + 's',
                backgroundColor: ['#f44336','#e91e63','#9c27b0','#3f51b5','#03a9f4','#009688','#4caf50','#ffeb3b','#ff9800'][i % 9]
              }">
            </div>
          </div>
          <div class="celebration-text">
            <span class="big-star">🌟</span>
            <h2>全部正确！太棒了！</h2>
            <p>{{ store.total }} 个单词全部正确</p>
          </div>
        </div>

        <h3 class="result-title">🎉 听写完成！</h3>
        <div class="result-stats">
          <div class="stat-item">
            <span class="stat-num">{{ store.total }}</span>
            <span class="stat-label">总计</span>
          </div>
          <div class="stat-item correct">
            <span class="stat-num">{{ store.total - store.paperWrongIndices.length }}</span>
            <span class="stat-label">正确</span>
          </div>
          <div class="stat-item wrong">
            <span class="stat-num">{{ store.paperWrongIndices.length }}</span>
            <span class="stat-label">错误</span>
          </div>
          <div class="stat-item">
            <span class="stat-num">{{ Math.round((store.total - store.paperWrongIndices.length) / store.total * 100) }}%</span>
            <span class="stat-label">正确率</span>
          </div>
        </div>

        <div class="result-actions">
          <button class="btn btn-primary" @click="store.paperReset()">🔄 再来一轮</button>
        </div>
      </div>
    </template>

    <!-- ============================================================
         非纸笔模式（原有模式）
    ============================================================ -->
    <template v-else>

    <!-- 模式选择器 -->
    <div v-if="!store.isFinished" class="mode-selector">
      <button :class="{ active: store.dictationMode === 'display' }" @click="store.setDictationMode('display')">👁 屏幕</button>
      <button :class="{ active: store.dictationMode === 'chinese_only' }" @click="store.setDictationMode('chinese_only')">📝 中文提示</button>
      <button :class="{ active: store.dictationMode === 'listening' }" @click="store.setDictationMode('listening')">👂 纯听力</button>
      <button :class="{ active: store.dictationMode === 'paper' }" @click="store.setDictationMode('paper')">📄 纸笔</button>
    </div>

    <!-- ============ 本轮完成：结果展示 ============ -->
    <div v-if="store.isFinished" class="session-result">
      <h3 class="result-title">🎉 听写完成！</h3>
      <div class="result-stats">
        <div class="stat-item">
          <span class="stat-num">{{ store.sessionResults.length }}</span>
          <span class="stat-label">总计</span>
        </div>
        <div class="stat-item correct">
          <span class="stat-num">{{ store.sessionResults.filter(r => r.correct).length }}</span>
          <span class="stat-label">正确</span>
        </div>
        <div class="stat-item wrong">
          <span class="stat-num">{{ store.sessionWrongWords.length }}</span>
          <span class="stat-label">错误</span>
        </div>
        <div class="stat-item">
          <span class="stat-num">{{ store.sessionAccuracy }}%</span>
          <span class="stat-label">正确率</span>
        </div>
      </div>

      <!-- 错词列表 -->
      <div v-if="store.sessionWrongWords.length > 0" class="result-wrong">
        <p class="wrong-title">❌ 错误词汇</p>
        <div class="wrong-list">
          <div v-for="(item, i) in store.sessionWrongWords" :key="i" class="wrong-item">
            <div class="wrong-word-block">
              <span class="wrong-word">{{ item.word }}</span>
              <span v-if="item.wordZh" class="wrong-zh">{{ item.wordZh }}</span>
            </div>
            <span class="wrong-answer">你写: {{ item.yourAnswer || '(空)' }}</span>
          </div>
        </div>
      </div>

      <div class="result-actions">
        <button class="btn btn-primary" @click="restartDictation">🔄 再来一轮</button>
      </div>
    </div>

    <!-- ============ 听写进行中 ============ -->
    <template v-else>
      <!-- 单词展示区 -->
      <div class="word-display">
        <!-- ---- 屏幕显示模式 ---- -->
        <template v-if="store.dictationMode === 'display'">
          <div v-if="store.isChineseBank" class="word-block">
            <p class="word-pinyin">{{ store.currentWordZh }}</p>
          </div>
          <div v-else class="word-block">
            <p class="word-en">{{ store.currentWord }}</p>
            <p v-if="store.currentWordZh" class="word-zh">{{ store.currentWordZh }}</p>
          </div>
        </template>

        <!-- ---- 中文提示模式：只显示中文，隐藏英文 ---- -->
        <template v-else-if="store.dictationMode === 'chinese_only'">
          <div class="word-block">
            <p v-if="store.currentWordZh" class="word-zh chinese-only">{{ store.currentWordZh }}</p>
            <p v-else class="word-en">{{ store.currentWord }}</p>
          </div>
        </template>

        <!-- ---- 纯听力模式：不显示任何文字 ---- -->
        <template v-else-if="store.dictationMode === 'listening'">
          <div class="listening-icon">
            <span class="big-icon">🔊</span>
            <p class="listening-hint">请听音频，写出单词</p>
          </div>
        </template>

        <!-- ---- 纸笔模式：只听不写 ---- -->
        <template v-else>
          <div class="listening-icon">
            <span class="big-icon">📝</span>
            <p class="listening-hint">听写 {{ store.currentIndex + 1 }}/{{ store.total }}</p>
          </div>
        </template>
      </div>

      <!-- 状态提示 -->
      <p v-if="store.statusMsg" class="status">{{ store.statusMsg }}</p>

      <!-- 输入框 -->
      <div class="input-area">
        <input
          v-model="store.inputText"
          type="text"
          class="word-input"
          :placeholder="store.isChineseBank ? '输入汉字...' : '输入单词拼写...'"
          :disabled="store.isPlaying || (store.isSubmitted && store.dictationMode === 'display')"
          @keyup.enter="handleSubmit"
        />
        <div class="input-buttons">
          <!-- 确认按钮 -->
          <button
            v-if="!store.isSubmitted"
            class="btn btn-primary"
            :disabled="!store.inputText.trim() || store.isPlaying"
            @click="handleSubmit"
          >
            ✅ 确认
          </button>

          <!-- 屏幕显示模式：答对后显示"下一词" -->
          <button
            v-if="store.dictationMode === 'display' && store.isSubmitted && store.isCorrect"
            class="btn btn-success"
            @click="handleNext"
          >
            ➡️ 下一词
          </button>

          <!-- 屏幕显示模式：答错后显示"跳过" -->
          <button
            v-if="store.dictationMode === 'display' && store.isSubmitted && !store.isCorrect"
            class="btn btn-next"
            @click="skipWord"
          >
            ⏭ 跳过
          </button>

          <!-- 纯听力模式：提交后显示"下一个" -->
          <button
            v-if="store.dictationMode === 'listening' && store.isSubmitted"
            class="btn btn-success"
            @click="handleListeningNext"
          >
            ➡️ 下一个
          </button>

          <!-- 重读按钮 -->
          <button
            class="btn btn-secondary"
            :disabled="store.isPlaying"
            @click="speakCurrent"
          >
            🔊 重读
          </button>

          <!-- 屏幕显示模式：未提交时可跳过 -->
          <button
            v-if="store.dictationMode === 'display' && !store.isSubmitted"
            class="btn btn-secondary"
            @click="skipWord"
          >
            ⏭ 跳过
          </button>
        </div>
      </div>

      <!-- 屏幕显示模式：答题反馈 -->
      <div
        v-if="store.dictationMode === 'display' && store.isSubmitted"
        class="feedback"
        :class="{ correct: store.isCorrect, wrong: !store.isCorrect }"
      >
        <template v-if="store.isCorrect">
          ✅ 正确！{{ store.currentWordZh ? '(' + store.currentWordZh + ')' : '' }}
        </template>
        <template v-else>
          ❌ 错误，正确答案：<strong>{{ store.currentWord }}</strong>
          <span v-if="store.currentWordZh">（{{ store.currentWordZh }}）</span>
        </template>
      </div>
    </template>
    </template>
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

/* 模式选择器 */
.mode-selector {
  display: flex;
  gap: 6px;
  background: var(--bg-card, #fff);
  border-radius: 12px;
  padding: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.mode-selector button {
  padding: 6px 16px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.mode-selector button.active {
  background: #3b82f6;
  color: #fff;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

/* 单词展示 */
.word-display {
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.word-block {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.word-en {
  font-size: 52px;
  font-weight: 800;
  color: var(--text-primary, #1e293b);
  letter-spacing: 2px;
  margin: 0;
}

.word-pinyin {
  font-size: 48px;
  font-weight: 800;
  color: var(--text-primary, #1e293b);
  letter-spacing: 3px;
  margin: 0;
}

.word-zh {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}

/* 纯听力模式图标 */
.listening-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.big-icon {
  font-size: 64px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.1); opacity: 1; }
}

.listening-hint {
  font-size: 16px;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}

.status {
  font-size: 16px;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}

/* 输入区 */
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

/* 答题反馈 */
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

/* 本轮结果 */
.session-result {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.result-title {
  font-size: 28px;
  font-weight: 800;
  color: #10b981;
  margin: 0;
}

.result-stats {
  display: flex;
  gap: 16px;
  width: 100%;
  justify-content: center;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 20px;
  background: var(--bg-card, #fff);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  min-width: 72px;
}

.stat-item.correct .stat-num { color: #10b981; }
.stat-item.wrong .stat-num { color: #ef4444; }

.stat-num {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary, #1e293b);
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
}

.result-wrong {
  width: 100%;
  padding: 16px;
  background: var(--bg-card, #fff);
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.wrong-title {
  font-size: 16px;
  font-weight: 700;
  color: #ef4444;
  margin: 0 0 12px;
}

.wrong-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.wrong-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fef2f2;
  border-radius: 8px;
}

.wrong-word-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wrong-word {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
}

.wrong-zh {
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
}

.wrong-answer {
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  text-align: right;
}

.result-actions {
  display: flex;
  gap: 12px;
}

/* ===== 纸笔模式 ===== */
.paper-setup {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.setup-title { font-size: 22px; font-weight: 700; margin: 0; }
.setup-group { display: flex; flex-direction: column; gap: 8px; }
.setup-label { font-size: 15px; font-weight: 600; color: var(--text-secondary); }
.setup-slider { width: 100%; height: 6px; }
.repeat-options { display: flex; gap: 8px; }
.repeat-options button {
  flex: 1; height: 44px; border: 2px solid var(--border-color);
  border-radius: 10px; background: var(--bg-card);
  color: var(--text-secondary); font-size: 15px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
}
.repeat-options button.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.btn-start { width: 100%; height: 56px; font-size: 18px; margin-top: 8px; }

.paper-playing {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}
.paper-progress {
  font-size: 16px;
  color: var(--text-muted);
  margin: 0;
}
.paper-hint-area {
  min-height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.paper-hint-text {
  font-size: 52px;
  font-weight: 800;
  color: var(--text-primary);
  text-align: center;
  margin: 0;
  letter-spacing: 2px;
}
.paper-sub-hint {
  font-size: 15px;
  color: var(--text-muted);
  margin: 0;
}

.paper-controls {
  display: flex;
  gap: 16px;
  align-items: center;
}
.btn-play {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
}

/* 纸笔模式：标记阶段 */
.paper-marking { width: 100%; display: flex; flex-direction: column; gap: 16px; }
.marking-title { font-size: 20px; font-weight: 700; margin: 0; }
.marking-hint { font-size: 14px; color: var(--text-muted); margin: 0; }
.marking-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; }
.marking-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px; background: var(--bg-card);
  border-radius: 12px; cursor: pointer; transition: all 0.15s;
  border: 2px solid var(--border-color);
}
.marking-item.wrong { border-color: #ef4444; background: #fef2f2; }
.marking-word { display: flex; flex-direction: column; gap: 2px; }
.marking-en { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.marking-zh { font-size: 14px; color: var(--text-muted); }
.marking-status { font-size: 24px; }
.marking-actions { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.marking-summary { font-size: 15px; color: var(--text-muted); margin: 0; }

/* 纸笔模式：庆祝动画 */
.celebration-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.5); z-index: 100;
}
.celebration-text { text-align: center; color: #fff; z-index: 101; }
.celebration-text h2 { font-size: 36px; margin: 12px 0; }
.celebration-text p { font-size: 18px; opacity: 0.9; }
.big-star { font-size: 80px; }
.confetti-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 99; }
.confetti {
  position: absolute; top: -10px; width: 10px; height: 10px;
  border-radius: 2px; animation: confetti-fall 3s ease-in-out infinite;
}
@keyframes confetti-fall {
  0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}
</style>
