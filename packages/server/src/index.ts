import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// 加载 .env 文件（从项目根目录）
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ============================================================
// Supabase admin 客户端（使用 service_role 密钥）
// ============================================================
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://zxugomsqlzoxdkkgjyar.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = SUPABASE_SERVICE_KEY && !SUPABASE_SERVICE_KEY.includes('placeholder')
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

if (!supabaseAdmin) {
  console.warn('⚠️  Supabase service_role key 未配置，用户将不会同步到 Supabase Auth');
  console.warn('   请从 https://supabase.com/dashboard/project/zxugomsqlzoxdkkgjyar/settings/api 获取');
}

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// ============================================================
// JWT 配置
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// 中间件
app.use(cors());
app.use(express.json());

// ============================================================
// JWT 认证中间件
// ============================================================
interface JwtPayload {
  userId: string;
  phone: string;
}

function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
}

// ============================================================
// 【新增】检查手机号是否已注册
// 用于判断用户是新注册还是老用户登录
// ============================================================
app.get('/api/auth/check-phone/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const normalizedPhone = normalizePhone(phone);

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '数据库未连接' });
    }

    // 查询 profiles 表
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, is_profile_completed, nickname')
      .eq('phone', normalizedPhone)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Check Phone] 查询错误:', error);
      return res.status(500).json({ error: '查询失败', detail: error.message });
    }

    if (!data) {
      return res.json({ registered: false });
    }

    return res.json({
      registered: true,
      profileCompleted: data.is_profile_completed,
      nickname: data.nickname
    });
  } catch (err: any) {
    console.error('[Check Phone] 异常:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============================================================
// 【核心】发送短信验证码（通过 Supabase Auth）
//
// 前端调用此接口 → 后端通过 Supabase Admin API 触发 SMS OTP
// 验证码由 Supabase 生成并发送到用户手机
// ============================================================
app.post('/api/auth/send-sms', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: '手机号不能为空' });
    }

    const normalizedPhone = normalizePhone(phone);

    console.log('════════════════════════════════════════════════');
    console.log('   📨 [Send SMS] 发送验证码请求');
    console.log(`   📞 手机号:   ${normalizedPhone}`);
    console.log('════════════════════════════════════════════════');

    // 通过 Supabase Admin API 发送 OTP（触发 SMS）
    // 使用 GoTrue 的 /otp endpoint 或 signInWithOtp 的底层实现
    const response = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: normalizedPhone,
        create_user: true, // 自动创建用户（如果不存在）
        channel: 'sms',     // 短信通道
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`   ❌ 发送失败: ${response.status}`, errData);
      
      // 如果是速率限制错误，返回友好提示
      if (response.status === 429) {
        return res.status(429).json({ 
          error: '发送过于频繁，请稍后再试', 
          code: 'RATE_LIMITED' 
        });
      }
      
      return res.status(response.status).json({ 
        error: errData?.message || `发送失败 (${response.status})`,
        detail: errData,
      });
    }

    const result = await response.json().catch(() => ({}));

    console.log('');
    console.log('   ✅ 验证码已发送！');
    console.log(`   💡 提示：请查看手机或访问 Supabase Auth Logs 获取开发测试用的验证码`);
    console.log('');

    res.json({
      success: true,
      message: '验证码已发送',
      data: {
        phone: normalizedPhone,
        hint: '请查看手机接收的验证码',
        dev_hint: process.env.NODE_ENV === 'development'
          ? '开发模式：可从 Supabase Dashboard → Auth Logs 获取验证码'
          : undefined,
      },
    });

  } catch (err: any) {
    console.error('[Send SMS] 异常:', err.message);
    res.status(500).json({ error: '服务器内部错误', detail: err.message });
  }
});

// ============================================================
// 【核心】验证短信验证码（通过 Supabase Auth）
//
// 前端提交 OTP → 后端向 Supabase Auth 验证
// 验证成功后返回用户信息和 JWT Token
// ============================================================
app.post('/api/auth/verify-sms', async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ error: '手机号和验证码不能为空' });
    }

    const cleanedOtp = String(otp).replace(/[^0-9]/g, '');
    const normalizedPhone = normalizePhone(phone);

    if (cleanedOtp.length < 4 || cleanedOtp.length > 8) {
      return res.status(400).json({ error: '验证码格式不正确' });
    }

    console.log('════════════════════════════════════════════════');
    console.log('   🔑 [Verify SMS] 验证码验证请求');
    console.log(`   📞 手机号:   ${normalizedPhone}`);
    console.log(`   🔑 验证码:   ${'*'.repeat(cleanedOtp.length)} (${cleanedOtp.length}位)`);
    console.log('════════════════════════════════════════════════');

    // 方案1：使用 Supabase GoTrue API 验证 OTP
    let authUser: any = null;
    
    try {
      const verifyResponse = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'sms',
          phone: normalizedPhone,
          token: cleanedOtp,
          create_user: true,
        }),
      });

      if (!verifyResponse.ok) {
        const verifyErr = await verifyResponse.json().catch(() => ({}));
        
        // 验证码错误或过期
        if (verifyResponse.status === 401 || verifyResponse.status === 400 || verifyResponse.status === 422) {
          console.error(`   ❌ 验证失败:`, verifyErr?.error_description || verifyErr?.msg || JSON.stringify(verifyErr));
          return res.status(401).json({ 
            error: verifyErr?.error_description || verifyErr?.msg || '验证码错误或已过期',
            code: 'OTP_INVALID',
          });
        }
        
        throw new Error(verifyErr?.message || `验证请求失败 (${verifyResponse.status})`);
      }

      const verifyResult = await verifyResponse.json();
      authUser = verifyResult.user;
      
      if (!authUser) {
        throw new Error('未获取到用户信息');
      }

      console.log(`   ✅ Supabase Auth 验证成功！用户ID: ${authUser.id}`);

    } catch (verifyErr: any) {
      // 如果 GoTrue verify 接口不可用，尝试备用方案：直接查询 profiles 表
      console.log(`   ⚠️  Supabase Auth 验证异常: ${verifyErr.message}`);
      console.log(`   💡 尝试备用验证方式...`);

      // 备用方案：检查缓存中的 OTP（用于开发调试）
      const cachedOtp = otpStore.get(normalizedPhone);
      
      if (!cachedOtp || Date.now() > cachedOtp.expiresAt) {
        return res.status(401).json({ 
          error: '验证码无效或已过期', 
          code: 'OTP_EXPIRED',
          hint: '请重新发送验证码',
        });
      }
      
      if (cachedOtp.otp !== cleanedOtp) {
        return res.status(401).json({ error: '验证码错误', code: 'OTP_WRONG' });
      }
      
      // 验证成功，清除缓存
      otpStore.delete(normalizedPhone);
      console.log('   ✅ 缓存验证码验证成功（开发模式）');
    }

    // 检查是否已有 profile 记录
    let profileData: any = null;
    let isNewUser = false;

    try {
      const { data: profile } = await supabaseAdmin!
        .from('profiles')
        .select('*')
        .eq('phone', normalizedPhone)
        .single();

      profileData = profile;
    } catch {
      isNewUser = true;
    }

    if (!profileData) {
      isNewUser = true;
    }

    console.log('');
    console.log(`   👤 用户状态: ${isNewUser ? '新用户' : '老用户'}`);
    console.log('════════════════════════════════════════════════');
    console.log('');

    res.json({
      success: true,
      verified: true,
      isNewUser,
      user: {
        supabase_id: authUser?.id || null,
        phone: normalizedPhone,
        email: authUser?.email || null,
        ...(profileData ? {
          id: profileData.id,
          nickname: profileData.nickname,
          avatar_url: profileData.avatar_url,
          is_profile_completed: profileData.is_profile_completed,
        } : {}),
      },
    });

  } catch (err: any) {
    console.error('[Verify SMS] 异常:', err.message);
    res.status(500).json({ error: '服务器内部错误', detail: err.message });
  }
});

