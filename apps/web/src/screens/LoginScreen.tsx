import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../services/supabase';

// API 基础地址（开发环境）
const SERVER_URL = 'http://localhost:3001';

type LoginMode = 'phone' | 'password'; // 登录模式：验证码 / 密码
type AuthStep = 
  | 'input_phone'      // 输入手机号（通用）
  | 'verify_otp'       // 验证码验证（新用户/验证码登录用）
  | 'set_profile';     // 设置密码+填写信息（仅新用户）

type AuthIntent = 'login' | 'register'; // 用户意图：登录 或 注册

export default function LoginScreen({ navigation }: any) {
  const [mode, setMode] = useState<LoginMode>('phone'); // 默认验证码登录
  const [step, setStep] = useState<AuthStep>('input_phone');
  const [intent, setIntent] = useState<AuthIntent>('login'); // 默认登录模式
  
  // 表单数据
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // 新用户资料
  const [nickname, setNickname] = useState('');
  
  // 状态
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);

  // ============================================================
  // 第一步：检查手机号 + 发送验证码（或直接密码登录）
  // ============================================================
  const handleSendCode = async () => {
    const cleanPhone = phone.trim();
    setErrorMsg('');

    if (!cleanPhone) {
      setErrorMsg('请输入手机号');
      return;
    }

    console.log('[Login] 处理手机号:', cleanPhone);
    setLoading(true);

    try {
      if (mode === 'password') {
        // 密码模式：检查手机号是否已注册，然后尝试登录
        await handlePasswordLogin();
      } else {
        // 验证码模式：发送 OTP
        await handleOtpLogin(cleanPhone);
      }
    } catch (err: any) {
      console.error('[Login] 处理异常:', err);
      setErrorMsg(`操作失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 验证码登录流程（通过后端发送 SMS）
  // ============================================================
  const handleOtpLogin = async (cleanPhone: string) => {
    try {
      // 1. 如果是登录模式，先检查手机号是否已注册
      if (intent === 'login') {
        const checkRes = await fetch(`${SERVER_URL}/api/auth/check-phone/${encodeURIComponent(cleanPhone)}`);
        const checkData = await checkRes.json();
        
        console.log('[Login] 检查手机号结果:', checkData);

        if (!checkRes.ok) {
          throw new Error(checkData.error || '检查手机号失败');
        }

        // 记录是否为新用户
        setIsNewUser(!checkData.registered);
      } else {
        // 注册模式：标记为新用户
        setIsNewUser(true);
      }

      // 2. 通过后端发送 SMS 验证码（后端代理到 Supabase Auth）
      const smsRes = await fetch(`${SERVER_URL}/api/auth/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      
      const smsData = await smsRes.json();

      if (!smsRes.ok) {
        // 特殊处理：频率限制
        if (smsData.code === 'RATE_LIMITED') {
          throw new Error('发送过于频繁，请60秒后再试');
        }
        throw new Error(smsData.error || '发送验证码失败');
      }

      console.log('[Login] 后端发送验证码成功');
      setStep('verify_otp');
      setOtp('');
    } catch (err: any) {
      throw err;
    }
  };

  // ============================================================
  // 密码登录流程
  // ============================================================
  const handlePasswordLogin = async (cleanPassword?: string) => {
    const cleanPhone = phone.trim();
    const pwd = cleanPassword || password.trim();

    if (!pwd) {
      // 如果没有传入密码，只是跳转到输入密码步骤
      return;
    }

    if (pwd.length < 6) {
      setErrorMsg('密码长度至少6位');
      return;
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          password: pwd,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.error || '登录失败');
        return;
      }

      console.log('[Login] 密码登录成功:', data.user.id);
      
      // 存储 token 到 AsyncStorage 或状态管理
      // TODO: 实现实际的 token 存储逻辑
      
      navigation.replace('Home');
    } catch (err: any) {
      setErrorMsg(`网络错误: ${err.message}`);
    }
  };

  // ============================================================
  // 第二步：验证 OTP 验证码（通过后端验证）
  // ============================================================
  const handleVerifyOtp = async () => {
    const code = otp.trim();
    setErrorMsg('');

    if (!code || code.length < 4) {
      setErrorMsg('请输入完整的验证码');
      return;
    }

    console.log('[Login] 验证 OTP:', code);
    setLoading(true);

    try {
      // 通过后端验证 OTP（后端代理到 Supabase Auth）
      const response = await fetch(`${SERVER_URL}/api/auth/verify-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: code }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'OTP_EXPIRED') {
          setErrorMsg('验证码已过期，请重新发送');
          return;
        }
        if (data.code === 'OTP_INVALID' || data.code === 'OTP_WRONG') {
          setErrorMsg(data.error || '验证码错误');
          return;
        }
        throw new Error(data.error || '验证失败');
      }

      console.log('[Login] 后端验证成功, isNewUser:', data.isNewUser);
      
      if (data.isNewUser) {
        // 新用户：跳转到填写资料页面
        setStep('set_profile');
      } else {
        // 老用户：查询/创建 profile 并获取 JWT
        await handleOldUserLogin(data.user?.id || null);
      }
    } catch (err: any) {
      if (err.message) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(`网络错误`);
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 老用户验证码通过后：获取 JWT 并进入首页
  // ============================================================
  const handleOldUserLogin = async (supabaseUserId?: string | null) => {
    try {
      const cleanPhone = phone.trim();
      
      // 调用后端接口获取或创建 JWT Token（验证码登录专用）
      const response = await fetch(`${SERVER_URL}/api/auth/otp-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          auth_user_id: supabaseUserId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 如果没有这个接口或用户还没有 profile，直接进入首页
        console.log('[Login] 老用户 OTP 登录成功（无 profile）');
        navigation.replace('Home');
        return;
      }

      // 存储 token
      if (data.token) {
        // TODO: 存储到 AsyncStorage 或状态管理
        console.log('[Login] 获取到 JWT Token:', data.token.slice(0, 20) + '...');
      }

      console.log('[Login] 老用户验证码登录成功:', data.user?.id);
      navigation.replace('Home');
    } catch (err: any) {
      // 即使出错也允许进入首页（已通过 Supabase 验证）
      console.log('[Login] 老用户验证码登录成功（降级处理）');
      navigation.replace('Home');
    }
  };

  // ============================================================
  // 第三步：新用户提交资料（设置密码 + 昵称等）
  // ============================================================
  const handleSubmitProfile = async () => {
    const pwd = password.trim();
    const confirmPwd = confirmPassword.trim();

    setErrorMsg('');

    // 参数校验
    if (pwd.length < 6) {
      setErrorMsg('密码长度至少6位');
      return;
    }

    if (pwd !== confirmPwd) {
      setErrorMsg('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      const cleanPhone = phone.trim();

      // 获取 Supabase Auth 用户 ID
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id;

      const response = await fetch(`${SERVER_URL}/api/auth/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_user_id: authUserId,
          phone: cleanPhone,
          password: pwd,
          nickname: nickname.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.error || '保存失败');
        return;
      }

      console.log('[Login] 资料创建成功:', data.profile.id);

      // TODO: 存储 JWT Token
      // localStorage.setItem('token', data.token);
      
      navigation.replace('Home');
    } catch (err: any) {
      setErrorMsg(`网络错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 切换登录模式（验证码/密码）
  // ============================================================
  const toggleMode = () => {
    const newMode = mode === 'phone' ? 'password' : 'phone';
    setMode(newMode);
    setStep('input_phone');
    setPassword('');
    setConfirmPassword('');
    setErrorMsg('');
  };

  // ============================================================
  // 切换 登录/注册 意图
  // ============================================================
  const switchToRegister = () => {
    setIntent('register');
    setMode('phone'); // 注册只能用验证码
    setStep('input_phone');
    setPassword('');
    setConfirmPassword('');
    setOtp('');
    setNickname('');
    setErrorMsg('');
    setIsNewUser(true);
  };

  const switchToLogin = () => {
    setIntent('login');
    setMode('phone');
    setStep('input_phone');
    setPassword('');
    setConfirmPassword('');
    setOtp('');
    setNickname('');
    setErrorMsg('');
    setIsNewUser(false);
  };

  // ============================================================
  // 输入框事件处理
  // ============================================================
  const handlePhoneChange = (text: string) => {
    const cleaned = text.replace(/[^0-9+]/g, '');
    setPhone(cleaned);
  };

  const handleOtpChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length <= 6) {
      setOtp(cleaned);
    }
  };

  // ============================================================
  // 渲染函数
  // ============================================================
  const renderInputPhone = () => (
    <>
      <Text style={styles.label}>手机号</Text>
      <TextInput
        style={styles.input}
        placeholder="+8613800138000"
        placeholderTextColor="#999"
        value={phone}
        onChangeText={handlePhoneChange}
        keyboardType="phone-pad"
        autoFocus
        editable={!loading}
      />

      {/* 登录模式切换（仅登录意图时显示） */}
      {intent === 'login' && (
        <View style={styles.modeSwitch}>
          <TouchableOpacity 
            style={[styles.modeTab, mode === 'phone' && styles.modeTabActive]}
            onPress={() => { setMode('phone'); setErrorMsg(''); }}
            disabled={loading}
          >
            <Text style={[styles.modeText, mode === 'phone' && styles.modeTextActive]}>
              📱 验证码登录
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.modeTab, mode === 'password' && styles.modeTabActive]}
            onPress={() => { setMode('password'); setErrorMsg(''); }}
            disabled={loading}
          >
            <Text style={[styles.modeText, mode === 'password' && styles.modeTextActive]}>
              🔑 密码登录
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 注册模式提示 */}
      {intent === 'register' && (
        <View style={styles.registerBanner}>
          <Text style={styles.registerBannerText}>
            ✨ 您正在注册新账号
          </Text>
        </View>
      )}

      {/* 根据模式显示不同的按钮 */}
      {mode === 'password' ? (
        <>
          <Text style={styles.label}>密码</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入登录密码"
            placeholderTextColor="#999"
            value={password}
            onChangeText={(text) => setPassword(text)}
            secureTextEntry
            editable={!loading}
          />
          
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => handleSendCode()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>登 录</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSendCode}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {intent === 'register' ? '获取验证码注册' : '发送验证码'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* 底部切换 登录/注册 链接 */}
      <View style={styles.switchIntentRow}>
        <Text style={styles.switchIntentText}>
          {intent === 'login' ? '还没有账号？' : '已有账号？'}
        </Text>
        <TouchableOpacity 
          onPress={intent === 'login' ? switchToRegister : switchToLogin}
          disabled={loading}
        >
          <Text style={styles.switchIntentLink}>
            {intent === 'login' ? '立即注册' : '去登录'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderVerifyOtp = () => (
    <>
      <Text style={styles.label}>验证码</Text>
      <Text style={styles.phoneDisplay}>已发送至 {phone}</Text>
      <TextInput
        style={[styles.input, styles.otpInput]}
        placeholder="000000"
        placeholderTextColor="#999"
        value={otp}
        onChangeText={handleOtpChange}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        editable={!loading}
      />

      <View style={styles.devBanner}>
        <Text style={styles.devBannerText}>
          📲 短信验证码
        </Text>
        <Text style={styles.devBannerSub}>
          验证码已通过后端发送到您的手机
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerifyOtp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>确认验证码</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => {
          setStep('input_phone');
          setOtp('');
          setErrorMsg('');
        }}
        disabled={loading}
      >
        <Text style={styles.linkText}>← 更换手机号</Text>
      </TouchableOpacity>
    </>
  );

  const renderSetProfile = () => (
    <>
      <Text style={styles.subtitle} style={{ ...styles.subtitle, marginBottom: 20 }}>
        设置您的账户信息
      </Text>
      
      {/* 昵称 */}
      <Text style={styles.label}>昵称（可选）</Text>
      <TextInput
        style={styles.input}
        placeholder="请输入昵称"
        placeholderTextColor="#999"
        value={nickname}
        onChangeText={(text) => setNickname(text)}
        editable={!loading}
        maxLength={20}
      />

      {/* 设置密码 */}
      <Text style={styles.label}>设置登录密码 *</Text>
      <TextInput
        style={styles.input}
        placeholder="至少6位密码"
        placeholderTextColor="#999"
        value={password}
        onChangeText={(text) => setPassword(text)}
        secureTextEntry
        editable={!loading}
      />

      {/* 确认密码 */}
      <Text style={styles.label}>确认密码 *</Text>
      <TextInput
        style={styles.input}
        placeholder="再次输入密码"
        placeholderTextColor="#999"
        value={confirmPassword}
        onChangeText={(text) => setConfirmPassword(text)}
        secureTextEntry
        editable={!loading}
        onSubmitEditing={handleSubmitProfile}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmitProfile}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>完成注册</Text>
        )}
      </TouchableOpacity>
    </>
  );

  // ============================================================
  // 主渲染
  // ============================================================
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.title}>食客系统</Text>
            
            {/* 步骤指示器 */}
            {step !== 'input_phone' && (
              <>
                <View style={styles.steps}>
                  <View style={[styles.stepDot, step !== 'input_phone' && styles.stepDotActive]} />
                  {(step === 'verify_otp' || step === 'set_profile') && <View style={styles.stepLine} />}
                  {step === 'set_profile' && (
                    <>
                      <View style={[styles.stepDot, step === 'set_profile' && styles.stepDotActive]} />
                    </>
                  )}
                </View>
                <View style={styles.stepLabels}>
                  <Text style={styles.stepLabel}>
                    {step === 'set_profile' ? '验证完成' : '输入手机号'}
                  </Text>
                  {step === 'verify_otp' && <Text style={styles.stepLabel}>验证码确认</Text>}
                  {step === 'set_profile' && <Text style={styles.stepLabel}>完善资料</Text>}
                </View>
              </>
            )}

            {/* 当前步骤标题 */}
            <Text style={styles.subtitle}>
              {step === 'input_phone' && (
                intent === 'register' 
                  ? '手机号注册' 
                  : (mode === 'phone' ? '手机号验证码登录' : '手机号密码登录')
              )}
              {step === 'verify_otp' && '输入验证码'}
              {step === 'set_profile' && '完善个人资料'}
            </Text>

            {/* 错误提示 */}
            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
                <TouchableOpacity onPress={() => setErrorMsg('')}>
                  <Text style={styles.errorDismiss}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* 渲染不同步骤的表单 */}
            {step === 'input_phone' && renderInputPhone()}
            {step === 'verify_otp' && renderVerifyOtp()}
            {step === 'set_profile' && renderSetProfile()}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  
  // 步骤指示器
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ddd',
  },
  stepDotActive: {
    backgroundColor: '#e94560',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: '#ddd',
    marginHorizontal: 8,
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 28,
  },
  stepLabel: {
    fontSize: 12,
    color: '#999',
  },

  // 模式切换
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  modeTextActive: {
    color: '#e94560',
    fontWeight: '600',
  },

  // 表单
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  phoneDisplay: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fafafa',
    marginBottom: 20,
  },
  otpInput: {
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
  },

  // 按钮
  button: {
    backgroundColor: '#e94560',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    padding: 8,
  },
  linkText: {
    color: '#e94560',
    fontSize: 14,
  },

  // 错误提示
  errorBanner: {
    backgroundColor: '#f8d7da',
    borderWidth: 1,
    borderColor: '#f5c6cb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    fontSize: 13,
    color: '#721c24',
    flex: 1,
  },
  errorDismiss: {
    fontSize: 16,
    color: '#721c24',
    marginLeft: 8,
    fontWeight: '700',
  },

  // 开发者提示
  devBanner: {
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffc107',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  devBannerText: {
    fontSize: 12,
    color: '#856404',
    fontWeight: '600',
  },
  devBannerSub: {
    fontSize: 10,
    color: '#856404',
  },

  // 注册提示横幅
  registerBanner: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#4caf50',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  registerBannerText: {
    fontSize: 14,
    color: '#2e7d32',
    fontWeight: '600',
  },

  // 登录/注册切换行
  switchIntentRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  switchIntentText: {
    fontSize: 14,
    color: '#666',
  },
  switchIntentLink: {
    fontSize: 14,
    color: '#e94560',
    fontWeight: '600',
    marginLeft: 4,
  },
});
