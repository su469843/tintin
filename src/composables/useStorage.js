/**
 * useStorage - localStorage 组合式函数
 * 负责听写应用的数据持久化
 */
const STORAGE_KEYS = {
  WRONG_WORDS: 'dictation_wrong_words',
  DAILY_STATS: 'dictation_daily_stats',
  CUSTOM_BANKS: 'dictation_custom_banks',
  CURRENT_BANK: 'dictation_current_bank',
  SETTINGS: 'dictation_settings'
}

/**
 * 从 localStorage 加载数据
 * @param {string} key
 * @param {*} defaultValue
 */
function load(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * 保存数据到 localStorage
 * @param {string} key
 * @param {*} value
 */
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn('localStorage 写入失败:', err)
  }
}

export function useStorage() {
  return {
    load,
    save,
    STORAGE_KEYS
  }
}
