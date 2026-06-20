<script setup>
/**
 * WordBankManager.vue - 词库管理（三区）
 * 1. 系统内置
 * 2. 公共区 - 所有人上传的公开词库
 * 3. 私有区 - 自己的词库，他人不可见
 */
import { ref, onMounted } from 'vue'
import { useDictationStore } from '../stores/dictationStore'
import { useAuthStore } from '../stores/authStore'

const store = useDictationStore()
const authStore = useAuthStore()

// ============================================================
// 1. 系统内置词库
// ============================================================
function selectBank(name) {
  store.switchBank(name)
}

// ============================================================
// 2. 公共区
// ============================================================
const publicBanks = ref([])

async function loadPublicBanks() {
  try {
    const resp = await fetch('/api/word-banks?public=true')
    const json = await resp.json()
    if (json.data) publicBanks.value = json.data
  } catch (err) {
    console.warn('[WordBank] 加载公共词库失败:', err.message)
  }
}

async function loadPublicBankWords(bank) {
  try {
    const resp = await fetch(`/api/word-banks?id=${encodeURIComponent(bank.id)}`)
    const json = await resp.json()
    if (json.data) {
      const words = json.data.map(w => ({ word: w.word, zh: w.translation || '' }))
      store.importBank(bank.name, words)
      store.switchBank(bank.name)
    }
  } catch (err) {
    console.warn('[WordBank] 加载词库失败:', err.message)
  }
}

// ============================================================
// 3. 私有区
// ============================================================
const userBanks = ref([])
const showCreateBank = ref(false)
const newBankName = ref('')
const newBankLang = ref('en')
const newBankPublic = ref(false)

async function loadUserBanks() {
  const userId = authStore.userId
  if (!userId) return
  try {
    const resp = await fetch(`/api/word-banks?userId=${encodeURIComponent(userId)}`)
    const json = await resp.json()
    if (json.data) userBanks.value = json.data
  } catch (err) {
    console.warn('[WordBank] 加载私有词库失败:', err.message)
  }
}

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
        isPublic: newBankPublic.value,
        words: [],
      }),
    })
    const json = await resp.json()
    if (json.success) {
      newBankName.value = ''
      showCreateBank.value = false
      await loadUserBanks()
      store.importBank(newBankName.value.trim(), [])
      store.switchBank(newBankName.value.trim())
    }
  } catch (err) {
    console.warn('[WordBank] 创建词库失败:', err.message)
  }
}

async function loadUserBankWords(bankId, bankName) {
  try {
    const resp = await fetch(`/api/word-banks?id=${encodeURIComponent(bankId)}`)
    const json = await resp.json()
    if (json.data) {
      const words = json.data.map(w => ({ word: w.word, zh: w.translation || '' }))
      store.importBank(bankName, words)
      store.switchBank(bankName)
    }
  } catch (err) {
    console.warn('[WordBank] 加载词库失败:', err.message)
  }
}

// ============================================================
// 批量添加
// ============================================================
const importText = ref('')
const showImport = ref(false)

function parseImportText(text) {
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0).map(line => {
    const comma = line.indexOf(',')
    if (comma > 0) return { word: line.substring(0, comma).trim(), translation: line.substring(comma + 1).trim() }
    const space = line.indexOf(' ')
    if (space > 0) return { word: line.substring(0, space).trim(), translation: line.substring(space + 1).trim() }
    return { word: line, translation: '' }
  })
}

function importToBuiltin() {
  const words = parseImportText(importText.value)
  if (words.length === 0) return
  const name = `自定义词库#${Date.now().toString(36).slice(-4)}`
  store.importBank(name, words)
  store.switchBank(name)
  importText.value = ''
  showImport.value = false
}

async function importToPrivate() {
  const userId = authStore.userId
  if (!userId) return
  const words = parseImportText(importText.value)
  if (words.length === 0) return

  const name = `我的词库#${Date.now().toString(36).slice(-4)}`
  try {
    await fetch('/api/word-banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name, lang: 'en', isPublic: false, words }),
    })
    importText.value = ''
    showImport.value = false
    await loadUserBanks()
    store.importBank(name, words)
    store.switchBank(name)
  } catch (err) {
    console.warn('[WordBank] 导入失败:', err.message)
  }
}

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
    } catch (err) { alert('JSON 解析失败：' + err.message) }
  }
  reader.readAsText(file)
  event.target.value = ''
}

onMounted(() => {
  loadUserBanks()
  loadPublicBanks()
})
</script>

