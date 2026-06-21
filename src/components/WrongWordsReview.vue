<script setup>
/**
 * WrongWordsReview.vue - 错词本管理 & 复习入口
 *
 * 功能：
 * - 显示错词本概览（总数、按词库分类）
 * - 单个错词可手动删除
 * - "开始复习" 按钮将错词打乱后进入听写
 * - 清空错词本
 */
import { computed } from 'vue'
import { useDictationStore } from '../stores/dictationStore'

const store = useDictationStore()

/** 按词库分组统计 */
const bankGroups = computed(() => {
  const groups = {}
  for (const w of store.wrongWords) {
    const bank = w.bankName || '未分类'
    if (!groups[bank]) groups[bank] = 0
    groups[bank]++
  }
  return Object.entries(groups).sort((a, b) => b[1] - a[1])
})

/** 开始错词复习 */
async function startReview() {
  const ok = await store.startWrongWordReview()
  if (ok) {
    // 通知父组件切换到听写标签
    emit('switch-to-dictation')
  }
}

const emit = defineEmits(['switch-to-dictation'])
</script>

<template>
  <div class="wrong-words-review">
    <h3 class="section-title">📝 错词本</h3>

    <!-- 概览 -->
    <div class="overview-card">
      <div class="overview-header">
        <span class="overview-count">{{ store.wrongWords.length }}</span>
        <span class="overview-label">个错词</span>
      </div>

      <!-- 按词库分组 -->
      <div v-if="bankGroups.length > 0" class="bank-chips">
        <div v-for="[name, count] in bankGroups" :key="name" class="bank-tag">
          {{ name }} <span class="tag-count">{{ count }}</span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="overview-actions">
        <button
          class="btn btn-primary"
          :disabled="store.wrongWords.length === 0 || store.isLoading"
          @click="startReview"
        >
          {{ store.isLoading ? '加载中...' : '🎯 开始复习' }}
        </button>
        <button
          v-if="store.wrongWords.length > 0"
          class="btn btn-danger"
          @click="store.clearWrongWords"
        >
          🗑 清空
        </button>
      </div>
    </div>

    <!-- 错词列表 -->
    <div v-if="store.wrongWords.length === 0" class="empty-state">
      🎉 暂无错词，继续保持！
    </div>

    <div v-else class="wrong-list">
      <div
        v-for="item in store.wrongWords"
        :key="item.id || item.word"
        class="wrong-item"
      >
        <div class="wrong-info">
          <div class="wrong-word-block">
            <span class="wrong-word">{{ item.word }}</span>
            <span v-if="item.wordZh" class="wrong-zh">{{ item.wordZh }}</span>
          </div>
          <div class="wrong-meta">
            <span v-if="item.bankName" class="meta-bank">{{ item.bankName }}</span>
            <span class="meta-answer">你写: {{ item.yourAnswer || '(空)' }}</span>
          </div>
        </div>
        <button class="delete-btn" @click="store.deleteWrongWord(item.id)" title="删除">
          ✕
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrong-words-review {
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

.overview-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: var(--bg-card, #fff);
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.overview-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.overview-count {
  font-size: 36px;
  font-weight: 800;
  color: #ef4444;
}

.overview-label {
  font-size: 15px;
  color: var(--text-muted, #94a3b8);
}

.bank-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bank-tag {
  padding: 4px 12px;
  border-radius: 16px;
  background: var(--bg-secondary, #f1f5f9);
  color: var(--text-secondary, #475569);
  font-size: 13px;
  font-weight: 600;
}

.tag-count {
  color: var(--text-muted, #94a3b8);
  font-weight: 400;
  margin-left: 4px;
}

.overview-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.btn {
  height: 48px;
  min-width: 100px;
  padding: 0 20px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  touch-action: manipulation;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn-primary {
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
  color: #fff;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
}

.btn-danger {
  background: var(--bg-secondary, #fee2e2);
  color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted, #94a3b8);
  font-size: 16px;
  background: var(--bg-card, #fff);
  border-radius: 16px;
}

.wrong-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.wrong-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-card, #fff);
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.wrong-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.wrong-word-block {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.wrong-word {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
}

.wrong-zh {
  font-size: 14px;
  color: var(--text-muted, #94a3b8);
}

.wrong-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted, #94a3b8);
}

.meta-bank {
  background: var(--bg-secondary, #f1f5f9);
  padding: 1px 8px;
  border-radius: 8px;
}

.delete-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted, #94a3b8);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.delete-btn:hover {
  background: #fee2e2;
  color: #ef4444;
}

/* 手机端适配 */
@media (max-width: 420px) {
  .wrong-overview {
    padding: 12px;
    gap: 6px;
  }

  .overview-title {
    font-size: 16px;
  }

  .bank-tags {
    gap: 4px;
  }

  .bank-tag {
    padding: 3px 10px;
    font-size: 12px;
  }

  .btn {
    height: 42px;
    min-width: 80px;
    padding: 0 14px;
    font-size: 14px;
    border-radius: 10px;
  }

  .wrong-list {
    max-height: 300px;
    gap: 6px;
  }

  .wrong-item {
    padding: 10px 12px;
    border-radius: 10px;
  }

  .wrong-word {
    font-size: 15px;
  }

  .wrong-zh {
    font-size: 13px;
  }

  .wrong-meta {
    gap: 8px;
    font-size: 11px;
  }

  .empty-state {
    padding: 30px 16px;
    font-size: 14px;
  }

  .delete-btn {
    width: 28px;
    height: 28px;
    font-size: 14px;
  }
}
</style>
