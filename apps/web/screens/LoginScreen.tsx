/**
 * 食刻校园 App - 登录页面（老用户专用）
 *
 * 支持两种登录方式:
 * 1. 手机号 + 验证码 (OTP)
 * 2. 手机号 + 密码 (Password)
 *
 * ⚠️ 关键逻辑：
 *    - 验证成功后检查是否为新用户（isNewUser）
 *    - 老用户 → 直接进入首页
 *    - 新用户 → 提示去注册，不自动创建
 *
 * 禁止：
 *    ❌ 未注册手机号自动创建用户
 *    ❌ 老用户进入注册流程
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
import type { NativeStackNavigationProp } from '@react-navigation/native';

// ============================================================
// 类型定义
// ============================================================

type LoginTab = 'otp' | 'password';

interface LoginScreenProps {
  navigation: NativeStackNavigationProp<any>;
}

const normalizePhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+86${digits}`;
  if (digits.startsWith('86')) return `+${digits}`;
  return value.startsWith('+') ? value : `+${digits}`;
};

// ============================================================
// 主组件
// ============================================================

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { loginWithOtp, verifyOtp, loginWithPassword } = useAuth();

  // Tab 切换
  const [activeTab, setActiveTab] = useState<LoginTab>('otp');

  // 表单
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');

  // UI
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // 倒计时 Effect
  React.useEffect(() => {
    if (countdown > 0) countdownRef.current = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  }, [countdown]);

  // ════════════════════════════════════════
  // 验证码登录流程
  // ════════════════════════════════════════

  const handleSendOtp = async () => {
    const rawPhone = phone.trim();
    if (!rawPhone) { setErrorMsg('请输入手机号'); return; }

    const cleanPhone = normalizePhone(rawPhone);
    setPhone(cleanPhone);
    setLoading(true);
    setErrorMsg('');

    try {
      console.log('[Login] 📤 发送验证码:', cleanPhone);
      const { error } = await loginWithOtp(cleanPhone);
      if (error) throw error;

      setCountdown(60);
    } catch (err: any) {
      setErrorMsg(err.message || '发送失败');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpLogin = async () => {
    const code = otp.trim();
    if (!code || code.length < 4) { setErrorMsg('请输入验证码'); return; }

    setLoading(true);
    setErrorMsg('');

    try {
      const cleanPhone = normalizePhone(phone);
      console.log('[Login] 🔐 验证码登录');

      const { error, data, isNewUser } = await verifyOtp(cleanPhone, code);

      if (error) throw error;

      // ─── 关键判断：新老用户 ───
      if (isNewUser) {
        setErrorMsg('该手机号未注册，请先完成注册');
        setTimeout(() => {
          navigation.navigate('Register', { phone: cleanPhone });
        }, 1500);
        return;
      }

      // ✅ 老用户，直接进首页
      console.log('[Login] ✅ 老用户登录成功 → 进入首页');
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });

    } catch (err: any) {
      setErrorMsg(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════
  // 密码登录流程
  // ════════════════════════════════════════

  const handlePasswordLogin = async () => {
    const rawPhone = phone.trim();
    const pwd = password.trim();

    if (!rawPhone) { setErrorMsg('请输入手机号'); return; }
    if (!pwd) { setErrorMsg('请输入密码'); return; }

    setLoading(true);
    setErrorMsg('');

    try {
      const cleanPhone = normalizePhone(rawPhone);
      console.log('[Login] 🔑 密码登录:', cleanPhone);

      const { error, isNewUser } = await loginWithPassword(cleanPhone, pwd);

      if (error) {
        // 如果是"未注册"错误
        if (isNewUser) {
          setErrorMsg('该手机号未注册，请先完成注册');
          setTimeout(() => navigation.navigate('Register', { phone: cleanPhone }), 1500);
          return;
        }
        throw error;
      }

      // ✅ 老用户密码登录成功
      console.log('[Login] ✅ 密码登录成功 → 进入首页');
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });

    } catch (err: any) {
      setErrorMsg(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════
  // 渲染函数
  // ════════════════════════════════════════

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

  const renderTabs = () => (
    <View style={styles.tabRow}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'otp' && styles.tabActive]}
        onPress={() => { setActiveTab('otp'); setErrorMsg(''); }}
      >
        <Text style={[styles.tabText, activeTab === 'otp' && styles.tabTextActive]}>验证码登录</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'password' && styles.tabActive]}
        onPress={() => { setActiveTab('password'); setErrorMsg(''); }}
      >
        <Text style={[styles.tabText, activeTab === 'password' && styles.tabTextActive]}>密码登录</Text>
      </TouchableOpacity>
    </View>
  );

  // 验证码登录表单
  const renderOtpForm = () => (
    <>
      <Text style={styles.label}>手机号</Text>
      <TextInput
        style={styles.input}
        placeholder="+86xxxxxxxxxxx"
        placeholderTextColor="#999"
        value={phone}
        onChangeText={(text) => setPhone(text.replace(/[^0-9+]/g, ''))}
        keyboardType="phone-pad"
        editable={!loading}
      />

      <View style={styles.otpRow}>
        <TextInput
          style={[styles.input, styles.otpInput]}
          placeholder="输入验证码"
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
        <TouchableOpacity
          style={[styles.sendBtn, countdown > 0 ? styles.sendBtnDisabled : null]}
          onPress={handleSendOtp}
          disabled={countdown > 0 || loading || !phone}
        >
          <Text style={styles.sendBtnText}>{countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.loginBtn, loading && styles.btnDisabled]}
        onPress={handleOtpLogin}
        disabled={loading || !otp}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginBtnText}>登 录</Text>
        )}
      </TouchableOpacity>
    </>
  );

  // 密码登录表单
  const renderPasswordForm = () => (
    <>
      <Text style={styles.label}>手机号</Text>
      <TextInput
        style={styles.input}
        placeholder="+86xxxxxxxxxxx"
        placeholderTextColor="#999"
        value={phone}
        onChangeText={(text) => setPhone(text.replace(/[^0-9+]/g, ''))}
        keyboardType="phone-pad"
        editable={!loading}
        autoCapitalize="none"
      />

      <Text style={styles.label}>密码</Text>
      <TextInput
        style={styles.input}
        placeholder="请输入登录密码"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading}
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[styles.loginBtn, loading && styles.btnDisabled]}
        onPress={handlePasswordLogin}
        disabled={loading || !password}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginBtnText}>登 录</Text>
        )}
      </TouchableOpacity>

      {/* 忘记密码（暂不可用） */}
      <TouchableOpacity style={styles.forgotLink} disabled>
        <Text style={styles.forgotText}>忘记密码？（暂不可用）</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            {/* 标题 */}
            <Text style={styles.title}>🍽️ 食刻校园</Text>
            <Text style={styles.subtitle}>欢迎回来，登录继续美食之旅</Text>

            {renderError()}
            {renderTabs()}

            {/* 表单 */}
            {activeTab === 'otp' ? renderOtpForm() : renderPasswordForm()}
          </View>

          {/* 注册入口 */}
          <View style={styles.registerArea}>
            <Text style={styles.registerHint}>还没有账号？</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register', { phone: normalizePhone(phone) })}
            >
              <Text style={styles.registerLink}>立即注册 →</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.copyright}>© 2026 食刻校园 · 让每一餐都有温度</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================
