/**
 * 食刻校园 App - 认证服务端
 * 
 * 技术栈: Node.js + Express + TypeScript
 * 数据库: Supabase PostgreSQL
 * 认证: Supabase Auth (统一使用 Supabase Session)
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 加载 .env 文件（从项目根目录）
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ============================================================
// Supabase Admin 客户端（使用 service_role 密钥）
// ============================================================
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://zxugomsqlzoxdkkgjyar.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin: SupabaseClient | null = SUPABASE_SERVICE_KEY && !SUPABASE_SERVICE_KEY.includes('placeholder')
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

if (!supabaseAdmin) {
  console.warn('⚠️  Supabase service_role key 未配置');
}

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// ============================================================
// 工具函数
// ============================================================

/**
 * 手机号格式化：统一转换为 +86xxxxxxxxxxx 格式
 */
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+86' + cleaned;
  }
  
  if (cleaned.length >= 12 && cleaned.startsWith('86')) {
    return '+' + cleaned;
  }
  
  return phone.includes('+') ? phone : '+86' + cleaned;
}

/**
 * 统一错误响应格式
 */
function errorResponse(res: any, status: number, error: string, code?: string) {
  res.status(status).json({ success: false, error, ...(code && { code }) });
}

/**
 * 成功响应格式
 */
function successResponse(res: any, data: any) {
  res.json({ success: true, ...data });
}

// ============================================================
// 接口 0: SMS Hook 兼容路由 (匹配 Supabase 配置的路径)
// ============================================================
app.post('/api/sms-hook', async (req, res) => {
  console.log('\n📥 [兼容路由] 收到 /api/sms-hook 请求');
  return handleSendSms(req, res);
});

app.post('/api/send-sms', async (req, res) => {
  console.log('\n📥 [兼容路由] 收到 /api/send-sms 请求');
  return handleSendSms(req, res);
});

app.get('/api/hook-test', (_req, res) => {
  res.json({
    status: 'ok',
    message: '✅ Hook 路由可达！SMS Hook 配置正确',
    timestamp: new Date().toISOString(),
    hint: '如果看到这条消息，说明 Supabase 能正常调用此服务',
  });
});

// ============================================================
// 接口 1: Supabase Send SMS Hook
//
// 作用: 接收 Supabase Auth 发送的验证码请求
// 开发阶段: 直接打印手机号和验证码
// 生产阶段: 调用短信服务发送验证码
// ============================================================
async function handleSendSms(req: any, res: any) {
  const time = new Date().toLocaleString('zh-CN', { hour12: false });

  try {
    // ── 提取手机号和验证码（Supabase SMS Hook 格式）──
    const rawPhone = req.body?.sms?.phone || req.body?.user?.phone || req.body?.phone || '';
    const otp = req.body?.sms?.otp || req.body?.otp || req.body?.code || '';
    const phone = normalizePhone(String(rawPhone));

    // ── 美观日志输出 ──
    console.log('');
    console.log('  ┌────────────────────────────────────────────┐');
    console.log(`  │  📱 SMS 验证码     ${time.padEnd(19)}│`);
    console.log('  ├────────────────────────────────────────────┤');
    console.log(`  │  手机号: ${phone.padEnd(34)}│`);
    console.log(`  │  验证码: ${otp ? `✅ ${otp}` : '❌ 未获取到'.padEnd(30)}│`);
    console.log('  └────────────────────────────────────────────┘');

    if (!phone) {
      return errorResponse(res, 400, '无法提取手机号');
    }

    return successResponse(res, { message: 'OK', phone, hasOtp: !!otp });

  } catch (err: any) {
    console.error(`\n❌ [SMS HOOK] 异常: ${err.message}\n`);
    return errorResponse(res, 500, '服务器内部错误');
  }
}

