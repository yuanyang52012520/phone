-- ============================================================
-- 食客系统 - 用户资料表 (profiles)
-- 用于存储用户个人信息和密码
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  -- 主键
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 关联 Supabase Auth 用户
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 基本信息
  phone VARCHAR(20) UNIQUE NOT NULL,          -- 手机号（唯一）
  password_hash VARCHAR(255) NOT NULL DEFAULT '',  -- 密码哈希（bcrypt）
  
  -- 个人信息（注册时填写）
  nickname VARCHAR(50),                       -- 昵称
  avatar_url TEXT,                            -- 头像 URL
  real_name VARCHAR(50),                      -- 真实姓名
  gender SMALLINT DEFAULT 0,                  -- 性别: 0未知 1男 2女
  birthday DATE,                              -- 生日
  
  -- 状态字段
  is_profile_completed BOOLEAN DEFAULT FALSE,  -- 是否完成资料填写
  is_active BOOLEAN DEFAULT TRUE,             -- 账号是否激活
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user_id ON profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- 添加注释
COMMENT ON TABLE profiles IS '用户资料表 - 存储用户个人信息和登录密码';
COMMENT ON COLUMN profiles.id IS '主键';
COMMENT ON COLUMN profiles.auth_user_id IS '关联的 Supabase Auth 用户 ID';
COMMENT ON COLUMN profiles.phone IS '手机号（国际格式，如 +8613800138000）';
COMMENT ON COLUMN profiles.password_hash IS 'bcrypt 加密后的密码哈希';
COMMENT ON COLUMN profiles.nickname IS '用户昵称';
COMMENT ON COLUMN profiles.avatar_url IS '头像 URL 地址';
COMMENT ON COLUMN profiles.real_name IS '真实姓名';
COMMENT ON COLUMN profiles.gender IS '性别: 0=未知, 1=男, 2=女';
COMMENT ON COLUMN profiles.birthday IS '出生日期';
COMMENT ON COLUMN profiles.is_profile_completed IS '是否已完善个人资料';
COMMENT ON COLUMN profiles.is_active IS '账号状态: true=正常, false=禁用';

-- 启用 RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 创建策略：用户只能查看自己的资料
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = auth_user_id);

-- 创建策略：用户可以插入自己的资料（注册时使用）
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

-- 创建策略：用户可以更新自己的资料
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);
