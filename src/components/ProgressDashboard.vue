<script setup>
/**
 * ProgressDashboard.vue - 进度看板
 * 今日正确率、近 7 天趋势、错词概览
 *
 * 数据来源：PostgreSQL（通过 store 的 fetchStats 加载）
 */
import { computed } from 'vue'
import { useDictationStore } from '../stores/dictationStore'

const store = useDictationStore()

const accuracyRate = computed(() => {
  const { total, correct } = store.todayStats
  if (total === 0) return 0
  return Math.round((correct / total) * 100)
})

const weekStats = computed(() => {
  const stats = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const dayData = store.dailyStats[key]
    stats.push({
      date: key.slice(5),
      total: dayData?.total ?? 0,
      correct: dayData?.correct ?? 0,
      rate: dayData?.total ? Math.round((dayData.correct / dayData.total) * 100) : 0
    })
  }
  return stats
})

const todayStatus = computed(() => {
  const { total, correct, wrong } = store.todayStats
  if (total === 0) return '今天还没有练习'
  return `练习 ${total} 词 · 正确 ${correct} · 错误 ${wrong}`
})

/** 从数据库刷新统计数据 */
async function refreshData() {
  await Promise.all([store.fetchStats(), store.fetchWrongWords()])
}
</script>

<template>
  <div class="progress-dashboard">
    <div class="dashboard-header">
      <h3 class="section-title">📊 学习进度</h3>
      <button class="refresh-btn" @click="refreshData" title="刷新数据">🔄</button>
    </div>

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
        <div v-for="day in weekStats" :key="day.date" class="bar-item">
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

    <!-- 错词概览（链接到错词本标签） -->
    <div class="wrong-summary">
      <div class="wrong-header">
        <p class="sub-title">❌ 错词本</p>
        <span class="wrong-count">{{ store.wrongWords.length }} 个</span>
      </div>
      <p v-if="store.wrongWords.length === 0" class="empty-hint">
        🎉 暂无错词，继续保持！
      </p>
      <p v-else class="wrong-hint">
        切换到「📝 错词」标签查看详情并开始复习
      </p>
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

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
}

.refresh-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: var(--bg-card, #fff);
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: transform 0.2s;
}

.refresh-btn:active {
  transform: scale(0.9);
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

.wrong-summary {
  padding: 16px;
  background: var(--bg-card, #fff);
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.wrong-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.wrong-header .sub-title {
  margin: 0;
}

.wrong-count {
  font-size: 14px;
  font-weight: 700;
  color: #ef4444;
}

.empty-hint {
  text-align: center;
  color: var(--text-muted, #94a3b8);
  font-size: 15px;
  margin: 0;
  padding: 8px 0;
}

.wrong-hint {
  color: var(--text-muted, #94a3b8);
  font-size: 14px;
  margin: 0;
}
</style>
