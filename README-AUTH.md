# 🍽️ 食客系统 - 双模式认证系统

## 功能特性

- ✅ **验证码登录**：新用户/老用户均可通过手机验证码登录
- ✅ **密码登录**：老用户可使用手机号+密码快速登录
- ✅ **新用户注册流程**：首次注册自动跳转到资料填写页面
- ✅ **JWT 认证**：基于 JWT 的安全会话管理
- ✅ **bcrypt 密码加密**：安全的密码存储方案

---

## 📋 实现清单

### 1. 数据库表 (`database/profiles.sql`)

在 Supabase Dashboard 执行 SQL 脚本创建 `profiles` 表：

```bash
# 方法 1：通过 Supabase Dashboard
1. 打开 https://supabase.com/dashboard/project/zxugomsqlzoxdkkgjyar
2. 进入 SQL Editor
3. 复制粘贴 database/profiles.sql 的内容
4. 点击 Run 执行
```

表结构包含：
- `auth_user_id`: 关联 Supabase Auth 用户
- `phone`: 手机号（唯一）
- `password_hash`: bcrypt 加密的密码哈希
- `nickname`, `avatar_url`, 等个人信息字段
- RLS 行级安全策略

### 2. 后端 API 接口 (Express Server)

新增接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/check-phone/:phone` | 检查手机号是否已注册 |
| POST | `/api/auth/profile` | 创建/完善用户资料（新用户） |
| POST | `/api/auth/login-password` | 密码登录 |
| GET | `/api/auth/me-jwt` | 获取当前用户信息（需 JWT） |
| POST | `/api/auth/change-password` | 修改密码（需 JWT） |

#### 启动后端服务

```bash
cd "e:\JTH\small project\phone"
pnpm dev:server
```

服务将在 `http://localhost:3001` 运行。

### 3. 前端界面 (React Native)

改造后的 `LoginScreen.tsx` 支持三种状态：

```
输入手机号 → [选择登录模式]
    │
    ├─ 验证码模式 → 输入验证码 → 
    │   ├─ 新用户 → 填写资料 + 设置密码 → 完成
    │   └─ 老用户 → 直接进入首页
    │
    └─ 密码模式 → 输入密码 → 登录成功
```

---

## 🔐 认证流程详解

### 首次注册（新用户）

```
1. 用户输入手机号，选择"验证码登录"
2. 点击"发送验证码" → 调用 check-phone 检测是否为新用户
3. 通过 Supabase Auth 发送 OTP 到手机
4. 用户输入收到的 6 位验证码
5. 验证成功后自动跳转到"完善资料"页面
6. 填写：
   - 昵称（可选）
   - 登录密码（必填，≥6位）
   - 确认密码
7. 提交 → 写入 profiles 表 + 获得 JWT Token
8. 进入首页
```

### 再次登录 - 方式一：验证码登录

```
1. 输入手机号，选择"验证码登录"
2. 发送验证码 → 系统检测到该手机已注册
3. 输入验证码并验证通过
4. 直接进入首页
```

### 再次登录 - 方式二：密码登录（推荐）

```
1. 输入手机号，切换到"密码登录"模式
2. 输入登录密码
3. 点击"登录" → 后端验证密码
4. 获得 JWT Token → 进入首页
```

---

## 🛠️ 技术实现细节

### 密码安全

```typescript
// 使用 bcrypt 加密（saltRounds = 10）
const saltRounds = 10;
const passwordHash = await bcrypt.hash(password, saltRounds);

// 验证密码时使用 compare 方法
const isValid = await bcrypt.compare(inputPassword, storedHash);
```

### JWT Token 管理

```typescript
// 生成 token
const token = jwt.sign(
  { userId: data[0].id, phone: normalizedPhone },
  JWT_SECRET,
  { expiresIn: '7d' } // 7天有效期
);

// 验证中间件
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded; // 包含 userId 和 phone
}
```

### 手机号标准化

```typescript
// 统一转换为国际格式：+86xxxxxxxxxxx
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+86' + cleaned; // 中国手机号
  }
  
  return phone.includes('+') ? phone : '+86' + cleaned;
}
```

---

## 🧪 测试指南

### 使用 curl 测试 API