// ============================================================
// 接口 2: 验证码注册 (register-phone)
//
// 流程:
// 1. 前端调用 supabase.auth.signInWithOtp() → Supabase 创建/查找 auth.users
// 2. 前端调用 supabase.auth.verifyOtp() → 获取 session 和 user.id (auth_user_id)
// 3. 前端携带 session token 调用此接口
// 4. 后端检查 profiles 表，不存在则创建
// 5. 后端创建 user_auth_accounts 记录
// ============================================================
app.post('/api/auth/register-phone', async (req, res) => {
  try {
    const { auth_user_id, phone } = req.body;

    // 参数校验
    if (!auth_user_id) {
      return errorResponse(res, 400, '缺少 auth_user_id');
    }
    if (!phone) {
      return errorResponse(res, 400, '缺少手机号');
    }

    if (!supabaseAdmin) {
      return errorResponse(res, 500, '数据库未连接');
    }

    const normalizedPhone = normalizePhone(phone);
    console.log('═════════════════════════════════════════');
    console.log('   📝 [Register Phone] 注册请求');
    console.log(`   🔑 auth_user_id: ${auth_user_id}`);
    console.log(`   📞 手机号:       ${normalizedPhone}`);
    console.log('═════════════════════════════════════════');

    // 步骤1: 检查 profiles 是否存在
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', auth_user_id)
      .maybeSingle();

    if (profileError) {
      console.error('[Register Phone] 查询 profiles 失败:', profileError.message);
      return errorResponse(res, 500, '查询用户资料失败', 'PROFILE_QUERY_ERROR');
    }

    let profileData: any;

    if (!existingProfile) {
      // 不存在 → 创建 profiles
      console.log('   → profiles 不存在，创建新记录...');
      
      const newProfile = {
        id: auth_user_id,
        display_name: '新用户',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: createdProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert(newProfile)
        .select()
        .single();

      if (createError) {
        console.error('[Register Phone] 创建 profiles 失败:', createError.message);
        
        if (createError.code === '23505') {
          return errorResponse(res, 409, '用户已注册', 'ALREADY_EXISTS');
        }
        return errorResponse(res, 400, '创建用户资料失败', createError.code);
      }

      profileData = createdProfile;
      console.log('   ✅ profiles 创建成功');
    } else {
      profileData = existingProfile;
      console.log('   ℹ️  profiles 已存在');
    }

    // 步骤2: 创建 user_auth_accounts 记录 (provider='phone')
    const { data: existingAuth, error: authCheckError } = await supabaseAdmin
      .from('user_auth_accounts')
      .select('id')
      .eq('user_id', auth_user_id)
      .eq('provider', 'phone')
      .eq('identifier', normalizedPhone)
      .maybeSingle();

    if (!existingAuth && !authCheckError) {
      console.log('   → 创建 user_auth_accounts (phone)...');
      
      const { error: authCreateError } = await supabaseAdmin
        .from('user_auth_accounts')
        .insert({
          user_id: auth_user_id,
          provider: 'phone',
          identifier: normalizedPhone,
          verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (authCreateError) {
        console.error('[Register Phone] 创建 auth_account 失败:', authCreateError.message);
        // 不阻断流程，profiles 已创建成功
      } else {
        console.log('   ✅ user_auth_accounts (phone) 创建成功');
      }
    } else {
      console.log('   ℹ️  user_auth_accounts (phone) 已存在');
    }

    console.log('═════════════════════════════════════════');
    console.log('   ✅ 注册完成！');
    console.log(`   🔑 用户ID: ${auth_user_id}`);
    console.log('═════════════════════════════════════════');
    console.log('');

    return successResponse(res, {
      message: '注册成功',
      user: {
        id: auth_user_id,
        display_name: profileData.display_name || '新用户',
      }
    });

  } catch (err: any) {
    console.error('[Register Phone] 异常:', err.message);
    return errorResponse(res, 500, '服务器内部错误');
  }
});

// ============================================================
// 接口 2b: 初始化新用户 (init-user)
//
// 注册流程专用：验证 OTP 后，确认是新用户时调用
//
// ⚠️ 严格规则:
//   1. 只创建系统维护字段（level, points, extra_data等）
//   2. 即使用端传了用户可编辑字段，也会被忽略
//   3. 用户字段在"完善资料"步骤由 PUT /api/user/profile 提交
//
// 创建:
//   - profiles 基础记录（仅系统字段）
//   - user_auth_accounts (provider='phone')
// ============================================================
app.post('/api/auth/init-user', async (req, res) => {
  try {
    const { auth_user_id, phone } = req.body;

    if (!auth_user_id) return errorResponse(res, 400, '缺少 auth_user_id');
    if (!phone) return errorResponse(res, 400, '缺少手机号');
    if (!supabaseAdmin) return errorResponse(res, 500, '数据库未连接');

    const normalizedPhone = normalizePhone(phone);
    console.log('');
    console.log('═════════════════════════════════════════');
    console.log('   🆕 [Init User] 初始化新用户');
    console.log(`   🔑 auth_user_id: ${auth_user_id}`);
    console.log(`   📞 手机号:       ${normalizedPhone}`);
    console.log('═════════════════════════════════════════');

    // 1. 检查/创建 profiles（严格只写入系统字段）
    const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', auth_user_id)
      .maybeSingle();

    let profileData: any;

    if (!existingProfile && !profileCheckError) {
      console.log('   → 创建 profiles (仅系统字段)...');

      // ⚠️ 严格规则：只允许后端设置系统字段
      // 用户可编辑字段（username, display_name, school_id, campus_id, bio, avatar_url）
      // 必须通过 PUT /api/user/profile 在"完善资料"步骤提交
      const systemOnlyProfile = {
        id: auth_user_id,
        // ── 系统字段（自动填充）──
        level: 1,
        points: 0,
        accept_notifications: true,
        extra_data: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // ── 用户字段暂不设置，等待完善资料步骤 ──
        // display_name: '新用户',  // ❌ 移到完善资料步骤
      };

      const { data: newProfile, error: createErr } = await supabaseAdmin
        .from('profiles')
        .insert(systemOnlyProfile)
        .select()
        .single();

      if (createErr) {
        if (createErr.code === '23505') return errorResponse(res, 409, '用户已存在', 'ALREADY_EXISTS');
        return errorResponse(res, 400, createErr.message || '创建失败', createErr.code);
      }
      profileData = newProfile;
      console.log('   ✅ profiles 创建成功（仅系统字段）');
      console.log(`      • level: ${profileData.level}`);
      console.log(`      • points: ${profileData.points}`);
      console.log(`      • accept_notifications: ${profileData.accept_notifications}`);
    } else {
      profileData = existingProfile;
      console.log('   ℹ️  profiles 已存在');
    }

    // 2. 创建 phone auth_account
    const { data: existingAuth, error: authCheckErr } = await supabaseAdmin
      .from('user_auth_accounts')
      .select('id')
      .eq('user_id', auth_user_id)
      .eq('provider', 'phone')
      .eq('identifier', normalizedPhone)
      .maybeSingle();

    if (!existingAuth && !authCheckErr) {
      console.log('   → 创建 phone auth_account...');
      const { error: insertErr } = await supabaseAdmin.from('user_auth_accounts').insert({
        user_id: auth_user_id,
        provider: 'phone',
        identifier: normalizedPhone,
        verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (insertErr) {
        console.error('   ⚠️ phone auth_account 创建失败:', insertErr.message);
      } else {
        console.log('   ✅ phone auth_account 创建成功');
      }
    } else {
      console.log('   ℹ️  phone auth_account 已存在');
    }

    console.log('═════════════════════════════════════════');
    console.log('   ✅ 新用户初始化完成！（待完善资料）');
    console.log('');

    return successResponse(res, {
      message: '初始化成功，请继续设置密码和完善资料',
      user: { id: auth_user_id },
      next_step: 'set_password',
    });

  } catch (err: any) {
    console.error('[Init User] 异常:', err.message);
    return errorResponse(res, 500, '服务器内部错误');
  }
});

// ============================================================
// 接口 2c: 检查手机号是否已注册 (check-phone)
// 用于登录前预检
// ============================================================
app.post('/api/auth/check-phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return errorResponse(res, 400, '缺少手机号');
    if (!supabaseAdmin) return errorResponse(res, 500, '数据库未连接');

    const normalizedPhone = normalizePhone(phone);

    const { data, error } = await supabaseAdmin
      .from('user_auth_accounts')
      .select('id')
      .eq('provider', 'phone')
      .eq('identifier', normalizedPhone)
      .maybeSingle();

    if (error) return successResponse(res, { isRegistered: false });

    return successResponse(res, { isRegistered: !!data });

  } catch (err: any) {
    return errorResponse(res, 500, err.message);
  }
});

// ============================================================
// 接口 2d: 更新用户资料 (update-profile) - 旧版兼容
// 完善资料页面使用
// ============================================================
app.post('/api/auth/update-profile', async (req, res) => {
  try {
    // 验证 token
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, '未提供认证令牌');
    }

    const accessToken = authHeader.replace('Bearer ', '');
    if (!supabaseAdmin) return errorResponse(res, 500, '数据库未连接');

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) return errorResponse(res, 401, '令牌无效');

    const userId = user.id;

    // 允许更新的字段
    const allowedFields = ['display_name', 'username', 'school_id', 'campus_id', 'bio', 'avatar_url'];
    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse(res, 400, '没有可更新的字段');
    }

    updateData.updated_at = new Date().toISOString();

    console.log('');
    console.log('═════════════════════════════════════════');
    console.log(`   ✏️ [Update Profile] 用户 ${userId}`);
    console.log(`   📦 更新字段: ${JSON.stringify(Object.keys(updateData))}`);
    console.log('═════════════════════════════════════════');

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[Update Profile] 失败:', error.message);
      return errorResponse(res, 400, error.message || '更新失败');
    }

    console.log('   ✅ 资料更新成功！');
    console.log('');

    return successResponse(res, { message: '更新成功', user: data });

  } catch (err: any) {
    console.error('[Update Profile] 异常:', err.message);
    return errorResponse(res, 500, err.message);
  }
});

