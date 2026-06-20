<script setup>
/**
 * WordBankManager.vue - 词库管理
 * 内置词库切换 + 用户自定义词库（创建、批量导入、单个添加）
 */
import { ref, onMounted } from 'vue'
import { useDictationStore } from '../stores/dictationStore'
import { useAuthStore } from '../stores/authStore'

const store = useDictationStore()
const authStore = useAuthStore()

// ============================================================
// 内置词库切换
// ============================================================
function selectBank(name) {
  store.switchBank(name)
}

// ============================================================
// 用户自定义词库
// ============================================================
const userBanks = ref([])
const showCreateBank = ref(false)
const newBankName = ref('')
const newBankLang = ref('en')

/** 从数据库加载用户的词库列表 */
async function loadUserBanks() {
  const userId = authStore.userId
  if (!userId) return
  try {
    const resp = await fetch(`/api/word-banks?userId=${encodeURIComponent(userId)}`)
    const json = await resp.json()
    if (json.data) userBanks.value = json.data
  } catch (err) {
    console.warn('[WordBank] 加载用户词库失败:', err.message)
  }
}

/** 创建词库 */
async function createBank() {
  if (!newBankName.value.trim()) return
  const userId = authStore.userId
  if (!userId) return

  try {
    const resp = await fetch('/api/word-banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name: newBankName.value.trim(),
        lang: newBankLang.value,
        words: [],
      }),
    })
    const json = await resp.json()
    if (json.success) {
      newBankName.value = ''
      showCreateBank.value = false
      await loadUserBanks()
      // 自动切换到新词库
      store.importBank(newBankName.value.trim(), [])
      store.switchBank(newBankName.value.trim())
    }
  } catch (err) {
    console.warn('[WordBank] 创建词库失败:', err.message)
  }
}

/** 加载某个用户词库的单词到 store */
async function loadUserBankWords(bankId, bankName) {
  try {
    const resp = await fetch(`/api/word-banks/${bankId}`)
    const json = await resp.json()
    if (json.data) {
      const words = json.data.map(w => ({ word: w.word, zh: w.translation || '' }))
      store.importBank(bankName, words)
      store.switchBank(bankName)
    }
  } catch (err) {
    console.warn('[WordBank] 加载词库单词失败:', err.message)
  }
}

// ============================================================
// 批量导入
// ============================================================
const importText = ref('')
const showImport = ref(false)
const importTargetBankId = ref(null)

/** 将文本解析为单词列表（支持 word,translation 每行一条） */
function parseImportText(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      // 尝试按逗号分割
      const commaIdx = line.indexOf(',')
      if (commaIdx > 0) {
        return {
          word: line.substring(0, commaIdx).trim(),
          translation: line.substring(commaIdx + 1).trim(),
        }
      }
      // 尝试按空格分割
      const spaceIdx = line.indexOf(' ')
      if (spaceIdx > 0) {
        return {
          word: line.substring(0, spaceIdx).trim(),
          translation: line.substring(spaceIdx + 1).trim(),
        }
      }
      // 只有单词
      return { word: line, translation: '' }
    })
}

/** 导入到内置词库（内存） */
function importToBuiltin() {
  const words = parseImportText(importText.value)
  if (words.length === 0) return

  const name = `自定义词库#${Date.now().toString(36).slice(-4)}`
  store.importBank(name, words)
  store.switchBank(name)
  importText.value = ''
  showImport.value = false
}

/** 导入到用户词库（数据库） */
async function importToUserBank() {
  const userId = authStore.userId
  if (!userId || !importTargetBankId.value) return

  const words = parseImportText(importText.value)
  if (words.length === 0) return

  try {
    await fetch('/api/word-banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name: newBankName.value.trim() || `词库#${Date.now().toString(36).slice(-4)}`,
        lang: newBankLang.value,
        words,
      }),
    })
    importText.value = ''
    showImport.value = false
    await loadUserBanks()
  } catch (err) {
    console.warn('[WordBank] 导入失败:', err.message)
  }
}

// ============================================================
// 单个添加单词
// ============================================================
const singleWord = ref('')
const singleTranslation = ref('')
const singleBankId = ref(null)

async function addSingleWord() {
  if (!singleWord.value.trim()) return
  const userId = authStore.userId
  if (!userId || !singleBankId.value) return

  try {
    await fetch('/api/word-banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name: singleBankId.value, // bank name
        lang: newBankLang.value,
        words: [{ word: singleWord.value.trim(), translation: singleTranslation.value.trim() }],
      }),
    })
    // 刷新
    await loadUserBankWords(singleBankId.value, singleBankId.value)
    singleWord.value = ''
    singleTranslation.value = ''
  } catch (err) {
    console.warn('[WordBank] 添加单词失败:', err.message)
  }
}