// ============================================================
// 【新增】验证码登录（OTP 验证后获取 JWT Token）
//
// 用于老用户通过验证码登录时，获取或创建 JWT Token
// 如果用户已有 profile → 直接返回 JWT
// 如果用户没有 profile → 创建基础 profile 并返回 JWT
// ============================================================
app.post('/api/auth/otp-login', async (req, res) => {
  try {
    const { phone, auth_user_id } = req.body;

    if (!phone) {
      return res.status(400).json({ error: '手机号不能为空' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '数据库未连接' });
    }

    const normalizedPhone = normalizePhone(phone);

    // 查询是否已有 profile
    let { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[OTP Login] 查询错误:', error);
    }

    // 如果已有 profile，直接返回 JWT
    if (profile) {
      // 检查账号状态
      if (!profile.is_active) {
        return res.status(403).json({ error: '账号已被禁用' });
      }

      // 更新最后登录时间
      await supabaseAdmin
        .from('profiles')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', profile.id);

      // 生成 JWT
      const token = jwt.sign(
        { userId: profile.id, phone: normalizedPhone },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      console.log(`════════════════════════════════════════════════`);
      console.log(`   ✅ 验证码登录成功（老用户）`);
      console.log(`   📞 手机号:   ${normalizedPhone}`);
      console.log(`   🔑 用户ID:   ${profile.id}`);
      console.log(`════════════════════════════════════════════════`);

      return res.json({
        success: true,
        token,
        user: {
          id: profile.id,
          phone: profile.phone,
          nickname: profile.nickname,
          avatar_url: profile.avatar_url,
          is_profile_completed: profile.is_profile_completed,
        }
      });
    }

    // 没有 profile，创建一个基础的（用于已通过 Supabase 验证但还没设置密码的老用户）
    // 这种情况可能发生在：用户之前用其他方式注册了 Supabase 但没填 profiles
    console.log('[OTP Login] 用户无 profile 记录，创建基础记录');

    const newProfile = {
      auth_user_id: auth_user_id || null,
      phone: normalizedPhone,
      password_hash: '',  // 密码为空，需要用户后续设置
      nickname: '',
      display_name: '',   // 同步设置 display_name
      avatar_url: null,
      real_name: null,
      gender: null,
      birthday: null,
      is_profile_completed: false,  // 标记资料未完善
      is_active: true,
    };

    const { data: createdData, error: createError } = await supabaseAdmin
      .from('profiles')
      .insert(newProfile)
      .select()
      .single();

    if (createError) {
      console.error('[OTP Login] 创建 profile 失败:', createError);
      
      if (createError.code === '23505') {
        return res.status(409).json({ error: '该手机号已被注册' });
      }
      return res.status(500).json({ error: '创建用户失败', detail: createError.message });
    }

    // 生成 JWT
    const token = jwt.sign(
      { userId: createdData.id, phone: normalizedPhone },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log(`════════════════════════════════════════════════`);
    console.log(`   ✅ 验证码登录成功（新创建 profile）`);
    console.log(`   📞 手机号:   ${normalizedPhone}`);
    console.log(`   🔑 用户ID:   ${createdData.id}`);
    console.log('════════════════════════════════════════════════');

    res.json({
      success: true,
      token,
      user: {
        id: createdData.id,
        phone: createdData.phone,
        nickname: createdData.nickname || '',
        is_profile_completed: false,  // 提示前端需要完善资料
      },
      needCompleteProfile: true,  // 告诉前端需要跳转到资料填写页
    });

  } catch (err: any) {
    console.error('[OTP Login] 异常:', err.message);
    res.status(500).json({ error: '服务器错误', detail: err.message });
  }
});

// ============================================================
// 【新增】创建/完善用户资料（含密码）
// 新用户验证码通过后调用此接口
// ============================================================
app.post('/api/auth/profile', async (req, res) => {
  try {
    const { 
      auth_user_id, 
      phone, 
      password, 
      nickname, 
      avatar_url,
      real_name,
      gender,
      birthday 
    } = req.body;

    // 参数校验
    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '数据库未连接' });
    }

    const normalizedPhone = normalizePhone(phone);

    // 密码强度校验（至少6位）
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    // 使用 bcrypt 加密密码
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // 验证 hash 是否生成成功
    console.log(`[Create Profile] 密码已加密, hash长度=${passwordHash.length}, 前缀=${passwordHash.substring(0, 15)}`);

    // 插入或更新 profiles 表
    const profileData = {
      auth_user_id: auth_user_id || null,
      phone: normalizedPhone,
      password_hash: passwordHash,
      nickname: nickname || '',
      display_name: nickname || '',  // 同步到 display_name 字段
      avatar_url: avatar_url || null,
      real_name: real_name || null,
      gender: gender || null,
      birthday: birthday || null,
      is_profile_completed: true,
      has_set_password: true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData)
      .select();

    if (error) {
      console.error('[Create Profile] 错误:', error);
      
      // 处理唯一约束冲突（手机号已存在）
      if (error.code === '23505') {
        return res.status(409).json({ error: '该手机号已被注册' });
      }
      return res.status(400).json({ error: '保存失败', detail: error.message });
    }

    // 生成 JWT Token
    const token = jwt.sign(
      { userId: data[0].id, phone: normalizedPhone },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log('════════════════════════════════════════════════');
    console.log('   ✅ 用户资料创建成功');
    console.log(`   📞 手机号:   ${normalizedPhone}`);
    console.log(`   👤 昵称:     ${nickname || '未设置'}`);
    console.log(`   🔑 用户ID:   ${data[0].id}`);
    console.log('════════════════════════════════════════════════');

    res.json({
      success: true,
      token,
      profile: {
        id: data[0].id,
        phone: normalizedPhone,
        nickname: data[0].nickname,
        is_profile_completed: data[0].is_profile_completed
      }
    });
  } catch (err: any) {
    console.error('[Create Profile] 异常:', err);
    res.status(500).json({ error: '服务器错误', detail: err.message });
  }
});

