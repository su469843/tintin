-- 听写应用数据库初始化脚本
-- 执行环境: Neon PostgreSQL
-- 注意: user_id 使用 Neon Auth 生成的 UUID

-- 1. 用户资料表（扩展信息）
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,               -- 对应 Neon Auth 的 user.id
  display_id TEXT UNIQUE NOT NULL,    -- 8 位数字 ID（类 QQ 号）
  name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_display_id ON profiles(display_id);

-- 2. 错词本表
CREATE TABLE IF NOT EXISTS wrong_words (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  word TEXT NOT NULL,
  word_zh TEXT,
  your_answer TEXT,
  bank_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wrong_words_user ON wrong_words(user_id);
CREATE INDEX IF NOT EXISTS idx_wrong_words_user_bank ON wrong_words(user_id, bank_name);
CREATE INDEX IF NOT EXISTS idx_wrong_words_created ON wrong_words(created_at DESC);

-- 3. 每日统计表
CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  total INT DEFAULT 0,
  correct INT DEFAULT 0,
  wrong INT DEFAULT 0,
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, date DESC);

-- 4. 邀请码表
CREATE TABLE IF NOT EXISTS invitations (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  used_by TEXT,
  used_by_email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);
CREATE INDEX IF NOT EXISTS idx_invitations_created_by ON invitations(created_by);

-- 5. 用户词库表
CREATE TABLE IF NOT EXISTS user_word_banks (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_user_word_banks_user ON user_word_banks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_word_banks_public ON user_word_banks(is_public);

-- 6. 词库单词表
CREATE TABLE IF NOT EXISTS user_words (
  id SERIAL PRIMARY KEY,
  bank_id INT NOT NULL REFERENCES user_word_banks(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  translation TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_words_bank ON user_words(bank_id);