// ============================================================
// 接口 2e: 更新用户资料 (PUT /api/user/profile) - 新版
//
// ⚠️ 严格规则:
//   - 只允许更新用户可编辑字段
//   - 禁止更新系统字段（id, username, level, points, extra_data等）
//   - 即使客户端传递了系统字段，也会被忽略
//
// 允许更新的字段:
//   display_name, avatar_url, bio, school_id, campus_id
//
// 禁止更新的字段（系统维护）:
//   id, username, level, points, created_at, updated_at,
//   extra_data, accept_notifications, region
// ============================================================
app.put('/api/user/profile', async (req, res) => {
  try {
    // ── 验证 token ──
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, '未提供认证令牌');
    }

    const accessToken = authHeader.replace('Bearer ', '');
    if (!supabaseAdmin) return errorResponse(res, 500, '数据库未连接');

    // 验证 JWT 并获取用户ID
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);
    if (authErr || !user) {
      console.error('[PUT /api/user/profile] Token验证失败:', authErr?.message);
      return errorResponse(res, 401, '令牌无效或已过期');
    }

    const userId = user.id;

    // ════════════════════════════════════════════
    // ⚠️ 严格字段过滤：只允许用户可编辑字段
    // ════════════════════════════════════════════

    // ✅ 白名单：允许更新的字段
    const ALLOWED_FIELDS = [
      'display_name',
      'avatar_url',
      'bio',
      'school_id',
      'campus_id',
    ];

    // ❌ 黑名单：禁止更新的系统字段
    const FORBIDDEN_FIELDS = [
      'id',
      'username',        // 用户名在注册时设置，后续不可修改
      'level',           // 系统等级
      'points',          // 积分系统
      'created_at',      // 创建时间
      'updated_at',      // 由后端/Trigger自动更新
      'extra_data',      // 扩展数据（系统维护）
      'accept_notifications', // 通知设置（单独接口）
      'region',          // 地区信息
    ];

    const updateData: Record<string, any> = {};
    const warnings: string[] = [];

    // 遍历白名单，只提取允许的字段
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        updateData[field] = req.body[field];
      }
    }

    // 检查是否包含禁止的字段（记录警告但不阻断）
    for (const field of FORBIDDEN_FIELDS) {
      if (req.body[field] !== undefined) {
        warnings.push(`忽略禁止字段: ${field}`);
        console.warn(`[PUT /api/user/profile] ⚠️ 尝试修改禁止字段: ${field}`);
      }
    }

    // 检查是否有可更新的数据
    if (Object.keys(updateData).length === 0) {
      console.warn('[PUT /api/user/profile] 没有有效的可更新字段');
      return errorResponse(res, 400, '没有可更新的字段（或所有字段都被过滤）');
    }

    // 自动设置 updated_at（系统字段）
    updateData.updated_at = new Date().toISOString();

    // ── 日志输出 ──
    console.log('');
    console.log('═════════════════════════════════════════');
    console.log(`   ✏️ [PUT /api/user/profile] 用户 ${userId}`);
    console.log(`   ✅ 允许更新: ${JSON.stringify(Object.keys(updateData))}`);
    if (warnings.length > 0) {
      console.log(`   ❌ 已过滤: ${JSON.stringify(warnings)}`);
    }
    console.log('═════════════════════════════════════════');

    // ── 执行更新 ──
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[PUT /api/user/profile] 更新失败:', error.message);

      // 唯一约束冲突（如 username 重复）
      if (error.code === '23505') {
        return errorResponse(res, 409, '该值已被使用（唯一约束）', 'DUPLICATE_VALUE');
      }
      return errorResponse(res, 400, error.message || '更新失败');
    }

    console.log('   ✅ 资料更新成功！');
    console.log('');

    // 返回成功响应（包含警告信息）
    return successResponse(res, {
      message: '资料更新成功',
      user: data,
      ...(warnings.length > 0 && { warnings }),
    });

  } catch (err: any) {
    console.error('[PUT /api/user/profile] 异常:', err.message);
    return errorResponse(res, 500, err.message);
  }
});