// ============================================================
// 【新增】密码登录接口
// 老用户使用手机号+密码登录
// ============================================================
app.post('/api/auth/login-password', async (req, res) => {
  try {
    const { phone, password } = req.body;

    // 参数校验
    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '数据库未连接' });
    }

    const normalizedPhone = normalizePhone(phone);

    // 查询用户
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('phone', normalizedPhone)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Password Login] 查询错误:', error);
      return res.status(500).json({ error: '查询失败' });
    }

    if (!profile) {
      return res.status(401).json({ error: '该手机号未注册' });
    }

    // 检查是否有密码
    if (!profile.password_hash) {
      console.error(`[Password Login] 用户 ${normalizedPhone} 没有设置密码`);
      return res.status(401).json({ error: '该账号未设置密码，请使用验证码登录后设置密码' });
    }

    // 验证密码
    let isValid = false;
    try {
      isValid = await bcrypt.compare(password, profile.password_hash);
      console.log(`[Password Login] 密码验证: phone=${normalizedPhone}, 输入长度=${password.length}, 结果=${isValid}`);
    } catch (err) {
      console.error('[Password Login] 密码比对异常:', err);
      return res.status(500).json({ error: '密码验证失败' });
    }

    if (!isValid) {
      return res.status(401).json({ error: '密码错误' });
    }

    if (!isValid) {
      return res.status(401).json({ error: '密码错误' });
    }

    // 生成 JWT Token
    const token = jwt.sign(
      { userId: profile.id, phone: normalizedPhone },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // 更新最后登录时间
    await supabaseAdmin
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    console.log('════════════════════════════════════════════════');
    console.log('   ✅ 密码登录成功');
    console.log(`   📞 手机号:   ${normalizedPhone}`);
    console.log(`   👤 用户ID:   ${profile.id}`);
    console.log('════════════════════════════════════════════════');

    res.json({
      success: true,
      token,
      user: {
        id: profile.id,
        phone: profile.phone,
        nickname: profile.nickname,
        avatar_url: profile.avatar_url,
        is_profile_completed: profile.is_profile_completed
      }
    });
  } catch (err: any) {
    console.error('[Password Login] 异常:', err);
    res.status(500).json({ error: '服务器错误', detail: err.message });
  }
});

// ============================================================
// 【新增】获取当前用户信息（基于 JWT）
// ============================================================
app.get('/api/auth/me-jwt', authMiddleware, async (req: any, res: any) => {
  try {
    const { userId } = req.user;

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '数据库未连接' });
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({
      user: {
        id: profile.id,
        phone: profile.phone,
        nickname: profile.nickname,
        avatar_url: profile.avatar_url,
        real_name: profile.real_name,
        gender: profile.gender,
        birthday: profile.birthday,
        is_profile_completed: profile.is_profile_completed,
        created_at: profile.created_at
      }
    });
  } catch (err: any) {
    console.error('[Get Me] 异常:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ============================================================
// 【新增】修改密码（需要 JWT 认证）
// ============================================================
app.post('/api/auth/change-password', authMiddleware, async (req: any, res: any) => {
  try {
    const { userId } = req.user;
    const { old_password, new_password } = req.body;

    // 参数校验
    if (!old_password || !new_password) {
      return res.status(400).json({ error: '旧密码和新密码不能为空' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6位' });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '数据库未连接' });
    }

    // 查询当前用户
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 验证旧密码
    const isValid = await bcrypt.compare(old_password, profile.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: '旧密码错误' });
    }

    // 加密新密码
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(new_password, saltRounds);

    // 更新密码
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        password_hash: newPasswordHash, 
        has_set_password: true,
        updated_at: new Date().toISOString() 
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[Change Password] 错误:', updateError);
      return res.status(400).json({ error: '更新失败', detail: updateError.message });
    }

    console.log(`   ✅ 用户 ${userId} 修改密码成功`);

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (err: any) {
    console.error('[Change Password] 异常:', err);
    res.status(500).json({ error: '服务器错误', detail: err.message });
  }
});

// ============================================================
// 【新增】更新个人资料（需要 JWT 认证）
// 用于编辑昵称、头像、真实姓名、性别、生日等信息
// 密码请使用 /api/auth/change-password 接口
// ============================================================
app.put('/api/auth/profile', authMiddleware, async (req: any, res: any) => {
  try {
    const { userId } = req.user;
    const {
      nickname,
      avatar_url,
      real_name,
      gender,
      birthday,
    } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({ error: '数据库未连接' });
    }

    // 构建更新数据（只包含提供的字段）
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (nickname !== undefined) {
      updateData.nickname = nickname;
      updateData.display_name = nickname;  // 同步更新 display_name
    }
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url || null;
    if (real_name !== undefined) updateData.real_name = real_name || null;
    if (gender !== undefined) updateData.gender = Number(gender) || 0;
    if (birthday !== undefined) updateData.birthday = birthday || null;

    // 执行更新
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[Update Profile] 错误:', error);
      return res.status(400).json({ error: '更新失败', detail: error.message });
    }

    console.log(`   ✅ 用户 ${userId} 资料更新成功`);

    res.json({
      success: true,
      message: '资料更新成功',
      profile: {
        id: data.id,
        phone: data.phone,
        nickname: data.nickname,
        avatar_url: data.avatar_url,
        real_name: data.real_name,
        gender: data.gender,
        birthday: data.birthday,
      }
    });
  } catch (err: any) {
    console.error('[Update Profile] 异常:', err);
    res.status(500).json({ error: '服务器错误', detail: err.message });
  }
});

