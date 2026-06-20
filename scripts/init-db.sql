-- 听写应用数据库初始化脚本
-- 执行环境: Neon PostgreSQL
-- 注意: user_id 使用 Neon Auth 生成的 UUID

-- 错词本表
CREATE TABLE IF NOT EXISTS wrong_words (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  word TEXT NOT NULL,
  word_zh TEXT,
  your_answer TEXT,
  bank_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 为按用户+词库查询添加索引
CREATE INDEX IF NOT EXISTS idx_wrong_words_user ON wrong_words(user_id);
CREATE INDEX IF NOT EXISTS idx_wrong_words_user_bank ON wrong_words(user_id, bank_name);
CREATE INDEX IF NOT EXISTS idx_wrong_words_created ON wrong_words(created_at DESC);

-- 每日统计表
CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  total INT DEFAULT 0,
  correct INT DEFAULT 0,
  wrong INT DEFAULT 0,
  UNIQUE(user_id, date)
);

-- 为按用户+日期范围查询添加索引
CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, date DESC);