// ============================================================
// 接口 3: 验证码登录 (login-phone)
//
// 流程:
// 1. 前端调用 supabase.auth.signInWithOtp() 发送验证码
// 2. 用户输入验证码后，前端调用 supabase.auth.verifyOtp()
// 3. 验证成功后，前端携带 auth_user_id 调用此接口
// 4. 后端检查 profiles 是否存在
//    - 存在 → 返回 session 信息，进入首页
//    - 不存在 → 返回错误，提示"请先注册"
// ============================================================
app.post('/api/auth/login-phone', async (req, res) => {
  try {
    const { auth_user_id, phone } = req.body;

    // 参数校验
    if (!auth_user_id) {
      return errorResponse(res, 400, '缺少 auth_user_id');
    }
    if (!phone) {
      return errorResponse(res, 400, '缺少手机号');
    }

    if (!supabaseAdmin) {
      return errorResponse(res, 500, '数据库未连接');
    }

    const normalizedPhone = normalizePhone(phone);
    console.log('═════════════════════════════════════════');
    console.log('   🔑 [Login Phone] 验证码登录请求');
    console.log(`   🔑 auth_user_id: ${auth_user_id}`);
    console.log(`   📞 手机号:       ${normalizedPhone}`);
    console.log('═════════════════════════════════════════');

    // 检查 profiles 是否存在
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', auth_user_id)
      .maybeSingle();

    if (profileError) {
      console.error('[Login Phone] 查询失败:', profileError.message);
      return errorResponse(res, 500, '查询用户资料失败');
    }

    // 情况2: profiles不存在 → 禁止登录，提示先注册
    if (!profile) {
      console.log('   ❌ profiles 不存在 → 手机号未注册');
      console.log('═════════════════════════════════════════');
      console.log('');

      return errorResponse(res, 404, '手机号未注册，请先注册', 'USER_NOT_REGISTERED');
    }

    // 情况1: profiles存在 → 返回session信息
    console.log('   ✅ profiles 存在 → 登录成功');
    
    // 更新最后登录时间
    await supabaseAdmin
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', auth_user_id);

    console.log('═════════════════════════════════════════');
    console.log('   ✅ 验证码登录成功！');
    console.log(`   🔑 用户ID:     ${auth_user_id}`);
    console.log(`   👤 显示名称:   ${profile.display_name || '新用户'}`);
    console.log('═════════════════════════════════════════');
    console.log('');

    return successResponse(res, {
      message: '登录成功',
      user: {
        id: profile.id,
        display_name: profile.display_name || '新用户',
        username: profile.username,
        avatar_url: profile.avatar_url,
      }
    });

  } catch (err: any) {
    console.error('[Login Phone] 异常:', err.message);
    return errorResponse(res, 500, '服务器内部错误');
  }
});