<template>
  <div class="word-bank-manager">
    <h3 class="section-title">📚 词库管理</h3>

    <!-- ========== 1. 系统内置 ========== -->
    <p class="sub-title">📦 系统内置</p>
    <div class="bank-list">
      <button v-for="name in store.bankNames" :key="name" class="bank-chip"
        :class="{ active: store.currentBank === name }" @click="selectBank(name)">
        {{ name }}
      </button>
    </div>

    <!-- ========== 2. 公共区 ========== -->
    <p class="sub-title">🌍 公共词库</p>
    <div v-if="publicBanks.length > 0" class="bank-list">
      <button v-for="bank in publicBanks" :key="'pub-'+bank.id" class="bank-chip public-chip"
        :class="{ active: store.currentBank === bank.name }" @click="loadPublicBankWords(bank)">
        {{ bank.name }}
        <span class="creator-name">by {{ bank.creator_name || '匿名' }}</span>
        <span class="bank-count">({{ bank.word_count }})</span>
      </button>
    </div>
    <p v-else class="empty-hint">暂无公开词库</p>

    <!-- ========== 3. 私有区 ========== -->
    <p class="sub-title">🔒 我的词库</p>
    <div v-if="userBanks.length > 0" class="bank-list">
      <button v-for="bank in userBanks" :key="'my-'+bank.id" class="bank-chip"
        :class="{ active: store.currentBank === bank.name }" @click="loadUserBankWords(bank.id, bank.name)">
        {{ bank.name }}
        <span v-if="bank.is_public" class="public-badge">公开</span>
        <span class="bank-count">({{ bank.word_count }})</span>
      </button>
    </div>
    <p v-else class="empty-hint">还没有创建词库</p>

    <!-- 创建词库 -->
    <div class="actions">
      <button class="action-btn" @click="showCreateBank = !showCreateBank">➕ 创建词库</button>
      <button class="action-btn" @click="showImport = !showImport">📥 批量导入</button>
      <button class="action-btn" @click="exportBank(store.currentBank)">📤 导出</button>
      <label class="action-btn upload-label">📂 上传 JSON<input type="file" accept=".json" hidden @change="handleFileUpload" /></label>
    </div>

    <div v-if="showCreateBank" class="create-bank-panel">
      <input v-model="newBankName" type="text" class="form-input" placeholder="词库名称" @keyup.enter="createBank" />
      <select v-model="newBankLang" class="form-select">
        <option value="en">英语</option>
        <option value="zh">语文</option>
      </select>
      <label class="public-toggle">
        <input v-model="newBankPublic" type="checkbox" />
        公开
      </label>
      <button class="btn-confirm" :disabled="!newBankName.trim()" @click="createBank">✅ 创建</button>
    </div>

    <!-- 批量导入面板 -->
    <div v-if="showImport" class="import-panel">
      <p class="import-hint">每行一条：<code>单词, 释义</code></p>
      <textarea v-model="importText" class="import-textarea" placeholder="apple, 苹果&#10;book, 书" rows="6" />
      <div class="import-actions">
        <button class="btn-confirm" :disabled="!importText.trim()" @click="importToBuiltin">📥 导入到本地</button>
        <button v-if="authStore.isLoggedIn" class="btn-confirm btn-save" :disabled="!importText.trim()" @click="importToPrivate">💾 保存到我的词库</button>
      </div>
    </div>

    <!-- 当前词库预览 -->
    <div class="word-preview">
      <p class="preview-count">共 {{ store.total }} 个单词</p>
      <div class="preview-chips">
        <span v-for="(w, i) in store.wordList" :key="i" class="preview-chip"
          :class="{ current: i === store.currentIndex }">
          {{ typeof w === 'object' ? (w.word || w.en) : w }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.word-bank-manager { width: 100%; display: flex; flex-direction: column; gap: 12px; }
.section-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-primary); }
.sub-title { margin: 4px 0 0; font-size: 14px; font-weight: 600; color: var(--text-secondary); }
.bank-list { display: flex; flex-wrap: wrap; gap: 6px; }
.bank-chip { padding: 6px 14px; border: 2px solid var(--border-color); border-radius: 20px; background: var(--bg-card); color: var(--text-secondary); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px; }
.bank-chip.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.public-chip { border-color: #10b981; }
.creator-name { font-weight: 400; font-size: 11px; color: var(--text-muted); max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bank-chip.active .creator-name { color: rgba(255,255,255,0.7); }
.bank-count { font-weight: 400; font-size: 12px; }
.public-badge { font-size: 10px; background: #10b981; color: #fff; padding: 1px 6px; border-radius: 8px; }
.empty-hint { font-size: 13px; color: var(--text-muted); margin: 0; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.action-btn { padding: 8px 16px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-card); color: var(--text-secondary); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.action-btn:active { transform: scale(0.97); }
.upload-label { display: inline-flex; align-items: center; cursor: pointer; }
.create-bank-panel { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.form-input { flex: 1; min-width: 120px; height: 44px; padding: 0 14px; border: 2px solid var(--border-color); border-radius: 10px; background: var(--bg-input); color: var(--text-primary); font-size: 15px; outline: none; }
.form-input:focus { border-color: #3b82f6; }
.form-select { height: 44px; padding: 0 12px; border: 2px solid var(--border-color); border-radius: 10px; background: var(--bg-input); color: var(--text-primary); font-size: 15px; outline: none; cursor: pointer; }
.public-toggle { display: flex; align-items: center; gap: 4px; font-size: 14px; color: var(--text-secondary); cursor: pointer; }
.import-panel { display: flex; flex-direction: column; gap: 10px; }
.import-hint { margin: 0; font-size: 13px; color: var(--text-muted); }
.import-hint code { background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.import-textarea { width: 100%; border: 2px solid var(--border-color); border-radius: 12px; padding: 12px; font-size: 15px; font-family: inherit; resize: vertical; outline: none; background: var(--bg-input); color: var(--text-primary); box-sizing: border-box; }
.import-textarea:focus { border-color: #3b82f6; }
.import-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-confirm { height: 44px; padding: 0 24px; border: none; border-radius: 10px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
.btn-confirm:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-save { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.word-preview { display: flex; flex-direction: column; gap: 8px; }
.preview-count { margin: 0; font-size: 13px; color: var(--text-muted); }
.preview-chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 200px; overflow-y: auto; }
.preview-chip { padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 500; background: var(--bg-secondary); color: var(--text-secondary); }
.preview-chip.current { background: #3b82f6; color: #fff; }
</style>
