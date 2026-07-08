# 🍽️ 食客系统 - 配置检查与运行指南

## ✅ 当前配置状态（已通过检查）

### 1. 环境变量 (.env) ✅
```
✅ SUPABASE_URL 已配置
✅ SUPABASE_ANON_KEY 已配置  
✅ SUPABASE_SERVICE_ROLE_KEY 已配置
✅ SERVER_PORT=3001
✅ JWT_SECRET 已配置
✅ JWT_EXPIRES_IN=7d
```

### 2. 依赖包 ✅
```
✅ @supabase/supabase-js: ^2.49.1 (前后端)
✅ bcryptjs: ^3.0.3 (后端)
✅ jsonwebtoken: ^9.0.3 (后端)
✅ express: ^4.18.2 (后端)
✅ react-native + expo (前端)
```

### 3. TypeScript 配置 ✅
```
✅ tsconfig.json 正确配置
✅ 目标: ES2022
✅ 模块: commonjs
✅ 严格模式: 开启
```

---

## 🚀 启动步骤

### 方式一：同时启动前后端（推荐）

```bash
cd "e:\JTH\small project\phone"
pnpm dev
```

这将并行启动：
- 后端服务: http://localhost:3001
- 前端应用: Expo DevTools

### 方式二：分别启动

**终端 1 - 后端服务：**
```bash
cd "e:\JTH\small project\phone"
pnpm dev:server
```

看到以下输出说明启动成功：
```
════════════════════════════════════
   🚀 食客系统 - 短信服务运行中
   🌐 地址: http://localhost:3001
   ┌─────────────────────────────────┐
   │  🔐 当前模式：方案 A            │
   │  SMS Hook: POST /api/sms-hook   │
   │  管理后台: GET  /admin          │
   └─────────────────────────────────┘
```

**终端 2 - 前端应用：**
```bash
cd "e:\JTH\small project\phone"
pnpm dev:web
```

---

## 🔍 验证服务是否正常运行

### 1. 检查后端健康状态

浏览器访问或 curl：
```bash
curl http://localhost:3001/api/health
```

期望返回：
```json
{
  "status": "ok",
  "timestamp": "2024-xx-xxT..."
}
```

### 2. 访问管理后台

浏览器打开：
```
http://localhost:3001/admin
```

可以看到验证码管理界面。

### 3. 测试新增的认证 API

#### 3.1 检查手机号是否已注册（GET）
```bash
curl http://localhost:3001/api/auth/check-phone/+8613800138000
```

**新用户返回**：
```json
{
  "registered": false
}
```

**已注册用户返回**：
```json
{
  "registered": true,
  "profileCompleted": true,
  "nickname": "xxx"
}
```

#### 3.2 创建用户资料（POST）
```bash
curl -X POST http://localhost:3001/api/auth/profile \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+8613800138000",
    "password": "123456",
    "nickname": "测试用户"
  }'
```

成功返回（包含 JWT token）：
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "profile": {
    "id": "uuid-xxx",
    "phone": "+8613800138000",
    "nickname": "测试用户",
    "is_profile_completed": true
  }
}
```

#### 3.3 密码登录（POST）
```bash
curl -X POST http://localhost:3001/api/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+8613800138000",
    "password": "123456"
  }'
```

成功返回：
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid-xxx",
    "phone": "+8613800138000",
    "nickname": "测试用户",
    ...
  }
}
```

#### 3.4 获取用户信息（需要 Token，GET）
```bash
# 先从上面获取 token，然后：
curl http://localhost:3001/api/auth/me-jwt \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

#### 3.5 修改密码（需要 Token，POST）
```bash
curl -X POST http://localhost:3001/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{
    "old_password": "123456",
    "new_password": "newpass123"
  }'
```

---

## 📱 前端使用指南

### Expo 启动后的操作

1. **打开 Expo Go 应用**（手机上）或 **浏览器**
2. **扫描二维码** 或 **点击 "Run on Web"**
3. 进入登录页面后：

#### 新用户注册流程：
```
1. 输入手机号 → 选择"📱 验证码登录"
2. 点击"发送验证码"
3. 获取验证码（开发环境查看 Supabase Auth Logs）
   地址: https://supabase.com/dashboard/project/zxugomsqlzoxdkkgjyar/auth/logs
4. 输入 6 位验证码 → 点击"确认验证码"
5. 自动跳转到"完善个人资料"页面
6. 填写昵称 + 设置密码（≥6位）
7. 点击"完成注册" → 进入首页 ✅
```

#### 老用户密码登录流程：
```
1. 输入已注册的手机号
2. 切换到"🔑 密码登录"标签
3. 输入登录密码
4. 点击"登录" → 进入首页 ✅
```

#### 老用户验证码登录流程：
```
1. 输入手机号 → 选择"📱 验证码登录"
2. 发送并输入验证码
3. 验证通过后直接进入首页 ✅（无需填写资料）
```

---

## ⚠️ 重要提醒

### ⚡ 必须先执行的操作

在启动前端之前，**必须先在 Supabase 创建 profiles 表**：

1. 打开浏览器访问：
   ```
   https://supabase.com/dashboard/project/zxugomsqlzoxdkkgjyar/sql/new
   ```

2. 复制 `database/profiles.sql` 的全部内容

3. 粘贴到编辑器中

4. 点击 **Run** 执行

5. 确认无错误输出

> 如果不执行这一步，调用 `/api/auth/check-phone`、`/api/auth/profile` 等接口会报错！

---

## 🐛 故障排除

### 问题 1：端口被占用
```
Error: listen EADDRINUSE :::3001
```

**解决**：
```bash
# Windows 查看占用端口的进程
netstat -ano | findstr :3001

