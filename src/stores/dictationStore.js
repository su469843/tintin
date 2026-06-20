import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from './authStore'

/**
 * 听写应用核心状态管理
 * Pinia composition API 风格（setup store）
 *
 * 数据策略：
 * - 听写状态：纯内存
 * - 错词本/统计：PostgreSQL 为主，localStorage 为离线缓存
 */
export const useDictationStore = defineStore('dictation', () => {
  // ============================================================
  // 词库状态
  // ============================================================
  const currentBank = ref('四级词汇')
  const bankNames = ref([])
  const wordList = ref([])
  const customBanks = ref({})

  // ============================================================
  // 听写状态
  // ============================================================
  const currentIndex = ref(0)
  const isPlaying = ref(false)
  const isFinished = ref(false)
  const statusMsg = ref('')

  const inputText = ref('')
  const isSubmitted = ref(false)
  const isCorrect = ref(null)

  // ============================================================
  // 听写模式: 'display' (屏幕显示) | 'listening' (纯听力)
  // ============================================================
  const dictationMode = ref('display')

  // ============================================================
  // 本轮听写结果（用于结束后统一展示）
  // ============================================================
  /** { word, wordZh, yourAnswer, correct }[] */
  const sessionResults = ref([])

  // ============================================================
  // 错词本
  // ============================================================
  /** 从数据库加载的错词列表 */
  const wrongWords = ref([])
  /** 是否处于错词复习模式 */
  const isReviewMode = ref(false)

  // ============================================================
  // 统计
  // ============================================================
  const dailyStats = ref({})
  const learnedCount = ref(0)

  // ============================================================
  // 设置
  // ============================================================
  const playMode = ref('normal')
  const autoNext = ref(true)

  // ============================================================
  // 加载状态
  // ============================================================
  const isLoading = ref(false)

  // ============================================================
  // 计算属性
  // ============================================================
  const total = computed(() => wordList.value.length)

  function getWordEn(w) {
    if (typeof w !== 'object' || w === null) return w ?? ''
    if (w.word) return w.word
    if (w.en) return w.en
    return ''
  }

  function getWordZh(w) {
    if (typeof w !== 'object' || w === null) return ''
    if (w.pinyin) return w.pinyin
    if (w.zh) return w.zh
    return ''
  }

  const currentWord = computed(() => getWordEn(wordList.value[currentIndex.value]))
  const currentWordZh = computed(() => getWordZh(wordList.value[currentIndex.value]))

  const isChineseBank = computed(() => {
    const w = wordList.value[currentIndex.value]
    const text = getWordEn(w)
    return /[\u4e00-\u9fa5]/.test(text)
  })

  const progressText = computed(() => `第 ${currentIndex.value + 1} / ${total.value} 个`)
  const today = computed(() => new Date().toISOString().slice(0, 10))
  const todayStats = computed(() => dailyStats.value[today.value] ?? { total: 0, correct: 0, wrong: 0 })

  /** 本轮正确率 */
  const sessionAccuracy = computed(() => {
    if (sessionResults.value.length === 0) return 0
    const correct = sessionResults.value.filter(r => r.correct).length
    return Math.round((correct / sessionResults.value.length) * 100)
  })

  /** 本轮错词 */
  const sessionWrongWords = computed(() =>
    sessionResults.value.filter(r => !r.correct)
  )

  // ============================================================
  // API 封装
  // ============================================================

  /** 获取当前用户 ID */
  function getUserId() {
    const authStore = useAuthStore()
    return authStore.userId
  }

  /** 提交错词到数据库 */
  async function syncWrongWordToDB(word, wordZh, yourAnswer) {
    const userId = getUserId()
    if (!userId) return
    try {
      await fetch('/api/wrong-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          word,
          wordZh: wordZh || null,
          yourAnswer: yourAnswer || null,
          bankName: currentBank.value,
        }),
      })
    } catch (err) {
      console.warn('[Store] 同步错词失败:', err.message)
    }
  }

  /** 同步当日统计到数据库 */
  async function syncStatsToDB(date, total, correct, wrong) {
    const userId = getUserId()
    if (!userId) return
    try {
      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, date, total, correct, wrong }),
      })
    } catch (err) {
      console.warn('[Store] 同步统计失败:', err.message)
    }
  }

  /** 从数据库加载错词列表 */
  async function fetchWrongWords() {
    const userId = getUserId()
    if (!userId) return
    isLoading.value = true
    try {
      const resp = await fetch(`/api/wrong-words?userId=${encodeURIComponent(userId)}&limit=500`)
      const json = await resp.json()
      if (json.data) {
        wrongWords.value = json.data.map(row => ({
          id: row.id,
          word: row.word,
          wordZh: row.word_zh || '',
          yourAnswer: row.your_answer || '',
          bankName: row.bank_name || '',
          timestamp: new Date(row.created_at).getTime(),
        }))
      }
    } catch (err) {
      console.warn('[Store] 加载错词失败:', err.message)
    } finally {
      isLoading.value = false
    }
  }

  /** 从数据库加载统计数据 */
  async function fetchStats() {
    const userId = getUserId()
    if (!userId) return
    try {
      const resp = await fetch(`/api/stats?userId=${encodeURIComponent(userId)}`)
      const json = await resp.json()
      if (json.data) {
        dailyStats.value = json.data
      }
    } catch (err) {
      console.warn('[Store] 加载统计失败:', err.message)
    }
  }

  /** 删除指定错词 */
  async function deleteWrongWord(id) {
    const userId = getUserId()
    if (!userId) return
    try {
      await fetch('/api/wrong-words', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ids: [id] }),
      })
      wrongWords.value = wrongWords.value.filter(w => w.id !== id)
    } catch (err) {
      console.warn('[Store] 删除错词失败:', err.message)
    }
  }

  // ============================================================
  // 动作
  // ============================================================

  function loadWordBank(name, words) {
    currentBank.value = name
    wordList.value = [...words]
    currentIndex.value = 0
    isFinished.value = false
    isSubmitted.value = false
    isCorrect.value = null
    inputText.value = ''
    statusMsg.value = ''
    sessionResults.value = []
    isReviewMode.value = false
  }

  /** 提交输入答案 */
  function submitAnswer() {
    if (isSubmitted.value) return
    isSubmitted.value = true

    const userAnswer = inputText.value.trim().toLowerCase()
    const correctAnswer = currentWord.value.toLowerCase()
    const correct = userAnswer === correctAnswer
    isCorrect.value = correct

    // 记录本轮结果
    sessionResults.value.push({
      word: currentWord.value,
      wordZh: currentWordZh.value,
      yourAnswer: inputText.value.trim(),
      correct,
    })

    if (!correct) {
      // 同步到数据库
      syncWrongWordToDB(currentWord.value, currentWordZh.value, inputText.value.trim())
    }

    // 更新本地统计
    const d = today.value
    if (!dailyStats.value[d]) {
      dailyStats.value[d] = { total: 0, correct: 0, wrong: 0 }
    }
    dailyStats.value[d].total++
    if (correct) {
      dailyStats.value[d].correct++
    } else {
      dailyStats.value[d].wrong++
    }
    learnedCount.value++

    // 同步统计到数据库
    syncStatsToDB(d, 1, correct ? 1 : 0, correct ? 0 : 1)
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

  function setPlaying(val) { isPlaying.value = val }
  function setStatus(msg) { statusMsg.value = msg }

  function resetCurrent() {
    isSubmitted.value = false
    isCorrect.value = null
    inputText.value = ''
    statusMsg.value = ''
  }

  function resetAll() {
    currentIndex.value = 0
    isFinished.value = false
    isSubmitted.value = false
    isCorrect.value = null
    inputText.value = ''
    statusMsg.value = ''
    isPlaying.value = false
    sessionResults.value = []
    isReviewMode.value = false
  }

  /** 设置听写模式 */
  function setDictationMode(mode) {
    dictationMode.value = mode
  }

  /** 清空错词本 */
  async function clearWrongWords() {
    const userId = getUserId()
    if (!userId) return
    try {
      await fetch('/api/wrong-words', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      wrongWords.value = []
    } catch (err) {
      console.warn('[Store] 清空错词失败:', err.message)
    }
  }

  /** 开始错词复习：从数据库获取打乱的错词，加载为新词库 */
  async function startWrongWordReview() {
    const userId = getUserId()
    if (!userId) return false
    isLoading.value = true
    try {
      const resp = await fetch(`/api/wrong-words/review?userId=${encodeURIComponent(userId)}`)
      const json = await resp.json()

      if (!json.data || json.data.length === 0) {
        statusMsg.value = '暂无错词，无需复习'
        isLoading.value = false
        return false
      }

      // 将错词转为词库格式
      const reviewWords = json.data.map(row => ({
        en: row.word,
        zh: row.word_zh || '',
        _reviewId: row.id, // 保留 ID 用于复习正确后删除
      }))

      currentBank.value = '错词复习'
      wordList.value = reviewWords
      currentIndex.value = 0
      isFinished.value = false
      isSubmitted.value = false
      isCorrect.value = null
      inputText.value = ''
      statusMsg.value = ''
      sessionResults.value = []
      isReviewMode.value = true

      isLoading.value = false
      return true
    } catch (err) {
      console.warn('[Store] 加载错词复习失败:', err.message)
      isLoading.value = false
      return false
    }
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
    dictationMode, sessionResults, isReviewMode,
    wrongWords, dailyStats, learnedCount,
    playMode, autoNext, isLoading,
    // 计算属性
    total, currentWord, currentWordZh, isChineseBank,
    progressText, today, todayStats,
    sessionAccuracy, sessionWrongWords,
    // 工具函数
    getWordEn, getWordZh,
    // 动作
    loadWordBank, submitAnswer, nextWord,
    setPlaying, setStatus, resetCurrent, resetAll,
    setDictationMode, clearWrongWords, switchBank, importBank,
    startWrongWordReview,
    // DB 操作
    fetchWrongWords, fetchStats, deleteWrongWord,
    syncWrongWordToDB, syncStatsToDB,
  }
})