// ============================================================
// 内存缓存（开发/测试环境使用）
// ============================================================
interface OtpEntry {
  otp: string;
  expiresAt: number;
  createdAt: number;
  source?: 'supabase_hook' | 'auto_generated' | 'manual' | 'api' | 'auth_logs_auto';
}

const otpStore = new Map<string, OtpEntry>();
// 简单会话存储（生产环境应使用 JWT）
const sessionStore = new Map<string, { phone: string; createdAt: number }>();

// ============================================================
// 生成 6 位随机验证码（备用，实际由 Supabase Auth 生成）
// ============================================================
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ============================================================
// 手机号格式化工具函数
// 统一转换为国际标准格式: +86xxxxxxxxxxx
//
// 支持的输入格式：
//   - "13800138000"        (纯数字)
//   - "+8613800138000"     (已有 +86 前缀)
//   - "8613800138000"      (有 86 但无 +)
//   - "+86 13800138000"    (带空格)
//   - "138-0013-8000"      (带横杠，会被清理)
// ============================================================
function normalizePhone(phone: string): string {
  // 1. 清理所有非数字字符
  let cleaned = phone.replace(/[^0-9]/g, '');
  
  // 2. 如果是 11 位中国手机号（以 1 开头），自动添加 +86 前缀
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+86' + cleaned;
  }
  
  // 3. 如果已经包含 86 前缀（12位或更多），确保格式正确
  if (cleaned.length >= 12 && cleaned.startsWith('86')) {
    return '+' + cleaned;  // 添加 + 号
  }
  
  // 4. 其他情况直接返回（已处理或异常格式）
  return phone.includes('+') ? phone : '+86' + cleaned;
}

// ============================================================
// 【已弃用】发送验证码接口
// 前端现已改用 Supabase Auth 原生 OTP (signInWithOtp)
// 此接口保留仅供向后兼容或开发调试使用
// ============================================================
app.post('/api/auth/send-otp', (req, res) => {
  const { phone } = req.body;

  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ error: '手机号不能为空' });
    return;
  }

  const otp = generateOtp();

  // 存入缓存（有效期 5 分钟）
  otpStore.set(normalizePhone(phone), { 
    otp, 
    expiresAt: Date.now() + 5 * 60 * 1000,
    createdAt: Date.now(),
    source: 'api'
  });

  console.log('════════════════════════════════════════════════');
  console.log('   📨 OTP 验证码已生成');
  console.log('────────────────────────────────────────────────');
  console.log(`   📞 手机号:   ${phone}`);
  console.log(`   🔑 验证码:   ${otp}`);
  console.log('════════════════════════════════════════════════');
  console.log('');

  res.json({
    success: true,
    message: '验证码已发送',
    // 开发模式返回提示（生产环境不要返回 OTP）
    _dev_hint: '请查看 Express 服务端控制台获取验证码',
  });
});

// ============================================================
// 【已弃用】验证 OTP 接口
// 前端现已改用 Supabase Auth 原生 OTP (verifyOtp)
// 此接口保留仅供向后兼容或开发调试使用
// ============================================================
app.post('/api/auth/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    res.status(400).json({ error: '手机号和验证码不能为空' });
    return;
  }

  const entry = otpStore.get(phone);

  if (!entry) {
    res.status(400).json({ error: '未找到验证码，请先发送' });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    res.status(400).json({ error: '验证码已过期，请重新发送' });
    return;
  }

  if (entry.otp !== otp) {
    res.status(400).json({ error: '验证码错误' });
    return;
  }

  // 验证成功，清除 OTP
  otpStore.delete(phone);

  // ============================================================
  // 同步用户到 Supabase Auth
  // ============================================================
  let supabaseUserId: string | null = null;
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        phone,
        phone_confirm: true,
      });
      if (error) {
        // 用户已存在（重复手机号）是正常情况，忽略错误
        console.log(`   👤 Supabase Auth 用户已存在: ${phone}`);
        // 尝试查询已有用户的 ID
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.users?.find((u) => u.phone === phone);
        if (existing) {
          supabaseUserId = existing.id;
        }
      } else if (data?.user) {
        supabaseUserId = data.user.id;
        console.log(`   👤 用户已存入 Supabase Auth: ${data.user.id}`);
      }
    } catch (err: any) {
      // 重复键错误也是正常的
      if (err?.message?.includes('duplicate') || err?.message?.includes('already exists')) {
        console.log(`   👤 Supabase Auth 用户已存在: ${phone}`);
        // 尝试查询已有用户
        try {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const existing = users?.users?.find((u) => u.phone === phone);
          if (existing) {
            supabaseUserId = existing.id;
          }
        } catch { /* ignore */ }
      } else {
        console.error('   ❌ Supabase Auth 错误:', err?.message);
      }
    }
  }

  // 生成会话 token
  const token = generateToken();
  sessionStore.set(token, { phone, createdAt: Date.now() });

  console.log('════════════════════════════════════════════════');
  console.log('   ✅ OTP 验证成功');
  console.log('────────────────────────────────────────────────');
  console.log(`   📞 手机号:   ${phone}`);
  console.log(`   🎫 Token:    ${token.slice(0, 16)}...`);
  if (supabaseUserId) {
    console.log(`   🔗 Supabase: ${supabaseUserId}`);
  }
  console.log('════════════════════════════════════════════════');
  console.log('');

  res.json({
    success: true,
    message: '验证成功',
    token,
    user: { phone, supabase_user_id: supabaseUserId },
  });
});

