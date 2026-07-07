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
const otpStore = new Map<string, { otp: string; expiresAt: number; createdAt: number }>();
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
// 【核心】发送验证码接口
// 前端调用此接口请求发送 OTP 验证码
// ============================================================
app.post('/api/auth/send-otp', (req, res) => {
  let { phone } = req.body;

  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ error: '手机号不能为空' });
    return;
  }

  // 📱 格式化手机号：统一转换为 +86 格式
  const originalPhone = phone;
  const formattedPhone = normalizePhone(phone);
  
  console.log('   📞 手机号格式化:');
  console.log(`      输入: ${originalPhone}`);
  console.log(`      输出: ${formattedPhone}`);

  const otp = generateOtp();

  // 存入缓存（使用格式化后的手机号作为 key）
  otpStore.set(formattedPhone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

  console.log('════════════════════════════════════════════════');
  console.log('   📨 OTP 验证码已生成');
  console.log('────────────────────────────────────────────────');
  console.log(`   📞 手机号:   ${formattedPhone}`);
  console.log(`   🔑 验证码:   ${otp}`);
  console.log(`   ⏰ 有效期:   5 分钟`);
  console.log('════════════════════════════════════════════════');
  console.log('');
  console.log('   💡 查看验证码: GET http://localhost:' + PORT + '/admin');
  console.log('');

  res.json({
    success: true,
    message: '验证码已发送',
    data: {
      phone: formattedPhone,  // 返回格式化后的手机号
      expiresIn: 300,
    },
    // 开发模式返回提示（生产环境不要返回 OTP）
    _dev_hint: '请查看 Express 服务端控制台或访问 /admin 获取验证码',
  });
});

