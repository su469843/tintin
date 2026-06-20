<script setup>
/**
 * ProgressDashboard.vue - 进度看板
 * 今日正确率、学习时长、错词列表
 */
import { computed } from 'vue'
import { useDictationStore } from '../stores/dictationStore'

const store = useDictationStore()

/** 今日正确率百分比 */
const accuracyRate = computed(() => {
  const { total, correct } = store.todayStats
  if (total === 0) return 0
  return Math.round((correct / total) * 100)
})

/** 最近一周的统计数据 */
const weekStats = computed(() => {
  const stats = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const dayData = store.dailyStats[key]
    stats.push({
      date: key.slice(5), // MM-DD
      total: dayData?.total ?? 0,
      correct: dayData?.correct ?? 0,
      rate: dayData?.total ? Math.round((dayData.correct / dayData.total) * 100) : 0
    })
  }
  return stats
})

/** 今日状态文本 */
const todayStatus = computed(() => {
  const { total, correct, wrong } = store.todayStats
  if (total === 0) return '今天还没有练习'
  return `练习 ${total} 词 · 正确 ${correct} · 错误 ${wrong}`
})
</script>

<template>
  <div class="progress-dashboard">
    <h3 class="section-title">📊 学习进度</h3>

    <!-- 今日概览 -->
    <div class="today-card">
      <p class="today-status">{{ todayStatus }}</p>
      <div class="accuracy-ring">
        <svg viewBox="0 0 100 100" class="ring-svg">
          <circle cx="50" cy="50" r="42" class="ring-bg" />
          <circle
            cx="50" cy="50" r="42"
            class="ring-fill"
            :style="{
              strokeDasharray: `${accuracyRate * 2.64} ${264 - accuracyRate * 2.64}`,
              stroke: accuracyRate >= 80 ? '#10b981' : accuracyRate >= 60 ? '#f59e0b' : '#ef4444'
            }"
          />
          <text x="50" y="50" text-anchor="middle" dominant-baseline="central" class="ring-text">
            {{ accuracyRate }}%
          </text>
        </svg>
        <p class="ring-label">今日正确率</p>
      </div>
    </div>

    <!-- 最近一周统计 -->
    <div class="week-stats">
      <p class="sub-title">近 7 天趋势</p>
      <div class="bar-chart">
        <div
          v-for="day in weekStats"
          :key="day.date"
          class="bar-item"
        >
          <div class="bar-wrapper">
            <div
              class="bar"
              :style="{ height: day.total > 0 ? `${Math.max(day.rate, 4)}%` : '4%' }"
              :class="{
                good: day.rate >= 80,
                medium: day.rate >= 60 && day.rate < 80,
                poor: day.rate < 60
              }"
            />
          </div>
          <span class="bar-label">{{ day.date }}</span>
        </div>
      </div>
    </div>

    <!-- 错词本 -->
    <div class="wrong-words-section">
      <div class="wrong-header">
        <p class="sub-title">❌ 错词本（{{ store.wrongWords.length }}）</p>
        <button
          v-if="store.wrongWords.length > 0"
          class="clear-btn"
          @click="store.clearWrongWords"
        >
          清空
        </button>
      </div>
      <div v-if="store.wrongWords.length === 0" class="empty-state">
        🎉 暂无错词，继续保持！
      </div>
      <div v-else class="wrong-list">
        <div
          v-for="(item, i) in store.wrongWords"
          :key="i"
          class="wrong-item"
        >
          <div class="wrong-word-block">
            <span class="wrong-word">{{ item.word }}</span>
            <span v-if="item.wordZh" class="wrong-zh">{{ item.wordZh }}</span>
          </div>
          <span class="wrong-answer">你写: {{ item.yourAnswer }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-dashboard {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
}

.sub-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary, #475569);
}

.today-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  background: var(--bg-card, #fff);
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.today-status {
  margin: 0;
  font-size: 15px;
  color: var(--text-muted, #94a3b8);
}

.accuracy-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.ring-svg {
  width: 100px;
  height: 100px;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: var(--bg-secondary, #e2e8f0);
  stroke-width: 8;
}

.ring-fill {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dasharray 0.5s ease;
}

.ring-text {
  fill: var(--text-primary, #1e293b);
  font-size: 18px;
  font-weight: 700;
  transform: rotate(90deg);
}

.ring-label {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
}

.week-stats {
  padding: 16px;
  background: var(--bg-card, #fff);
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.bar-chart {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 4px;
  height: 100px;
}

.bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.bar-wrapper {
  width: 100%;
  height: 80px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bar {
  width: 60%;
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
  min-height: 4px;
}

.bar.good { background: #10b981; }
.bar.medium { background: #f59e0b; }
.bar.poor { background: #ef4444; }

.bar-label {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
}

.wrong-words-section {
  padding: 16px;
  background: var(--bg-card, #fff);
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.wrong-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.wrong-header .sub-title {
  margin: 0;
}

.clear-btn {
  padding: 4px 12px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  background: none;
  color: var(--text-muted, #94a3b8);
  font-size: 12px;
  cursor: pointer;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--text-muted, #94a3b8);
  font-size: 15px;
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
  background: var(--bg-secondary, #fef2f2);
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
  font-weight: 500;
  color: var(--text-muted, #94a3b8);
}

.wrong-answer {
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  text-align: right;
}
</style>