// ============================================================
// 获取当前用户信息（根据 token）
// ============================================================
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: '未登录' });
    return;
  }

  const session = sessionStore.get(token);
  if (!session) {
    res.status(401).json({ error: '会话已过期' });
    return;
  }

  res.json({ user: { phone: session.phone } });
});

// ============================================================
// 【核心】Supabase SMS Hook 端点
//
// ⚠️  重要说明（方案 A：纯 Supabase Auth 模式）:
//
// 当你在 Supabase Dashboard 配置 SMS Provider 为 "Custom" 时，
// Supabase Auth 会在此接口生成 OTP 后调用此 URL。
//
// ⚠️ 关键限制：Supabase Custom SMS Hook **不会发送真正的 OTP**
//
// 本接口的作用：
//   1. 记录收到的请求（用于调试）
//   2. 提取手机号（如果有）
//   3. 返回成功响应给 Supabase（否则会报错）
//
// 获取真实 OTP 的唯一方式：
//   → Supabase Dashboard → Authentication → Auth Logs
//   在日志中可以找到 Supabase 生成的 6 位验证码
// ============================================================

/**
 * 从请求体中提取手机号（支持多种格式）
 */
function extractPhoneFromHookBody(body: any): string | null {
  // 直接字段
  if (body.phone) return normalizePhone(body.phone);
  if (body.to) return normalizePhone(body.to);
  if (body.recipient) return normalizePhone(body.recipient);
  
  // 嵌套在 user 对象中
  if (body.user?.phone) return normalizePhone(body.user.phone);
  
  // 其他嵌套位置
  if (body.data?.phone) return normalizePhone(body.data.phone);
  if (body.payload?.phone) return normalizePhone(body.payload.phone);
  
  return null;
}

/**
 * 从请求体中提取 OTP（支持多种格式）
 */
function extractOtpFromHookBody(body: any): string | null {
  // 直接字段
  if (body.otp) return String(body.otp);
  if (body.code) return String(body.code);
  if (body.token) return String(body.token);
  if (body.verification_code) return String(body.verification_code);

  // 嵌套位置
  if (body.data?.otp) return String(body.data.otp);
  if (body.payload?.otp) return String(body.payload.otp);
  if (body.metadata?.otp) return String(body.metadata.otp);

  // sms 对象中
  if (body.sms?.otp) return String(body.sms.otp);
  if (body.sms?.code) return String(body.sms.code);
  if (body.sms?.token) return String(body.sms.token);

  return null;
}

// ============================================================
// 从 Supabase Auth Logs 自动获取 OTP
// ============================================================

