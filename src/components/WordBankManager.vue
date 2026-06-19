<script setup>
/**
 * WordBankManager.vue - 词库管理
 * 词库切换、导入、查看
 */
import { ref } from 'vue'
import { useDictationStore } from '../stores/dictationStore'

const store = useDictationStore()

const importText = ref('')
const showImport = ref(false)

/** 切换词库 */
function selectBank(name) {
  store.switchBank(name)
}

/** 导入文本词库（每行一个单词） */
function importFromText() {
  const words = importText.value
    .split(/[\n,，\s]+/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0)

  if (words.length === 0) return

  const name = `自定义词库#${Date.now().toString(36).slice(-4)}`
  store.importBank(name, words)
  store.switchBank(name)
  importText.value = ''
  showImport.value = false
}

/** 导出词库为 JSON */
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

/** 上传 JSON 文件 */
function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      Object.entries(data).forEach(([name, words]) => {
        if (Array.isArray(words)) {
          store.importBank(name, words)
        }
      })
      // 切换到第一个导入的词库
      const firstBank = Object.keys(data)[0]
      if (firstBank) store.switchBank(firstBank)
    } catch (err) {
      alert('JSON 解析失败：' + err.message)
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}
</script>

<template>
  <div class="word-bank-manager">
    <h3 class="section-title">📚 词库管理</h3>

    <!-- 词库切换 -->
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

    <!-- 导入导出按钮 -->
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

    <!-- 导入面板 -->
    <div v-if="showImport" class="import-panel">
      <textarea
        v-model="importText"
        class="import-textarea"
        placeholder="每行一个单词，或逗号/空格分隔"
        rows="6"
      />
      <button class="btn-confirm" :disabled="!importText.trim()" @click="importFromText">
        ✅ 确认导入
      </button>
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
          {{ w }}
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
  gap: 16px;
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
}

.bank-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bank-chip {
  padding: 6px 16px;
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

.actions {
  display: flex;
  gap: 12px;
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

.import-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.btn-confirm {
  height: 44px;
  padding: 0 24px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  font-size: 16px;
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
