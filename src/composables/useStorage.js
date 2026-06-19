/**
 * useStorage - localStorage 组合式函数
 * 负责听写应用的数据持久化
 */
import { watch } from 'vue'

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

/**
 * 将 Pinia store 中的响应式数据持久化到 localStorage
 * @param {import('vue').Ref} sourceRef  要持久化的 ref/reactive
 * @param {string} storageKey  localStorage 的 key
 * @param {*} defaultValue     默认值
 */
function persistRef(sourceRef, storageKey, defaultValue = null) {
  // 从 localStorage 恢复数据
  const stored = load(storageKey, defaultValue)
  if (stored !== null) {
    sourceRef.value = stored
  }

  // 监听变化，自动保存
  watch(sourceRef, (val) => {
    save(storageKey, val)
  }, { deep: true })
}

export function useStorage() {
  return {
    load,
    save,
    persistRef,
    STORAGE_KEYS
  }
}
