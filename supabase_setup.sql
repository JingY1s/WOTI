-- ============================================
-- WOTI Supabase 建表脚本
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 人格类型表
CREATE TABLE types (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dims JSONB NOT NULL DEFAULT '{}',
  oneliner TEXT DEFAULT '待补充',
  tags TEXT[] DEFAULT ARRAY['待补充'],
  description TEXT DEFAULT '待补充',
  vehicle TEXT DEFAULT '待补充',
  quote TEXT DEFAULT '待补充',
  mirror TEXT,
  opposite TEXT,
  is_hidden BOOLEAN DEFAULT FALSE,
  trigger_rule TEXT,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 题库表
CREATE TABLE questions (
  id INT PRIMARY KEY,
  chapter TEXT NOT NULL,
  dimension TEXT NOT NULL,
  text TEXT NOT NULL,
  option_a_text TEXT NOT NULL,
  option_a_value TEXT NOT NULL,
  option_b_text TEXT NOT NULL,
  option_b_value TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. 留言墙表
CREATE TABLE wall_messages (
  id BIGSERIAL PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  type_code TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RLS 策略：所有人可读，写入需要认证
-- ============================================

-- types 表
ALTER TABLE types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "types_select" ON types FOR SELECT USING (true);
CREATE POLICY "types_insert" ON types FOR INSERT WITH CHECK (true);
CREATE POLICY "types_update" ON types FOR UPDATE USING (true);
CREATE POLICY "types_delete" ON types FOR DELETE USING (true);

-- questions 表
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions_select" ON questions FOR SELECT USING (true);
CREATE POLICY "questions_insert" ON questions FOR INSERT WITH CHECK (true);
CREATE POLICY "questions_update" ON questions FOR UPDATE USING (true);
CREATE POLICY "questions_delete" ON questions FOR DELETE USING (true);

-- wall_messages 表
ALTER TABLE wall_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wall_select" ON wall_messages FOR SELECT USING (true);
CREATE POLICY "wall_insert" ON wall_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "wall_delete" ON wall_messages FOR DELETE USING (true);
