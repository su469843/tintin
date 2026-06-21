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
const newBankAllowImport = ref(true)

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

  const bankName = newBankName.value.trim()
  const bankLang = newBankLang.value
  const bankPublic = newBankPublic.value

  try {
    const resp = await fetch('/api/word-banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        name: bankName,
        lang: bankLang,
        isPublic: bankPublic,
        allowImport: newBankAllowImport.value,
        words: [],
      }),
    })
    const json = await resp.json()
    if (json.success) {
      newBankName.value = ''
      showCreateBank.value = false
      await loadUserBanks()
      store.importBank(bankName, [])
      store.switchBank(bankName)
      // 自动进入添加单词模式
      activeAddBankId.value = json.bankId
      activeAddBankName.value = bankName
      showAddWord.value = true
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
// 添加单词到已有词库
// ============================================================
const showAddWord = ref(false)
const activeAddBankId = ref(null)
const activeAddBankName = ref('')
const addWordText = ref('')
const addWordTranslation = ref('')

function openAddWord(bank) {
  activeAddBankId.value = bank.id
  activeAddBankName.value = bank.name
  showAddWord.value = true
  addWordText.value = ''
  addWordTranslation.value = ''
}

async function addWordToBank() {
  if (!addWordText.value.trim() || !activeAddBankId.value) return
  try {
    const resp = await fetch(`/api/word-banks/${activeAddBankId.value}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: addWordText.value.trim(),
        translation: addWordTranslation.value.trim() || null,
      }),
    })
    const json = await resp.json()
    if (json.success) {
      addWordText.value = ''
      addWordTranslation.value = ''
      await loadUserBanks()
      // 重新加载词库到 store
      await loadUserBankWords(activeAddBankId.value, activeAddBankName.value)
    }
  } catch (err) {
    console.warn('[WordBank] 添加单词失败:', err.message)
  }
}

async function addBatchToBank() {
  if (!importText.value.trim() || !activeAddBankId.value) return
  const words = parseImportText(importText.value)
  if (words.length === 0) return
  try {
    for (const w of words) {
      await fetch(`/api/word-banks/${activeAddBankId.value}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: w.word, translation: w.translation || null }),
      })
    }
    importText.value = ''
    showImport.value = false
    await loadUserBanks()
    await loadUserBankWords(activeAddBankId.value, activeAddBankName.value)
  } catch (err) {
    console.warn('[WordBank] 批量添加失败:', err.message)
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
        <span v-if="bank.allow_import === false" class="private-badge">禁止导入</span>
        <span class="bank-count">({{ bank.word_count }})</span>
        <span class="add-word-icon" @click.stop="openAddWord(bank)" title="添加单词">➕</span>
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
      <label v-if="newBankPublic" class="public-toggle">
        <input v-model="newBankAllowImport" type="checkbox" />
        允许他人导入
      </label>
      <button class="btn-confirm" :disabled="!newBankName.trim()" @click="createBank">✅ 创建</button>
    </div>

    <!-- 添加单词到词库 -->
    <div v-if="showAddWord" class="add-word-panel">
      <p class="add-word-title">✍️ 添加单词到「{{ activeAddBankName }}」</p>
      <div class="add-word-row">
        <input v-model="addWordText" type="text" class="form-input" :placeholder="activeAddBankName.includes('语文') || activeAddBankName.includes('chinese') ? '词语' : '单词'" @keyup.enter="addWordToBank" />
        <input v-model="addWordTranslation" type="text" class="form-input" :placeholder="activeAddBankName.includes('语文') || activeAddBankName.includes('chinese') ? '拼音' : '释义'" @keyup.enter="addWordToBank" />
        <button class="btn-confirm" :disabled="!addWordText.trim()" @click="addWordToBank">➕ 添加</button>
      </div>
      <div class="add-word-actions">
        <button class="action-btn small" @click="showImport = !showImport">📥 批量添加</button>
        <button class="action-btn small" @click="showAddWord = false">❎ 关闭</button>
      </div>
    </div>

    <!-- 批量导入面板 -->
    <div v-if="showImport" class="import-panel">
      <p class="import-hint">每行一条：<code>单词, 释义</code></p>
      <textarea v-model="importText" class="import-textarea" placeholder="apple, 苹果&#10;book, 书" rows="6" />
      <div class="import-actions">
        <button class="btn-confirm" :disabled="!importText.trim()" @click="importToBuiltin">📥 导入到本地</button>
        <button v-if="authStore.isLoggedIn" class="btn-confirm btn-save" :disabled="!importText.trim()" @click="importToPrivate">💾 保存到我的词库</button>
        <button v-if="showAddWord" class="btn-confirm btn-save" :disabled="!importText.trim()" @click="addBatchToBank">💾 添加到当前词库</button>
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
.bank-chip.active { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff; border-color: #0ea5e9; }
.public-chip { border-color: #10b981; }
.creator-name { font-weight: 400; font-size: 11px; color: var(--text-muted); max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bank-chip.active .creator-name { color: rgba(255,255,255,0.7); }
.bank-count { font-weight: 400; font-size: 12px; }
.public-badge { font-size: 10px; background: #10b981; color: #fff; padding: 1px 6px; border-radius: 8px; }
.private-badge { font-size: 10px; background: #f59e0b; color: #fff; padding: 1px 6px; border-radius: 8px; }
.empty-hint { font-size: 13px; color: var(--text-muted); margin: 0; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.action-btn { padding: 8px 16px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-card); color: var(--text-secondary); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.action-btn:active { transform: scale(0.97); }
.upload-label { display: inline-flex; align-items: center; cursor: pointer; }
.create-bank-panel { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.form-input { flex: 1; min-width: 120px; height: 44px; padding: 0 14px; border: 2px solid var(--border-color); border-radius: 10px; background: var(--bg-input); color: var(--text-primary); font-size: 15px; outline: none; }
.form-input:focus { border-color: #0ea5e9; }
.form-select { height: 44px; padding: 0 12px; border: 2px solid var(--border-color); border-radius: 10px; background: var(--bg-input); color: var(--text-primary); font-size: 15px; outline: none; cursor: pointer; }
.public-toggle { display: flex; align-items: center; gap: 4px; font-size: 14px; color: var(--text-secondary); cursor: pointer; }
.import-panel { display: flex; flex-direction: column; gap: 10px; }
.import-hint { margin: 0; font-size: 13px; color: var(--text-muted); }
.import-hint code { background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.import-textarea { width: 100%; border: 2px solid var(--border-color); border-radius: 12px; padding: 12px; font-size: 15px; font-family: inherit; resize: vertical; outline: none; background: var(--bg-input); color: var(--text-primary); box-sizing: border-box; }
.import-textarea:focus { border-color: #0ea5e9; }
.import-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-confirm { height: 44px; padding: 0 24px; border: none; border-radius: 10px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
.btn-confirm:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-save { background: linear-gradient(135deg, #0ea5e9, #0284c7); }
.word-preview { display: flex; flex-direction: column; gap: 8px; }
.preview-count { margin: 0; font-size: 13px; color: var(--text-muted); }
.preview-chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 200px; overflow-y: auto; }
.preview-chip { padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 500; background: var(--bg-secondary); color: var(--text-secondary); }
.preview-chip.current { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff; }

/* 添加单词图标 */
.add-word-icon {
  margin-left: 4px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.add-word-icon:hover { opacity: 1; }

/* 添加单词面板 */
.add-word-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--bg-card);
  border-radius: 12px;
  border: 2px solid var(--border-color);
}
.add-word-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}
.add-word-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.add-word-row .form-input { flex: 1; min-width: 80px; height: 40px; font-size: 14px; }
.add-word-actions {
  display: flex;
  gap: 8px;
}
.action-btn.small {
  padding: 6px 12px;
  font-size: 13px;
}

/* 手机端适配 */
@media (max-width: 420px) {
  .word-bank-manager {
    gap: 10px;
  }

  .section-title {
    font-size: 16px;
  }

  .sub-title {
    font-size: 13px;
  }

  .bank-list {
    gap: 4px;
  }

  .bank-chip {
    padding: 5px 10px;
    font-size: 13px;
    border-radius: 16px;
    gap: 3px;
  }

  .creator-name {
    max-width: 60px;
    font-size: 10px;
  }

  .actions {
    gap: 6px;
  }

  .action-btn {
    padding: 6px 12px;
    font-size: 13px;
    border-radius: 8px;
  }

  .create-bank-panel {
    gap: 6px;
  }

  .form-input {
    min-width: 100px;
    height: 40px;
    padding: 0 10px;
    font-size: 14px;
  }

  .form-select {
    height: 40px;
    padding: 0 8px;
    font-size: 14px;
  }

  .btn-confirm {
    height: 40px;
    padding: 0 16px;
    font-size: 14px;
  }

  .import-textarea {
    padding: 10px;
    font-size: 14px;
  }

  .add-word-panel {
    padding: 12px;
    gap: 8px;
  }

  .add-word-row {
    gap: 6px;
    flex-wrap: wrap;
  }

  .add-word-row .form-input {
    min-width: 70px;
    height: 38px;
    font-size: 13px;
  }

  .preview-chips {
    max-height: 150px;
    gap: 4px;
  }

  .preview-chip {
    padding: 3px 8px;
    font-size: 12px;
  }
}
</style>