// ============================================================
// JSON 导入导出
// ============================================================
function exportBank(name) {
  const words = store.wordList
  const blob = new Blob([JSON.stringify({ [name]: words }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      Object.entries(data).forEach(([name, words]) => {
        if (Array.isArray(words)) store.importBank(name, words)
      })
      const firstBank = Object.keys(data)[0]
      if (firstBank) store.switchBank(firstBank)
    } catch (err) {
      alert('JSON 解析失败：' + err.message)
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

onMounted(() => {
  loadUserBanks()
})
</script>

<template>
  <div class="word-bank-manager">
    <h3 class="section-title">📚 词库管理</h3>

    <!-- ---- 内置词库 ---- -->
    <p class="sub-title">内置词库</p>
    <div class="bank-list">
      <button
        v-for="name in store.bankNames"
        :key="name"
        class="bank-chip"
        :class="{ active: store.currentBank === name }"
        @click="selectBank(name)"
      >
        {{ name }}
      </button>
    </div>

    <!-- ---- 用户自定义词库 ---- -->
    <p class="sub-title">我的词库</p>
    <div v-if="userBanks.length > 0" class="bank-list">
      <button
        v-for="bank in userBanks"
        :key="bank.id"
        class="bank-chip"
        :class="{ active: store.currentBank === bank.name }"
        @click="loadUserBankWords(bank.id, bank.name)"
      >
        {{ bank.name }}
        <span class="bank-count">({{ bank.word_count }})</span>
      </button>
    </div>
    <p v-else class="empty-hint">还没有创建词库</p>

    <!-- 创建词库 -->
    <div class="actions">
      <button class="action-btn" @click="showCreateBank = !showCreateBank">
        ➕ 创建词库
      </button>
    </div>
    <div v-if="showCreateBank" class="create-bank-panel">
      <input
        v-model="newBankName"
        type="text"
        class="form-input"
        placeholder="词库名称（如：我的单词本）"
        @keyup.enter="createBank"
      />
      <select v-model="newBankLang" class="form-select">
        <option value="en">英语</option>
        <option value="zh">语文</option>
      </select>
      <button class="btn-confirm" :disabled="!newBankName.trim()" @click="createBank">
        ✅ 创建
      </button>
    </div>

    <!-- 导入面板 -->
    <div class="actions">
      <button class="action-btn" @click="showImport = !showImport">
        📥 导入词库
      </button>
      <button class="action-btn" @click="exportBank(store.currentBank)">
        📤 导出当前
      </button>
      <label class="action-btn upload-label">
        📂 上传 JSON
        <input type="file" accept=".json" hidden @change="handleFileUpload" />
      </label>
    </div>

    <div v-if="showImport" class="import-panel">
      <p class="import-hint">每行一条：<code>单词, 释义</code> 或 <code>en, zh</code></p>
      <textarea
        v-model="importText"
        class="import-textarea"
        placeholder="apple, 苹果&#10;book, 书&#10;cat, 猫"
        rows="8"
      />
      <div class="import-actions">
        <button class="btn-confirm" :disabled="!importText.trim()" @click="importToBuiltin">
          📥 导入到本地
        </button>
      </div>
    </div>

    <!-- 当前词库预览 -->
    <div class="word-preview">
      <p class="preview-count">共 {{ store.total }} 个单词</p>
      <div class="preview-chips">
        <span
          v-for="(w, i) in store.wordList"
          :key="i"
          class="preview-chip"
          :class="{ current: i === store.currentIndex }"
        >
          {{ typeof w === 'object' ? (w.word || w.en) : w }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.word-bank-manager {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
}

.sub-title {
  margin: 4px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
}

.bank-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bank-chip {
  padding: 6px 14px;
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 20px;
  background: var(--bg-card, #fff);
  color: var(--text-secondary, #64748b);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.bank-chip.active {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}

.bank-count {
  font-weight: 400;
  font-size: 12px;
  margin-left: 2px;
}

.empty-hint {
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  margin: 0;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-card, #fff);
  color: var(--text-secondary, #475569);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:active {
  transform: scale(0.97);
}

.upload-label {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.create-bank-panel {
  display: flex;
  gap: 8px;
  align-items: center;
}

.form-input {
  flex: 1;
  height: 44px;
  padding: 0 14px;
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-input, #fff);
  color: var(--text-primary, #1e293b);
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: #3b82f6;
}

.form-select {
  height: 44px;
  padding: 0 12px;
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 10px;
  background: var(--bg-input, #fff);
  color: var(--text-primary, #1e293b);
  font-size: 15px;
  outline: none;
  cursor: pointer;
}

.import-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.import-hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
}

.import-hint code {
  background: var(--bg-secondary, #e2e8f0);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.import-textarea {
  width: 100%;
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 12px;
  font-size: 15px;
  font-family: inherit;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
  background: var(--bg-input, #fff);
  color: var(--text-primary, #1e293b);
  box-sizing: border-box;
}

.import-textarea:focus {
  border-color: #3b82f6;
}

.import-actions {
  display: flex;
  gap: 10px;
}

.btn-confirm {
  height: 44px;
  padding: 0 24px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.word-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-count {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
}

.preview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.preview-chip {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  background: var(--bg-secondary, #f1f5f9);
  color: var(--text-secondary, #64748b);
}

.preview-chip.current {
  background: #3b82f6;
  color: #fff;
}
</style>