// ============================================================
// 【核心】验证 OTP 接口
// 验证用户输入的验证码是否正确
// ============================================================
app.post('/api/auth/verify-otp', async (req, res) => {
  let { phone, otp } = req.body;

  if (!phone || !otp) {
    res.status(400).json({ error: '手机号和验证码不能为空' });
    return;
  }

  // 📱 格式化手机号（与发送时保持一致）
  const formattedPhone = normalizePhone(phone);
  
  console.log('   📞 手机号格式化:');
  console.log(`      输入: ${phone}`);
  console.log(`      查找: ${formattedPhone}`);

  // 使用格式化后的手机号查找验证码
  const entry = otpStore.get(formattedPhone);

  if (!entry) {
    res.status(400).json({ error: '未找到验证码，请先发送', hint: '请确认手机号格式一致' });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(formattedPhone);
    res.status(400).json({ error: '验证码已过期，请重新发送' });
    return;
  }

  if (entry.otp !== otp) {
    res.status(400).json({ error: '验证码错误' });
    return;
  }

  // 验证成功，清除 OTP（使用格式化后的 key）
  otpStore.delete(formattedPhone);

  // ============================================================
  // 同步用户到 Supabase Auth（可选）
  // 使用格式化后的手机号 +86...
  // ============================================================
  let supabaseUserId: string | null = null;
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        phone: formattedPhone,  // 使用格式化后的手机号
        phone_confirm: true,
      });
      if (error) {
        // 用户已存在（重复手机号）是正常情况，忽略错误
        console.log(`   👤 Supabase Auth 用户已存在: ${formattedPhone}`);
        // 尝试查询已有用户的 ID
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.users?.find((u) => u.phone === formattedPhone);
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
        console.log(`   👤 Supabase Auth 用户已存在: ${formattedPhone}`);
        // 尝试查询已有用户
        try {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const existing = users?.users?.find((u) => u.phone === formattedPhone);
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
  sessionStore.set(token, { phone: formattedPhone, createdAt: Date.now() });

  console.log('════════════════════════════════════════════════');
  console.log('   ✅ OTP 验证成功');
  console.log('────────────────────────────────────────────────');
  console.log(`   📞 手机号:   ${formattedPhone}`);
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
    user: { 
      phone: formattedPhone,  // 返回格式化后的手机号
      supabase_user_id: supabaseUserId 
    },
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
// 接收 Supabase Auth 生成的验证码（替代真实短信发送）
//
// 流程：
//   前端 → Supabase signInWithOtp → 此接口 → 保存验证码 → 开发者查看
//
// ══════════════════════════════════════════════════════════
// ⚠️  Supabase Auth Hook 数据格式说明：
//
// 当你在 Supabase Dashboard 配置 SMS Provider 为 "Custom" 并设置
// SMS Hook URL 后，Supabase 会在此接口触发时发送如下格式的数据：
//
//   {
//     "metadata": {
//       "uuid": "xxx",
//       "time": "2026-07-07T13:40:44.943496942Z",
//       "name": "send-sms",        // ← 事件名称
//       "ip_address": "74.50.127.238"
//     },
//     "user": {
//       "id": "923a8780-d782-4c10-8f4d-9f1e8a227096",
//       "phone": "+86138xxxx",    // ← 手机号在这里
//       "email": "",
//       "app_metadata": { "provider": "phone" },
//       ...
//     }
//   }
//
// ⚠️  注意：Supabase Auth Hook 不会在请求体中直接发送 OTP 验证码！
//      OTP 由 Supabase 内部管理，你需要通过其他方式获取。
//      开发环境下，我们采用以下策略之一：
//      - 方案 A: 自行生成 mock OTP（仅用于开发测试）
//      - 方案 B: 提示开发者去 Supabase Dashboard 或数据库查看
// ══════════════════════════════════════════════════════════
// ============================================================

/**
 * 从 Supabase Auth Hook 请求体中提取手机号
 * 支持多种可能的字段位置和命名方式
 */
function extractPhoneFromBody(body: any): string | null {
  // 尝试 1: 直接的顶层字段
  if (body.phone || body.to || body.recipient || body.phoneNumber) {
    return body.phone || body.to || body.recipient || body.phoneNumber;
  }
  
  // 尝试 2: 嵌套在 user 对象中（Supabase Auth Hook 格式）
  if (body.user && body.user.phone) {
    return body.user.phone;
  }
  
  // 尝试 3: 其他嵌套位置
  if (body.data && body.data.phone) return body.data.phone;
  if (body.payload && body.payload.phone) return body.payload.phone;
  
  return null;
}

app.post('/api/sms-hook', (req, res) => {
  // ══════════════════════════════════════════════════════════
  // 📥 步骤 1: 接收并解析请求数据
  // ══════════════════════════════════════════════════════════
  const rawBody = req.body;
  const phone = extractPhoneFromBody(rawBody);
  
  // 🔑 生成开发用的 OTP（6位随机数）
  // 注意：这不是 Supabase 真正生成的 OTP，仅用于开发测试环境
  // 生产环境中，你应该接入真实短信服务（如阿里云、Twilio等）
  const generatedOtp = generateOtp();
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  📨 [SMS Hook] 收到 Supabase Auth Hook 请求                     ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  
  console.log('║  📋 元数据 (Metadata):                                          ║');
  console.log(`║     • 事件名称: ${(rawBody.metadata?.name || '未知').padEnd(47)}║`);
  console.log(`║     • 时间戳:   ${(rawBody.metadata?.time || '未知').padEnd(47)}║`);
  console.log(`║     • IP 地址:  ${(rawBody.metadata?.ip_address || '未知').padEnd(47)}║`);
  
  console.log('║                                                                  ║');
  console.log('║  👤 用户信息 (User):                                             ║');
  if (rawBody.user) {
    console.log(`║     • 用户 ID:  ${String(rawBody.user?.id || '未知').slice(0, 40).padEnd(46)}║`);
    console.log(`║     • 手机号:   ${String(rawBody.user?.phone || '未知').padEnd(46)}║`);
    console.log(`║     • Email:    ${String(rawBody.user?.email || '无').padEnd(46)}║`);
    console.log(`║     • Provider: ${String(rawBody.user?.app_metadata?.provider || '未知').padEnd(46)}║`);
  } else {
    console.log('║     ℹ️  无 user 对象                                               ║');
  }
  
  console.log('║                                                                  ║');
  console.log('║  🔍 解析结果:                                                     ║');
  console.log(`║     📞 手机号: ${phone ? '✅ ' + phone.padEnd(42) : '❌ 未找到'.padEnd(46)}║`);
  console.log(`║     🔑 验证码: ✅ ${generatedOtp}  (开发模式自动生成)                    ║`);
  console.log(`║     ⏰ 时间:   ${new Date().toLocaleString('zh-CN').padEnd(46)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // ══════════════════════════════════════════════════════════
  // 💾 步骤 2: 保存到缓存
  // ══════════════════════════════════════════════════════════
  if (phone && generatedOtp) {
    otpStore.set(phone, {
      otp: generatedOtp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      createdAt: Date.now(),
    });
    
    console.log('   ✅ 验证码已保存到缓存！');
    console.log(`   📱 手机号: ${phone}`);
    console.log(`   🔑 验证码: ${generatedOtp}`);
    console.log('   ⏰  有效期: 5 分钟');
    console.log('');
    console.log('   💡 请在 App 中输入此验证码完成登录！');
    console.log('   💡 或访问: http://localhost:' + PORT + '/admin\n');
    
    res.json({
      success: true,
      message: 'Dev OTP generated and stored',
      data: {
        phone,
        otp: generatedOtp,
        expiresIn: 300,
        mode: 'dev',
        note: '开发模式：使用自动生成的 OTP'
      }
    });
  } else {
    console.log('   ❌ 无法提取手机号！');
    console.log('   💡 请检查 Supabase Auth Hook 配置\n');
    
    res.status(400).json({
      success: false,
      message: 'Cannot extract phone number from request',
      error: 'PHONE_MISSING',
      receivedKeys: Object.keys(rawBody)
    });
  }
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
// 【管理后台】HTML 页面 - 查看验证码（浏览器直接访问）
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
    .container { max-width: 600px; margin: 0 auto; }
    h1 { text-align: center; color: #1a1a2e; margin-bottom: 8px; font-size: 24px; }
    .subtitle { text-align: center; color: #666; margin-bottom: 24px; font-size: 14px; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
    .header h2 { font-size: 16px; }
    .badge { background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 12px; font-size: 13px; }
    .empty { padding: 40px; text-align: center; color: #999; }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
    .otp-item { padding: 16px 20px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; }
    .otp-item:last-child { border-bottom: none; }
    .otp-item.expired { opacity: 0.5; background: #fafafa; }
    .otp-info { flex: 1; }
    .otp-phone { font-weight: 600; color: #333; font-size: 15px; }
    .otp-time { font-size: 12px; color: #999; margin-top: 2px; }
    .otp-code { font-family: 'SF Mono', Monaco, monospace; font-size: 28px; font-weight: 700; color: #667eea; letter-spacing: 4px; background: #f8f9ff; padding: 8px 16px; border-radius: 8px; cursor: pointer; user-select: all; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
    .status-dot.active { background: #52c41a; }
    .status-dot.expired { background: #999; }
    .countdown { font-size: 12px; color: #e94560; margin-left: 8px; }
    footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
    .refresh-btn { background: none; border: none; color: #fff; cursor: pointer; font-size: 14px; opacity: 0.9; }
    .refresh-btn:hover { opacity: 1; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🍽️ 食客系统</h1>
    <p class="subtitle">验证码管理后台 - 开发测试模式</p>

    <div class="card">
      <div class="header">
        <h2>📋 验证码列表</h2>
        <span><button class="refresh-btn" onclick="loadOtps()">🔄 刷新</button></span>
      </div>
      <div id="otpList">
        <div class="empty">
          <div class="empty-icon">📭</div>
          <p>暂无验证码</p>
          <p style="font-size:12px;margin-top:8px;">在前端输入手机号后，验证码会显示在这里</p>
        </div>
      </div>
    </div>

    <footer>
      <p>自动刷新: <span id="timer">5</span>秒 | 数据来源: Supabase Auth → SMS Hook</p>
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
        el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>暂无验证码</p><p style="font-size:12px;margin-top:8px;">在前端输入手机号后，验证码会显示在这里</p></div>';
        return;
      }
      el.innerHTML = data.data.map(item =>
        '<div class="otp-item ' + item.status + '">' +
          '<div class="otp-info">' +
            '<div class="otp-phone"><span class="status-dot ' + item.status + '"></span>' + item.phone + '</div>' +
            '<div class="otp-time">' + item.createdAt + (item.status === 'active' ? ' · 剩余 <span class="countdown">' + item.remainingSec + '</span>s' : ' · 已过期') + '</div>' +
          '</div>' +
          '<div class="otp-code">' + (item.status === 'active' ? item.otp : '------') + '</div>' +
        '</div>'
      ).join('');
    })
    .catch(err => console.error(err));
}
setInterval(() => { countdown--; if (countdown <= 0) { loadOtps(); countdown = 5; } document.getElementById('timer').textContent = countdown; }, 1000);
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
  console.log('   │  🔐 核心流程 (Supabase Auth OTP)        │');
  console.log('   ├─────────────────────────────────────────┤');
  console.log(`   │  SMS Hook: POST /api/sms-hook            │`);
  console.log(`   │  验证码列表: GET  /api/admin/otp-list    │`);
  console.log(`   │  管理后台:  GET  /admin                  │`);
  console.log('   └─────────────────────────────────────────┘');
  console.log('');
  console.log('   💡 打开 http://localhost:' + PORT + '/admin 查看验证码！');
  console.log('════════════════════════════════════════════════');
  console.log('');
});