async function fetchOtpFromAuthLogs(phone: string): Promise<string | null> {
  if (!supabaseAdmin || !SUPABASE_SERVICE_KEY) {
    console.log('      ⚠️  无法自动获取: 未配置 SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }

  try {
    // 方法1: 尝试调用 GoTrue Admin API 获取日志
    const goTrueUrl = `${SUPABASE_URL}/auth/v1/admin/logs`;
    
    const response = await fetch(goTrueUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // 如果 GoTrue API 不可用，尝试方法2
      console.log(`      ⚠️  GoTrue API 返回 ${response.status}，尝试备用方法...`);
      return await fetchOtpFromAuthLogsFallback(phone);
    }

    const logs = await response.json() as any[];
    
    // 在日志中查找最近的 send_sms 相关记录
    const normalizedPhone = normalizePhone(phone);
    
    for (const log of (logs || [])) {
      const logStr = JSON.stringify(log).toLowerCase();
      const phoneInLog = logStr.includes(phone.replace('+', '')) || 
                         logStr.includes(normalizedPhone.replace('+', ''));
      
      if (phoneInLog && (
        log.message?.includes('send_sms') ||
        log.message?.includes('sms.send') ||
        log.action === 'send_sms' ||
        log.event === 'sms.send'
      )) {
        // 尝试从日志中提取 OTP
        const otp = extractOtpFromLogPayload(log);
        if (otp) {
          console.log(`      ✅ 从 Auth Log [${log.id.slice(0,8)}...] 获取到 OTP`);
          return otp;
        }
      }
    }

    console.log('      ⚠️  日志中未找到匹配的 OTP 记录');
    return null;

  } catch (error: any) {
    console.log(`      ❌ 获取 Auth Logs 失败: ${error.message}`);
    return await fetchOtpFromAuthLogsFallback(phone);
  }
}

/**
 * 备用方法: 通过查询 users 表的最近活动推断
 */
async function fetchOtpFromAuthLogsFallback(_phone: string): Promise<string | null> {
  try {
    // 尝试用 RPC 或其他方式
    // 这里我们返回 null，提示用户手动查看
    console.log('      💡 备用方法也无法获取，请手动查看 Auth Logs');
    return null;
  } catch {
    return null;
  }
}

/**
 * 从日志条目中提取 OTP
 */
function extractOtpFromLogPayload(log: any): string | null {
  // 检查各种可能的 OTP 位置
  const payload = log.payload || log.data || log.metadata || log.details || {};
  const payloadStr = JSON.stringify(payload);
  
  // 常见的 OTP 字段名
  const otpFields = ['otp', 'code', 'token', 'verification_code', 'otp_code'];
  
  for (const field of otpFields) {
    if (payload[field] && /^\d{4,8}$/.test(String(payload[field]))) {
      return String(payload[field]);
    }
  }
  
  // 尝试从 message 或 description 中正则匹配
  const textToSearch = [
    log.message,
    log.description,
    log.error,
    log.detail,
    payloadStr
  ].join(' ');
  
  // 匹配 4-8 位数字（OTP 通常在这个范围）
  const otpMatch = textToSearch.match(/(?:otp|code|verification|验证码)[:\s]*(\d{4,8})/i);
  if (otpMatch) {
    return otpMatch[1];
  }
  
  // 如果找不到明确标记的数字，尝试查找独立的6位数字
  const standaloneMatch = textToSearch.match(/(?<![0-9])(\d{6})(?![0-9])/);
  if (standaloneMatch && !textToSearch.includes('timestamp') && !textToSearch.includes('id')) {
    return standaloneMatch[1];
  }
  
  return null;
}

app.post('/api/sms-hook', async (req, res) => {
  const rawBody = req.body;
  const phone = extractPhoneFromHookBody(rawBody);
  const otpFromHook = extractOtpFromHookBody(rawBody);
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  📨 [SMS Hook] 收到 Supabase Auth 请求                     ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  
  // 显示元数据
  if (rawBody.metadata) {
    console.log('║  📋 事件信息:                                                 ║');
    console.log(`║     • 名称: ${(rawBody.metadata.name || '未知').padEnd(52)}║`);
    console.log(`║     • 时间: ${(rawBody.metadata.time || '未知').padEnd(52)}║`);
  }
  
  // 显示用户信息
  if (rawBody.user) {
    console.log('║  👤 用户数据:                                                 ║');
    console.log(`║     • ID:     ${String(rawBody.user.id || '未知').slice(0, 42).padEnd(50)}║`);
    console.log(`║     • Phone:  ${String(rawBody.user.phone || '未知').padEnd(50)}║`);
  }
  
  // 显示原始 Body 的键
  const bodyKeys = Object.keys(rawBody);
  console.log(`║                                                              ║`);
  console.log(`║  📦 Body 字段: [${bodyKeys.join(', ').slice(0, 50)}]${bodyKeys.join(', ').length > 50 ? '...' : ''}]`.padEnd(71) + '║');
  
  // 结果 - 先显示手机号
  console.log('║                                                              ║');
  console.log('║  🎯 解析结果:                                                 ║');
  console.log(`║     📞 手机号: ${phone ? '✅ '.padEnd(3) + phone.padEnd(47) : '❌ 未找到'.padEnd(50)}║`);

  let finalOtp = otpFromHook;
  
  if (!finalOtp && phone) {
    // Hook 中没有 OTP，尝试自动从 Auth Logs 获取
    console.log(`║     🔑 验证码: ⏳ 正在自动获取...                            ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
    
    console.log('');
    console.log('   🔍 正在查询 Supabase Auth Logs...');
    
    finalOtp = await fetchOtpFromAuthLogs(phone);
    
    if (finalOtp) {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║  ✅ 成功获取验证码！                                        ║');
      console.log(`║     📱 手机号: ${phone.padEnd(49)}║`);
      console.log(`║     🔑 验证码: ${'✅ '.padEnd(3) + finalOtp.padEnd(43)}║`);
      console.log('╚════════════════════════════════════════════════════════════╝');
    } else {
      console.log('   ⚠️  自动获取失败，请手动查看 Auth Logs');
      console.log('');
      console.log('   ══════════════════════════════════════════════════════');
      console.log('   💡 手动获取步骤：');
      console.log('   ────────────────────────────────────────────────────');
      console.log('   1. 打开 https://supabase.com/dashboard/project/zxugomsqlzoxdkkgjyar/auth/logs');
      console.log('   2. 找到最新的 send_sms 日志');
      console.log('   3. 查看详情中的 otp/code 字段');
      console.log('   ══════════════════════════════════════════════════════');
    }
  } else if (finalOtp) {
    console.log(`║     🔑 验证码: ${('✅ '.padEnd(3) + finalOtp).padEnd(47)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
  } else {
    console.log(`║     🔑 验证码: ❌ Hook 中未包含（正常现象）`.padEnd(67) + '║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  }
  
  // 保存 OTP 到缓存
  if (phone && finalOtp) {
    otpStore.set(phone, {
      otp: finalOtp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
      source: otpFromHook ? 'supabase_hook' : 'auth_logs_auto',
    });
    
    console.log('');
    console.log('   💾 已保存验证码到缓存（有效期 5 分钟）');
  } else if (phone && !finalOtp) {
    console.log('\n   ℹ️  已记录请求，但未能获取 OTP');
  } else {
    console.log('\n   ❌ 无法从请求中提取手机号');
  }
  console.log('');

  // 始终返回成功响应给 Supabase（否则会报错）
  res.json({ 
    success: true, 
    message: 'SMS Hook received',
    data: {
      phone,
      otp: finalOtp,
      hasOtp: !!finalOtp,
      source: finalOtp ? (otpFromHook ? 'hook_payload' : 'auth_logs_api') : null,
      processedAt: new Date().toISOString(),
      note: finalOtp 
        ? `OTP retrieved via ${otpFromHook ? 'hook payload' : 'Auth Logs API'}` 
        : 'OTP not available - check Supabase Auth Logs manually'
    }
  });
});

// ============================================================
// 【开发调试】手动设置 OTP 接口
// 
// 当 Supabase Hook 不包含 OTP 时，可以使用此接口手动设置
// 用于开发测试目的
// 
// 使用方法:
//   curl -X POST http://localhost:3001/api/dev/set-otp \
//     -H "Content-Type: application/json" \
//     -d '{"phone": "+8613800138000", "otp": "123456"}'
// ============================================================
app.post('/api/dev/set-otp', (req, res) => {
  const { phone, otp } = req.body;
  
  if (!phone || !otp) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: phone and otp',
      usage: 'POST /api/dev/set-otp { "phone": "+86...", "otp": "123456" }'
    });
  }
  
  const formattedPhone = normalizePhone(String(phone));
  const formattedOtp = String(otp).replace(/[^0-9]/g, '').slice(0, 6);
  
  otpStore.set(formattedPhone, {
    otp: formattedOtp,
    expiresAt: Date.now() + 5 * 60 * 1000,
    createdAt: Date.now(),
    source: 'manual',
  });
  
  console.log('\n🔧 [Dev] 手动设置 OTP:');
  console.log(`   📱 手机号: ${formattedPhone}`);
  console.log(`   🔑 验证码: ${formattedOtp}`);
  console.log(`   ⚠️  注意：这只是一个记录，不会影响 Supabase Auth 的验证流程\n`);
  
  res.json({
    success: true,
    message: 'OTP set manually (for development only)',
    data: {
      phone: formattedPhone,
      otp: formattedOtp,
      expiresIn: 300,
      warning: 'This does NOT affect Supabase Auth verification!'
    }
  });
});

// ============================================================
// 【管理后台】获取所有缓存的验证码列表
// 开发者访问此页面查看最新验证码
// ============================================================
app.get('/api/admin/otp-list', (_req, res) => {
  const now = Date.now();
  const list: Array<{
    phone: string;
    otp: string;
    createdAt: string;
    remainingSec: number;
    status: 'active' | 'expired';
  }> = [];

  otpStore.forEach((entry, phone) => {
    const remaining = Math.max(0, Math.floor((entry.expiresAt - now) / 1000));
    list.push({
      phone,
      otp: entry.otp,
      createdAt: new Date(entry.createdAt).toLocaleString('zh-CN'),
      remainingSec: remaining,
      status: remaining > 0 ? 'active' : 'expired',
    });
  });

  // 按创建时间倒序
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    total: list.length,
    activeCount: list.filter((i) => i.status === 'active').length,
    timestamp: new Date().toISOString(),
    data: list,
  });
});

// ============================================================
// 【管理后台】HTML 页面 - 增强版（支持手动设置 OTP）
// ============================================================
app.get('/admin', (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>食客系统 - 验证码管理后台</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; min-height: 100vh; padding: 20px; }
    .container { max-width: 650px; margin: 0 auto; }
    h1 { text-align: center; color: #1a1a2e; margin-bottom: 8px; font-size: 24px; }
    .subtitle { text-align: center; color: #666; margin-bottom: 24px; font-size: 14px; }
    
    /* 卡片通用样式 */
    .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; margin-bottom: 20px; }
    .card-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
    .card-header h2 { font-size: 16px; }
    .card-body { padding: 20px; }
    
    /* 表单样式 */
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-weight: 600; color: #333; margin-bottom: 6px; font-size: 14px; }
    .form-input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 15px; transition: border-color 0.3s; }
    .form-input:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
    
    /* 按钮样式 */
    .btn { padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s; }
    .btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(102,126,234,0.4); }
    .btn-secondary { background: none; border: none; color: #fff; cursor: pointer; font-size: 14px; opacity: 0.9; }
    .btn-secondary:hover { opacity: 1; }
    
    /* OTP 列表 */
    .otp-list { list-style: none; }
    .otp-item { padding: 16px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
    .otp-item:last-child { border-bottom: none; }
    .otp-item.expired { opacity: 0.5; background: #fafafa; }
    .otp-info { flex: 1; }
    .otp-phone { font-weight: 600; color: #333; font-size: 15px; }
    .otp-meta { font-size: 12px; color: #999; margin-top: 4px; }
    .otp-code { 
      font-family: 'SF Mono', Monaco, monospace; 
      font-size: 26px; 
      font-weight: 700; 
      color: #667eea; 
      letter-spacing: 4px; 
      background: #f8f9ff; 
      padding: 10px 16px; 
      border-radius: 8px; 
      cursor: pointer;
      user-select: all;
      transition: all 0.2s;
    }
    .otp-code:hover { background: #eef2ff; transform: scale(1.05); }
    
    /* 状态指示器 */
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
    .status-dot.active { background: #52c41a; }
    .status-dot.expired { background: #999; }
    .countdown { font-size: 12px; color: #e94560; margin-left: 4px; }
    
    /* 空状态 */
    .empty { padding: 40px; text-align: center; color: #999; }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
    
    /* 警告/提示框 */
    .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
    .alert-warning { background: #fff3cd; border: 1px solid #ffc107; color: #856404; }
    .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
    
    footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🍽️ 食客系统</h1>
    <p class="subtitle">验证码管理后台 - 开发测试模式</p>

    <!-- 使用说明 -->
    <div class="alert alert-info" style="background:#e8f4fd;border-color:#1890ff;color:#0050b3;">
      <strong>🔑 如何获取验证码（方案 A - 纯 Supabase Auth 模式）：</strong><br><br>
      <strong>步骤：</strong><br>
      1. 在 App 中输入手机号并点击「发送验证码」<br>
      2. 打开 <a href="https://supabase.com/dashboard/project/zxugomsqlzoxdkkgjyar/auth/logs" target="_blank" style="color:#1890ff;font-weight:600;">Supabase Dashboard → Auth Logs ↗</a><br>
      3. 找到最近的 <strong>send_sms</strong> 日志条目<br>
      4. 点击查看详情，找到 <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;">otp</code> 或 <code style="background:#f0f0f0;padding:2px 6px;border-radius:4px;">code</code> 字段<br>
      5. 复制该 6 位数字到 App 中输入<br><br>
      <span style="font-size:12px;opacity:0.8;">💡 提示：Supabase Custom SMS Hook 不会在请求中发送真正的 OTP，必须从 Auth Logs 获取。</span>
    </div>

    <!-- 手动记录 OTP（可选） -->
    <div class="card">
      <div class="card-header">
        <h2>📝 手动记录验证码（从 Auth Logs 复制后保存）</h2>
      </div>
      <div class="card-body">
        <div class="alert alert-warning">
          ⚠️ 此功能仅用于辅助记录。从 Auth Logs 获取的 OTP 才是真正有效的。
        </div>
        <div class="form-group">
          <label class="form-label">手机号</label>
          <input type="tel" id="manualPhone" class="form-input" placeholder="+8613800138000">
        </div>
        <div class="form-group">
          <label class="form-label">验证码（从 Supabase Auth Logs 复制的 6 位数字）</label>
          <input type="text" id="manualOtp" class="form-input" maxlength="6" placeholder="从 Auth Logs 复制...">
        </div>
        <button class="btn btn-primary" onclick="setManualOtp()" style="width:100%">记录验证码</button>
      </div>
    </div>

    <!-- 验证码列表 -->
    <div class="card">
      <div class="card-header">
        <h2>📋 验证码记录</h2>
        <span><button class="btn-secondary" onclick="loadOtps()">🔄 刷新</button></span>
      </div>
      <div class="card-body" style="padding:0">
        <ul class="otp-list" id="otpList">
          <li class="empty">
            <div class="empty-icon">📭</div>
            <p>暂无验证码记录</p>
            <p style="font-size:12px;margin-top:8px;">请从 Supabase Auth Logs 复制 OTP 后手动记录</p>
          </li>
        </ul>
      </div>
    </div>

    <!-- 当前模式说明 -->
    <div class="alert alert-info">
      <strong>📌 当前模式：方案 A - 纯 Supabase Auth</strong><br>
      • 前端使用 <code>supabase.auth.signInWithOtp()</code> 发送验证码<br>
      • 验证码由 <strong>Supabase Auth 内部生成</strong><br>
      • 从 <a href="https://supabase.com/dashboard/project/zxugomsqlzoxdkkgjyar/auth/logs" target="_blank">Auth Logs ↗</a> 获取真实 OTP<br>
      • 前端使用 <code>supabase.auth.verifyOtp()</code> 验证
    </div>

    <footer>
      <p>自动刷新: <span id="timer">5</span>秒 | 方案 A: 纯 Supabase Auth 模式</p>
    </footer>
  </div>

<script>
let countdown = 5;

function loadOtps() {
  fetch('/api/admin/otp-list')
    .then(r => r.json())
    .then(data => {
      const el = document.getElementById('otpList');
      if (data.data.length === 0) {
        el.innerHTML = '<li class="empty"><div class="empty-icon">📭</div><p>暂无验证码</p></li>';
        return;
      }
      el.innerHTML = data.data.map(item =>
        '<li class="otp-item ' + item.status + '">' +
          '<div class="otp-info">' +
            '<div class="otp-phone"><span class="status-dot ' + item.status + '"></span>' + item.phone + '</div>' +
            '<div class="otp-meta">' + item.createdAt + (item.status === 'active' ? ' · 有效 <span class="countdown">' + Math.floor(item.remainingSec) + '</span>s' : ' · 已过期') + '</div>' +
          '</div>' +
          '<div class="otp-code" title="点击复制">' + (item.status === 'active' ? item.otp : '------') + '</div>' +
        '</li>'
      ).join('');
    })
    .catch(err => console.error('加载失败:', err));
}

async function setManualOtp() {
  const phone = document.getElementById('manualPhone').value.trim();
  const otp = document.getElementById('manualOtp').value.trim();
  
  if (!phone || !otp) {
    alert('请填写手机号和验证码');
    return;
  }
  
  try {
    const response = await fetch('/api/dev/set-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('✅ 设置成功！手机号: ' + result.data.phone + ', 验证码: ' + result.data.otp);
      document.getElementById('manualPhone').value = '';
      document.getElementById('manualOtp').value = '';
      loadOtps(); // 刷新列表
    } else {
      alert('❌ 设置失败: ' + result.error);
    }
  } catch (err) {
    alert('❌ 网络错误: ' + err.message);
  }
}

setInterval(() => { 
  countdown--; 
  if (countdown <= 0) { 
    loadOtps(); 
    countdown = 5; 
  } 
  document.getElementById('timer').textContent = countdown; 
}, 1000);

loadOtps();
</script>
</body>
</html>`;
  res.type('html').send(html);
});

// ============================================================
// 【开发调试】获取验证码
// ============================================================
app.get('/api/dev-otp', (req, res) => {
  const phone = req.query.phone as string;
  if (!phone) {
    res.status(400).json({ error: 'Query parameter "phone" is required' });
    return;
  }

  const entry = otpStore.get(phone);
  if (!entry) {
    res.json({ phone, otp: null, message: 'No OTP found for this phone number' });
    return;
  }
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    res.json({ phone, otp: null, message: 'OTP has expired' });
    return;
  }

  res.json({ phone, otp: entry.otp, message: 'OTP retrieved from cache' });
});

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log('');
  console.log('════════════════════════════════════════════════');
  console.log(`   🚀 食客系统 - 短信服务运行中`);
  console.log(`   🌐 地址: http://localhost:${PORT}`);
  console.log('');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │  🔐 当前模式：方案 A (纯 Supabase Auth) │');
  console.log('   ├─────────────────────────────────────────┤');
  console.log(`   │  SMS Hook: POST /api/sms-hook            │`);
  console.log(`   │  管理后台: GET  /admin                  │`);
  console.log('   └─────────────────────────────────────────┘');
  console.log('');
  console.log('   💡 获取 OTP → Supabase Dashboard → Auth Logs');
  console.log('   💡 打开 http://localhost:' + PORT + '/admin 查看管理页面');
  console.log('════════════════════════════════════════════════');
  console.log('');
});