// ============================================================
// 接口 4: 密码登录 (password-login)
//
// 流程:
// 1. 接收手机号和密码
// 2. 查询 user_auth_accounts (provider='password')
// 3. 使用 bcrypt.compare() 验证密码
// 4. 返回 Supabase Session（不自己生成JWT）
// ============================================================
app.post('/api/auth/password-login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    // 参数校验
    if (!phone) {
      return errorResponse(res, 400, '手机号不能为空');
    }
    if (!password) {
      return errorResponse(res, 400, '密码不能为空');
    }

    if (!supabaseAdmin) {
      return errorResponse(res, 500, '数据库未连接');
    }

    const normalizedPhone = normalizePhone(phone);
    console.log('═════════════════════════════════════════');
    console.log('   🔐 [Password Login] 密码登录请求');
    console.log(`   📞 手机号:   ${normalizedPhone}`);
    console.log('═════════════════════════════════════════');

    // 查询 user_auth_accounts (provider='password')
    const { data: authAccount, error: authError } = await supabaseAdmin
      .from('user_auth_accounts')
      .select('*')
      .eq('provider', 'password')
      .eq('identifier', normalizedPhone)
      .maybeSingle();

    if (authError && authError.code !== 'PGRST116') {
      console.error('[Password Login] 查询错误:', authError.message);
      return errorResponse(res, 500, '查询失败');
    }

    // 不存在该认证方式
    if (!authAccount) {
      console.log('   ❌ 密码账号不存在');
      return errorResponse(res, 401, '手机号未注册或未设置密码', 'NOT_FOUND');
    }

    // 没有密码hash
    if (!authAccount.password_hash) {
      console.log('   ❌ 未设置密码');
      return errorResponse(res, 401, '该账号未设置密码，请先验证码登录后设置密码', 'NO_PASSWORD');
    }

    // 使用 bcrypt 验证密码
    let isValid = false;
    try {
      isValid = await bcrypt.compare(password, authAccount.password_hash);
    } catch (err) {
      console.error('[Password Login] bcrypt比对异常:', err);
      return errorResponse(res, 500, '密码验证失败');
    }

    if (!isValid) {
      console.log('   ❌ 密码错误');
      return errorResponse(res, 401, '密码错误', 'WRONG_PASSWORD');
    }

    // 密码正确 → 查询 profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', authAccount.user_id)
      .single();

    if (profileError || !profile) {
      console.error('[Password Login] 查询 profiles 失败');
      return errorResponse(res, 404, '用户资料不存在', 'PROFILE_NOT_FOUND');
    }

    // 更新最后登录时间
    await supabaseAdmin
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    console.log('═════════════════════════════════════════');
    console.log('   ✅ 密码登录成功！');
    console.log(`   🔑 用户ID:     ${profile.id}`);
    console.log(`   👤 显示名称:   ${profile.display_name || '新用户'}`);
    console.log('═════════════════════════════════════════');
    console.log('');

    // 重要: 返回用户信息，前端需要用此数据
    // Session 由前端通过 supabase.auth.signInWithPassword() 或类似方式获取
    // 这里只做业务层面的验证
    return successResponse(res, {
      message: '登录成功',
      user: {
        id: profile.id,
        display_name: profile.display_name || '新用户',
        username: profile.username,
        avatar_url: profile.avatar_url,
        // 返回 email/phone 用于 Supabase 登录
        login_identifier: normalizedPhone,
      }
    });

  } catch (err: any) {
    console.error('[Password Login] 异常:', err.message);
    return errorResponse(res, 500, '服务器内部错误');
  }
});

