import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
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

// 中间件
app.use(cors());
app.use(express.json());

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
