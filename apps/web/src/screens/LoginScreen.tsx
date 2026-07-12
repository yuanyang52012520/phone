/**
 * 食刻校园 App - 登录页面
 * 
 * 功能:
 * Tab1: 验证码登录
 *   - 手机号输入框
 *   - 验证码输入框
 *   - 获取验证码按钮
 *   - 登录按钮
 * 
 * Tab2: 密码登录
 *   - 手机号输入框
 *   - 密码输入框
 *   - 登录按钮
 */

import React, { useState, useRef } from 'react';
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

import { useAuth } from '../contexts/AuthContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// API 基础地址
const SERVER_URL = 'http://localhost:3001';

// 手机号格式化工具：统一转为 +86xxxxxxxxxxx 格式
const normalizePhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+86${digits}`;
  }
  
  if (digits.startsWith('86')) {
    return `+${digits}`;
  }

  return value.startsWith('+') ? value : `+${digits}`;
};

// ============================================================
// 类型定义
// ============================================================

type LoginTab = 'OTP' | 'PASSWORD';  // 登录方式

interface LoginScreenProps {
  navigation: NativeStackNavigationProp<any>;
}

// ============================================================
// 主组件
// ============================================================

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { loginWithOtp, verifyOtp, loginWithPassword, registerPhone } = useAuth();

  // 当前 Tab
  const [activeTab, setActiveTab] = useState<LoginTab>('OTP');

  // 表单状态
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');

  // UI 状态
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 验证码倒计时
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // 倒计时 Effect
  React.useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else {
      if (countdownRef.current) {
        clearTimeout(countdownRef.current);
      }
    }
    
    return () => {
      if (countdownRef.current) {
        clearTimeout(countdownRef.current);
      }
    };
  }, [countdown]);

  // 清理倒计时
  React.useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearTimeout(countdownRef.current);
      }
    };
  }, []);

  // ============================================================
  // Tab1: 验证码登录 - 发送验证码
  // ============================================================
  const handleSendOtp = async () => {
    const rawPhone = phone.trim();
    
    if (!rawPhone) {
      setErrorMsg('请输入手机号');
      return;
    }

    const cleanPhone = normalizePhone(rawPhone);
    setPhone(cleanPhone);
    setLoading(true);
    setErrorMsg('');

    try {
      console.log('[Login] 发送验证码:', cleanPhone);

      // 调用 Supabase Auth signInWithOtp
      // 这会触发 Supabase Auth 生成 OTP 并调用 SMS Hook
      const { error } = await loginWithOtp(cleanPhone);

      if (error) {
        throw new Error(error.message || '发送验证码失败');
      }

      console.log('[Login] ✅ 验证码发送成功');
      setCountdown(60);
      
    } catch (err: any) {
      console.error('[Login] 发送验证码失败:', err.message);
      setErrorMsg(err.message || '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Tab1: 验证码登录 - 验证并登录
  // ============================================================
  const handleVerifyAndLogin = async () => {
    const code = otp.trim();

    if (!code || code.length < 4) {
      setErrorMsg('请输入完整的验证码');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const cleanPhone = normalizePhone(phone);
      console.log('[Login] 验证 OTP:', code);

      // 调用 Supabase Auth verifyOtp
      const { data, error } = await verifyOtp(cleanPhone, code);

      if (error) {
        throw new Error(error.message === 'Invalid OTP' ? '验证码错误或已过期' : error.message);
      }

      console.log('[Login] ✅ OTP 验证成功');

      // 获取 auth_user_id
      const authUserId = data.user?.id || data.session?.user?.id;

      if (!authUserId) {
        throw new Error('获取用户ID失败');
      }

      // 调用后端 login-phone 接口检查是否已注册
      const response = await fetch(`${SERVER_URL}/api/auth/login-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_user_id: authUserId,
          phone: cleanPhone,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.code === 'USER_NOT_REGISTERED') {
          // 手机号未注册 → 提示跳转注册页
          setErrorMsg(result.error || '手机号未注册，请先注册');
          
          // 延迟跳转到注册页面
          setTimeout(() => {
            navigation.navigate('Register', { phone: cleanPhone });
          }, 1500);
          return;
        }
        throw new Error(result.error || '登录失败');
      }

      console.log('[Login] ✅ 登录成功！进入首页');
      navigation.replace('Home');

    } catch (err: any) {
      console.error('[Login] 登录失败:', err.message);
      setErrorMsg(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Tab2: 密码登录
  // ============================================================
  const handlePasswordLogin = async () => {
    const rawPhone = phone.trim();
    const pwd = password;

    if (!rawPhone) {
      setErrorMsg('请输入手机号');
      return;
    }

    if (!pwd) {
      setErrorMsg('请输入密码');
      return;
    }

    if (pwd.length < 6) {
      setErrorMsg('密码格式不正确');
      return;
    }

    const cleanPhone = normalizePhone(rawPhone);
    setPhone(cleanPhone);
    setLoading(true);
    setErrorMsg('');

    try {
      console.log('[Login] 密码登录:', cleanPhone);

      // 调用后端密码登录接口
      const { error, data } = await loginWithPassword(cleanPhone, pwd);

      if (error) {
        throw error;
      }

      console.log('[Login] ✅ 密码验证成功！');
      
      // 密码登录后需要额外处理 Session（因为 Supabase 默认不支持手机号+密码）
      // 这里使用 signInWithOtp 的变通方案，或者直接导航到首页
      
      // 方案: 后端返回用户信息后，前端通过其他方式建立 session
      // 简单起见，这里直接导航到首页，后续可以优化
      navigation.replace('Home');

    } catch (err: any) {
      console.error('[Login] 密码登录失败:', err.message);
      setErrorMsg(err.message || '密码登录失败');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 渲染函数
  // ============================================================

  // 错误提示
  const renderError = () => {
    if (!errorMsg) return null;
    
    return (
      <View style={styles.errorBanner}>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity onPress={() => setErrorMsg('')}>
          <Text style={styles.errorDismiss}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Tab 切换器
  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'OTP' && styles.tabActive]}
        onPress={() => { setActiveTab('OTP'); setErrorMsg(''); }}
      >
        <Text style={[styles.tabText, activeTab === 'OTP' && styles.tabTextActive]}>
          验证码登录
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'PASSWORD' && styles.tabActive]}
        onPress={() => { setActiveTab('PASSWORD'); setErrorMsg(''); }}
      >
        <Text style={[styles.tabText, activeTab === 'PASSWORD' && styles.tabTextActive]}>
          密码登录
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Tab1: 验证码登录表单
  const renderOtpLoginForm = () => (
    <>
      {/* 手机号 */}
      <Text style={styles.label}>手机号</Text>
      <TextInput
        style={styles.input}
        placeholder="+8613800138000"
        placeholderTextColor="#999"
        value={phone}
        onChangeText={(text) => {
          const cleaned = text.replace(/[^0-9+]/g, '');
          setPhone(cleaned);
        }}
        keyboardType="phone-pad"
        autoFocus
        editable={!loading}
      />

      {/* 验证码 */}
      <View style={styles.otpRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>验证码</Text>
          <TextInput
            style={[styles.input, styles.otpInput]}
            placeholder="000000"
            placeholderTextColor="#999"
            value={otp}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '');
              if (cleaned.length <= 6) setOtp(cleaned);
            }}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
          />
        </View>
        
        <TouchableOpacity
          style={[
            styles.sendCodeButton,
            countdown > 0 && styles.sendCodeButtonDisabled,
          ]}
          onPress={handleSendOtp}
          disabled={countdown > 0 || loading}
        >
          {loading && !otp ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendCodeButtonText}>
              {countdown > 0 ? `${countdown}s` : '获取验证码'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* 登录按钮 */}
      <TouchableOpacity
        style={[styles.loginButton, loading && styles.buttonDisabled]}
        onPress={handleVerifyAndLogin}
        disabled={loading}
      >
        {loading && otp ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginButtonText}>登录</Text>
        )}
      </TouchableOpacity>

      {/* 忘记密码/设置密码提示 */}
      <TouchableOpacity 
        style={styles.forgotPasswordLink}
        onPress={() => navigation.navigate('Register', { phone })}
      >
        <Text style={styles.forgotPasswordText}>
          还没设置密码？去注册 →
        </Text>
      </TouchableOpacity>
    </>
  );

  // Tab2: 密码登录表单
  const renderPasswordLoginForm = () => (
    <>
      {/* 手机号 */}
      <Text style={styles.label}>手机号</Text>
      <TextInput
        style={styles.input}
        placeholder="+8613800138000"
        placeholderTextColor="#999"
        value={phone}
        onChangeText={(text) => {
          const cleaned = text.replace(/[^0-9+]/g, '');
          setPhone(cleaned);
        }}
        keyboardType="phone-pad"
        autoFocus
        editable={!loading}
      />

      {/* 密码 */}
      <Text style={styles.label}>密码</Text>
      <TextInput
        style={styles.input}
        placeholder="请输入登录密码"
        placeholderTextColor="#999"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
        onSubmitEditing={handlePasswordLogin}
      />

      {/* 登录按钮 */}
      <TouchableOpacity
        style={[styles.loginButton, loading && styles.buttonDisabled]}
        onPress={handlePasswordLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginButtonText}>登录</Text>
        )}
      </TouchableOpacity>

      {/* 设置密码提示 */}
      <TouchableOpacity 
        style={styles.forgotPasswordLink}
        onPress={() => navigation.navigate('Register', { phone })}
      >
        <Text style={styles.forgotPasswordText}>
          还没有账号？立即注册 →
        </Text>
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
            {/* 标题 */}
            <Text style={styles.title}>🍽️ 食刻校园</Text>
            <Text style={styles.subtitle}>欢迎回来，请登录您的账号</Text>

            {/* 错误提示 */}
            {renderError()}

            {/* Tab 切换 */}
            {renderTabs()}

            {/* 表单内容 */}
            {activeTab === 'OTP' ? renderOtpLoginForm() : renderPasswordLoginForm()}
          </View>

          {/* 底部版权 */}
          <Text style={styles.copyright}>
            © 2026 食刻校园 · 让每一餐都有温度
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================
// 样式
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 30,
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    width: '100%',
    maxWidth: 340,
  },

  // 标题
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
  },

  // Tab 切换
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 3,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#e94560',
    fontWeight: '600',
  },

  // 表单
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 11,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
    marginBottom: 13,
  },
  otpRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  otpInput: {
    flex: 1,
    marginRight: 10,
    marginBottom: 0,
    fontSize: 18,
    letterSpacing: 4,
    textAlign: 'center',
  },

  // 按钮
  loginButton: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  sendCodeButton: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  sendCodeButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendCodeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // 错误提示
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    flex: 1,
  },
  errorDismiss: {
    fontSize: 14,
    color: '#dc2626',
    marginLeft: 6,
    fontWeight: '700',
  },

  // 链接
  forgotPasswordLink: {
    alignItems: 'center',
    padding: 8,
    marginTop: 2,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: '#e94560',
    fontWeight: '500',
  },

  // 版权
  copyright: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 11,
    marginTop: 20,
  },
});