// ============================================================
// 接口 5: 设置密码 (set-password)
//
// 流程:
// 1. 用户已通过验证码登录（已携带有效 session）
// 2. 输入密码
// 3. 后端 bcrypt 加密密码
// 4. 保存到 user_auth_accounts (provider='password')
// ============================================================
app.post('/api/auth/set-password', async (req, res) => {
  try {
    const { user_id, phone, password } = req.body;

    // 参数校验
    if (!user_id) {
      return errorResponse(res, 400, '缺少 user_id');
    }
    if (!phone) {
      return errorResponse(res, 400, '缺少手机号');
    }
    if (!password) {
      return errorResponse(res, 400, '密码不能为空');
    }
    if (password.length < 6) {
      return errorResponse(res, 400, '密码长度至少6位');
    }

    if (!supabaseAdmin) {
      return errorResponse(res, 500, '数据库未连接');
    }

    const normalizedPhone = normalizePhone(phone);
    console.log('═════════════════════════════════════════');
    console.log('   🔒 [Set Password] 设置密码请求');
    console.log(`   🔑 user_id: ${user_id}`);
    console.log(`   📞 手机号:  ${normalizedPhone}`);
    console.log('═════════════════════════════════════════');

    // bcrypt 加密密码
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    console.log(`   🔐 密码已加密 (hash长度: ${passwordHash.length})`);

    // 检查是否已有 password 类型的认证记录
    const { data: existingAuth, error: checkError } = await supabaseAdmin
      .from('user_auth_accounts')
      .select('*')
      .eq('user_id', user_id)
      .eq('provider', 'password')
      .eq('identifier', normalizedPhone)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[Set Password] 查询失败:', checkError.message);
      return errorResponse(res, 500, '查询失败');
    }

    if (existingAuth) {
      // 更新现有记录
      console.log('   → 更新现有密码记录...');
      const { error: updateError } = await supabaseAdmin
        .from('user_auth_accounts')
        .update({
          password_hash: passwordHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAuth.id);

      if (updateError) {
        console.error('[Set Password] 更新失败:', updateError.message);
        return errorResponse(res, 400, '保存失败', updateError.code);
      }
      console.log('   ✅ 密码更新成功');
    } else {
      // 创建新记录
      console.log('   → 创建新的密码记录...');
      const { error: insertError } = await supabaseAdmin
        .from('user_auth_accounts')
        .insert({
          user_id: user_id,
          provider: 'password',
          identifier: normalizedPhone,
          password_hash: passwordHash,
          verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('[Set Password] 插入失败:', insertError.message);
        return errorResponse(res, 400, '保存失败', insertError.code);
      }
      console.log('   ✅ 密码设置成功');
    }

    console.log('═════════════════════════════════════════');
    console.log('   ✅ 密码设置完成！');
    console.log('═════════════════════════════════════════');
    console.log('');

    return successResponse(res, {
      message: '密码设置成功',
    });

  } catch (err: any) {
    console.error('[Set Password] 异常:', err.message);
    return errorResponse(res, 500, '服务器内部错误');
  }
});

// ============================================================
// 接口 6: 获取当前用户 (me)
// 
// 需要 Bearer Token (Supabase access_token)
// ============================================================
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, '未提供认证令牌');
    }

    const accessToken = authHeader.replace('Bearer ', '');

    if (!supabaseAdmin) {
      return errorResponse(res, 500, '数据库未连接');
    }

    // 使用 Supabase admin client 验证 token 并获取用户
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !user) {
      console.error('[Get Me] Token验证失败:', authError?.message);
      return errorResponse(res, 401, '令牌无效或已过期', 'INVALID_TOKEN');
    }

    const authUserId = user.id;

    // 查询 profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', authUserId)
      .maybeSingle();

    if (profileError) {
      console.error('[Get Me] 查询 profiles 失败:', profileError.message);
      return errorResponse(res, 500, '查询用户资料失败');
    }

    // 如果没有 profile，返回基本信息
    if (!profile) {
      return successResponse(res, {
        user: {
          id: authUserId,
          display_name: '新用户',
          is_new: true,
        },
        message: '用户资料待完善'
      });
    }

    return successResponse(res, {
      user: {
        id: profile.id,
        school_id: profile.school_id,
        campus_id: profile.campus_id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        level: profile.level,
        points: profile.points,
        is_new: false,
      }
    });

  } catch (err: any) {
    console.error('[Get Me] 异常:', err.message);
    return errorResponse(res, 500, '服务器内部错误');
  }
});