// 样式
// ============================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 30,
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 3,
    width: '100%', maxWidth: 340,
  },

  title: { fontSize: 24, fontWeight: '700', color: '#1a1a2e', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 22 },

  // Tab 切换
  tabRow: { flexDirection: 'row', marginBottom: 20 },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#e94560' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#888' },
  tabTextActive: { color: '#e94560', fontWeight: '600' },

  // 错误提示
  errorBanner: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 8, padding: 12, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  errorText: { fontSize: 13, color: '#dc2626', flex: 1 },
  errorDismiss: { fontSize: 16, color: '#dc2626', marginLeft: 8, fontWeight: '700' },

  // 表单
  label: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 10,
    padding: 13, fontSize: 15, color: '#333',
    backgroundColor: '#fafafa', marginBottom: 14,
  },
  otpRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 18 },
  otpInput: { flex: 1, marginRight: 12, marginBottom: 0 },
  sendBtn: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e94560',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    height: 48, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { borderColor: '#ccc' },
  sendBtnText: { color: '#e94560', fontSize: 13, fontWeight: '600' },

  // 按钮
  loginBtn: { backgroundColor: '#e94560', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  forgotLink: { alignItems: 'center', marginTop: 14 },
  forgotText: { fontSize: 13, color: '#bbb' },

  // 注册入口
  registerArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  registerHint: { fontSize: 14, color: '#888' },
  registerLink: { fontSize: 14, color: '#e94560', fontWeight: '600', marginLeft: 6 },

  copyright: { textAlign: 'center', color: '#bbb', fontSize: 11, marginTop: 24 },
});