# 结束进程（替换 PID）
taskkill /PID <PID> /F

# 或修改 .env 中的 SERVER_PORT
SERVER_PORT=3002
```

### 问题 2：依赖安装失败
```
ERR_PNPM_PEER_DEP_ISSUES
```

**解决**：
```bash
# 清除缓存重新安装
cd "e:\JTH\small project\phone"
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### 问题 3：TypeScript 编译错误
```
error TS2307: Cannot find module 'bcryptjs'
```

**解决**：
```bash
cd packages/server
pnpm add bcryptjs jsonwebtoken
```

### 问题 4：Supabase 连接失败
```
⚠️  Supabase service_role key 未配置
```

**解决**：
1. 检查 `.env` 文件中的 `SUPABASE_SERVICE_ROLE_KEY`
2. 确认值不为空且不是 placeholder
3. 从 Supabase Dashboard 重新复制密钥

---

## 📊 API 接口总览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/health` | 健康检查 | 无 |
| GET | `/api/admin` | 验证码管理后台（HTML） | 无 |
| GET | `/api/auth/check-phone/:phone` | 检查手机号注册状态 | 无 |
| POST | `/api/auth/profile` | 创建用户资料+设置密码 | 无 |
| POST | `/api/auth/login-password` | 密码登录 | 无 |
| GET | `/api/auth/me-jwt` | 获取当前用户信息 | JWT |
| POST | `/api/auth/change-password` | 修改密码 | JWT |
| POST | `/api/auth/send-otp` | 发送验证码（已弃用） | 无 |
| POST | `/api/auth/verify-otp` | 验证 OTP（已弃用） | 无 |

**注意**：标记为"已弃用"的接口保留用于向后兼容或开发调试，生产环境应使用 Supabase Auth 原生功能。

---

## 🔐 安全配置建议（生产环境）

### 必须修改的配置项：

```env
# .env 文件

# 1. 生成强随机字符串作为 JWT_SECRET
# 可以使用命令生成：
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<生成的长随机字符串>

# 2. 缩短 Token 有效期（可选，默认 7 天）
JWT_EXPIRES_IN=24h  # 或 12h, 7d

# 3. 确保 SUPABASE_SERVICE_ROLE_KEY 不泄露
# 不要提交到 Git！
```

### 推荐的安全增强：

1. **启用 HTTPS**（生产环境必须）
2. **限制请求频率**（添加 rate-limiting 中间件）
3. **添加 CORS 白名单**（不要使用 `cors()` 允许所有来源）
4. **日志监控**（记录异常登录尝试）
5. **定期轮换密钥**（JWT_SECRET 定期更换）

---

## 🎯 快速开始脚本（Windows PowerShell）

保存为 `start.ps1` 并执行：

```powershell
# start.ps1
Write-Host "🍽️ 食客系统 - 启动脚本" -ForegroundColor Cyan

# 检查 .env 文件
if (-not (Test-Path ".env")) {
    Write-Host "❌ 错误: 未找到 .env 文件" -ForegroundColor Red
    exit 1
}

# 检查端口占用
$port = 3001
$connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($connection) {
    Write-Host "⚠️  警告: 端口 $port 已被占用" -ForegroundColor Yellow
    Write-Host "   进程 PID: $($connection.OwningProcess)" -ForegroundColor Yellow
    Write-Host "   尝试结束进程..." -ForegroundColor Yellow
    
    Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "📋 启动前检查：" -ForegroundColor Green
Write-Host "   ✅ .env 文件存在"
Write-Host "   ✅ 端口 $port 可用"

# 提示创建数据库表
Write-Host ""
Write-Host "⚠️  重要提示：" -ForegroundColor Yellow
Write-Host "   请确保已在 Supabase 执行 database/profiles.sql 创建数据表！"
Write-Host ""

# 启动服务
Write-Host "🚀 启动服务..." -ForegroundColor Cyan
Write-Host ""

pnpm dev
```

执行：
```powershell
.\start.ps1
```

---

## ✨ 功能演示顺序

### 第一次体验（完整流程）

1. **准备阶段**：
   ```bash
   # 终端 1
   cd "e:\JTH\small project\phone"
   pnpm dev
   ```

2. **数据库初始化**：
   - 浏览器打开 Supabase SQL Editor
   - 执行 `database/profiles.sql`

3. **新用户注册测试**：
   - 手机输入: `+8613812345678`（任意未注册号码）
   - 选择"验证码登录"→ 发送验证码
   - 获取验证码（Auth Logs）
   - 输入验证码 → 完善资料
   - 设置密码: `123456`
   - 注册完成！

4. **老用户登录测试**：
   - 同一手机号: `+8613812345678`
   - 切换到"密码登录"
   - 输入密码: `123456`
   - 登录成功！

5. **API 测试**（可选）：
   - 使用上面的 curl 命令测试各接口

---

## 📞 技术支持

如遇问题请检查：

1. ✅ Node.js 版本 ≥ 18 (`node --version`)
2. ✅ pnpm 版本 ≥ 8 (`pnpm --version`)
3. ✅ `.env` 文件完整
4. ✅ 数据库表已创建
5. ✅ 端口未被占用
6. ✅ 依赖已安装（`pnpm install`）

---

**版本**: v1.0.0  
**最后更新**: 2024  
**状态**: ✅ 配置就绪，可立即运行