// ============================================================
// 健康检查
// ============================================================
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: '食刻校园认证服务',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    supabaseConnected: !!supabaseAdmin,
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('   🚀 食刻校园 App - 认证服务启动成功');
  console.log('═══════════════════════════════════════════════════');
  console.log(`   🌐 地址: http://localhost:${PORT}`);
  console.log('');
  console.log('   ┌─────────────────────────────────────────────┐');
  console.log('   │  接口列表                                     │');
  console.log('   ├─────────────────────────────────────────────┤');
  console.log('   │  POST /api/send-sms            (SMS Hook)   │');
  console.log('   │  POST /api/auth/init-user       (初始化用户)  │');
  console.log('   │  POST /api/auth/check-phone     (检查注册状态)│');
  console.log('   │  POST /api/auth/login-phone     (验证码登录)  │');
  console.log('   │  POST /api/auth/password-login  (密码登录)    │');
  console.log('   │  POST /api/auth/set-password    (设置密码)    │');
  console.log('   │  POST /api/auth/update-profile  (旧版资料接口)│');
  console.log('   │  PUT  /api/user/profile         (新版资料接口)⭐│');
  console.log('   │  GET  /api/auth/me             (当前用户)     │');
  console.log('   └─────────────────────────────────────────────┘');
  console.log('');
  console.log('   ⭐ 新版资料接口特点:');
  console.log('      • 严格字段分离（系统字段 vs 用户字段）');
  console.log('      • 禁止客户端修改 level/points/extra_data');
  console.log('   💡 认证方案: Supabase Auth (统一Session)');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
});