```bash
# 1. 检查手机号是否注册
curl http://localhost:3001/api/auth/check-phone/+8613800138000

# 2. 密码登录（需要先注册）
curl -X POST http://localhost:3001/api/auth/login-password \
  -H "Content-Type: application/json" \
  -d '{"phone": "+8613800138000", "password": "123456"}'

# 3. 创建用户资料（模拟注册）
curl -X POST http://localhost:3001/api/auth/profile \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+8613800138000",
    "password": "123456",
    "nickname": "测试用户"
  }'

# 4. 使用获取到的 token 查询用户信息
# 将 <YOUR_TOKEN> 替换为实际 token
curl http://localhost:3001/api/auth/me-jwt \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

### 前端测试步骤

1. **启动后端**：
   ```bash
   pnpm dev:server
   ```

2. **启动前端**：
   ```bash
   pnpm dev:web
   ```

3. **测试新用户注册**：
   - 输入一个未注册的手机号
   - 选择"验证码登录"
   - 从 Supabase Auth Logs 获取验证码
   - 输入验证码后会自动跳转到资料填写页
   - 填写昵称和密码完成注册

4. **测试老用户登录**：
   - 用刚注册的手机号登录
   - 切换到"密码登录"模式
   - 输入刚才设置的密码即可登录

---

## ⚙️ 配置说明

### .env 文件新增配置

```env
# JWT 配置（生产环境必须修改！）
JWT_SECRET=your-very-secret-random-string-here
JWT_EXPIRES_IN=7d  # Token 有效期
```

### 安全提醒

⚠️ **生产环境注意事项**：

1. **修改 JWT_SECRET**：
   - 必须设置为复杂的随机字符串
   - 至少 32 个字符
   - 不要提交到代码仓库

2. **启用 HTTPS**：
   - 生产环境必须使用 HTTPS
   - 防止中间人攻击

3. **密码策略**：
   - 当前要求 ≥ 6 位
   - 可根据需求增加复杂度要求

4. **验证码限制**：
   - 建议添加发送频率限制
   - 防止短信轰炸攻击

---

## 📁 文件结构

```
e:\JTH\small project\phone\
├── database/
│   └── profiles.sql              # 数据库建表脚本
├── packages/
│   └── server/
│       └── src/
│           └── index.ts          # Express 服务（已更新）
├── apps/
│   └── web/
│       └── src/
│           ├── screens/
│           │   ├── LoginScreen.tsx      # 登录页面（已重写）
│           │   └── HomeScreen.tsx       # 首页
│           └── services/
│               └── supabase.ts          # Supabase 客户端
├── .env                            # 环境变量（已更新）
└── README-AUTH.md                  # 本文件
```

---

## 🔜 未来增强功能（可选）

- [ ] 忘记密码：通过验证码重置密码
- [ ] 第三方登录：微信、Apple ID 绑定
- [ ] 设备管理：记录登录设备和位置
- [ ] 安全日志：记录登录历史
- [ ] 二次验证（2FA）：敏感操作额外验证
- [ ] 密码强度指示器：前端实时提示
- [ ] 图形验证码：防止机器人批量注册

---

## 🆘 故障排除

### 问题：数据库连接失败

**症状**：`500 错误 - 数据库未连接`

**解决**：
1. 检查 `.env` 中 `SUPABASE_SERVICE_ROLE_KEY` 是否正确
2. 确认 Supabase 项目是否正常运行
3. 确认已执行 `profiles.sql` 创建数据表

### 问题：手机号检查返回错误

**症状**：`查询失败` 错误

**解决**：
1. 确认 `profiles` 表已创建
2. 检查 RLS 策略是否正确设置
3. 查看 Supabase Dashboard 日志

### 问题：Token 无效

**症状**：`401 - 令牌无效或已过期`

**解决**：
1. 检查客户端发送的 Authorization header 格式是否为 `Bearer <token>`
2. 确认 JWT_SECRET 配置一致
3. 查看是否过期（默认 7 天）

---

## 📞 技术支持

如有问题，请查看：

1. **Supabase 文档**: https://supabase.com/docs
2. **Express.js 文档**: https://expressjs.com/
3. **React Native 文档**: https://reactnative.dev/

---

**版本**: v1.0.0  
**最后更新**: 2024  
**作者**: 食客系统开发团队
