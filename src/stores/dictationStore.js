import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 听写应用核心状态管理
 * 使用 Pinia composition API 风格（setup store）
 */
export const useDictationStore = defineStore('dictation', () => {
  // ============================================================
  // 📚 词库状态
  // ============================================================
  /** 当前词库名称 */
  const currentBank = ref('四级词汇')
  /** 所有可用词库名称列表 */
  const bankNames = ref([])
  /** 当前词库的全部单词 */
  const wordList = ref([])
  /** 用户自定义词库（key=词库名, value=单词数组） */
  const customBanks = ref({})

  // ============================================================
  // ▶️ 听写状态
  // ============================================================
  const currentIndex = ref(0)
  const isPlaying = ref(false)
  const isFinished = ref(false)
  const statusMsg = ref('')

  /** 用户输入的内容 */
  const inputText = ref('')
  /** 是否已提交答案 */
  const isSubmitted = ref(false)
  /** 当前单词回答是否正确 */
  const isCorrect = ref(null)

  // ============================================================
  // ❌ 错词本
  // ============================================================
  /** 错词列表 { word, yourAnswer, timestamp } */
  const wrongWords = ref([])

  // ============================================================
  // 📊 统计
  // ============================================================
  /** 每日统计 { 'YYYY-MM-DD': { total, correct, wrong } } */
  const dailyStats = ref({})
  /** 今日已学单词数 */
  const learnedCount = ref(0)

  // ============================================================
  // ⚙️ 设置
  // ============================================================
  /** 播放模式：read-only / normal / blind / chinese */
  const playMode = ref('normal')
  /** 是否开启自动下一词 */
  const autoNext = ref(true)

  // ============================================================
  // 📐 计算属性
  // ============================================================
  const total = computed(() => wordList.value.length)
  const currentWord = computed(() => wordList.value[currentIndex.value] ?? '')
  const progressText = computed(() => `第 ${currentIndex.value + 1} / ${total.value} 个`)
  const today = computed(() => new Date().toISOString().slice(0, 10))
  const todayStats = computed(() => dailyStats.value[today.value] ?? { total: 0, correct: 0, wrong: 0 })

  // ============================================================
  // 🎯 动作
  // ============================================================

  /** 加载词库数据（从外部 JSON 或自定义词库） */
  function loadWordBank(name, words) {
    currentBank.value = name
    wordList.value = [...words]
    currentIndex.value = 0
    isFinished.value = false
    isSubmitted.value = false
    isCorrect.value = null
    inputText.value = ''
    statusMsg.value = ''
  }

  /** 提交输入答案，对比对错 */
  function submitAnswer() {
    if (isSubmitted.value) return
    isSubmitted.value = true

    const userAnswer = inputText.value.trim().toLowerCase()
    const correctAnswer = currentWord.value.toLowerCase()

    if (userAnswer === correctAnswer) {
      isCorrect.value = true
    } else {
      isCorrect.value = false
      wrongWords.value.push({
        word: currentWord.value,
        yourAnswer: inputText.value.trim(),
        timestamp: Date.now()
      })
    }

    // 更新今日统计
    const d = today.value
    if (!dailyStats.value[d]) {
      dailyStats.value[d] = { total: 0, correct: 0, wrong: 0 }
    }
    dailyStats.value[d].total++
    if (isCorrect.value) {
      dailyStats.value[d].correct++
    } else {
      dailyStats.value[d].wrong++
    }
    learnedCount.value++
  }

  /** 前进到下一个单词 */
  function nextWord() {
    if (currentIndex.value < total.value - 1) {
      currentIndex.value++
      isSubmitted.value = false
      isCorrect.value = null
      inputText.value = ''
      statusMsg.value = ''
    } else {
      isFinished.value = true
    }
  }

  /** 设置播放状态 */
  function setPlaying(val) {
    isPlaying.value = val
  }

  /** 设置状态消息 */
  function setStatus(msg) {
    statusMsg.value = msg
  }

  /** 重播当前单词 */
  function resetCurrent() {
    isSubmitted.value = false
    isCorrect.value = null
    inputText.value = ''
    statusMsg.value = ''
  }

  /** 重置全部 */
  function resetAll() {
    currentIndex.value = 0
    isFinished.value = false
    isSubmitted.value = false
    isCorrect.value = null
    inputText.value = ''
    statusMsg.value = ''
    isPlaying.value = false
    statusMsg.value = ''
  }

  /** 清空错词本 */
  function clearWrongWords() {
    wrongWords.value = []
  }

  /** 切换词库 */
  function switchBank(name) {
    const words = customBanks.value[name]
    if (words) {
      loadWordBank(name, words)
    }
  }

  /** 导入自定义词库 */
  function importBank(name, words) {
    customBanks.value[name] = [...words]
    bankNames.value = Object.keys(customBanks.value)
  }

  return {
    // 状态
    currentBank, bankNames, wordList, customBanks,
    currentIndex, isPlaying, isFinished, statusMsg,
    inputText, isSubmitted, isCorrect,
    wrongWords, dailyStats, learnedCount,
    playMode, autoNext,
    // 计算属性
    total, currentWord, progressText, today, todayStats,
    // 动作
    loadWordBank, submitAnswer, nextWord,
    setPlaying, setStatus, resetCurrent, resetAll,
    clearWrongWords, switchBank, importBank
  }
})
