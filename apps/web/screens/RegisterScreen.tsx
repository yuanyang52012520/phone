/**
 * 食刻校园 App - 注册页面（新用户专用）
 *
 * 流程:
 * Step 1: 输入手机号 → 发送验证码 → 验证 OTP
 * Step 2: 验证成功后检测为新用户 → 初始化用户数据 (initNewUser)
 * Step 3: 跳转 SetPassword 页面设置密码
 * Step 4: 跳转 EditProfile 页面完善资料
 * Step 5: 注册完成，进入首页
 *
 * ⚠️ 此页面仅用于新用户注册！
 *    老用户请使用登录页面 (LoginScreen)
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

type RegisterStep = 'INPUT_PHONE' | 'VERIFY_OTP' | 'INIT_USER';

interface RegisterScreenProps {
  navigation: NativeStackNavigationProp<any>;
  route?: {
    params?: { phone?: string };
  };
};

// 手机号格式化
const normalizePhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+86${digits}`;
  if (digits.startsWith('86')) return `+${digits}`;
  return value.startsWith('+') ? value : `+${digits}`;
};

// ============================================================
// 主组件
// ============================================================

export default function RegisterScreen({ navigation, route }: RegisterScreenProps) {
  const { loginWithOtp, verifyOtp, initNewUser } = useAuth();

  const initialPhone = route?.params?.phone || '';

  // 步骤状态
  const [step, setStep] = useState<RegisterStep>('INPUT_PHONE');

  // 表单
  const [phone, setPhone] = useState(initialPhone);
  const [otp, setOtp] = useState('');

  // UI
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // 倒计时 Effect
  React.useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => { if (countdownRef.current) clearTimeout(countdownRef.current); };
  }, [countdown]);

  // ════════════════════════════════════════
  // Step 1: 发送验证码
  // ════════════════════════════════════════
  const handleSendOtp = async () => {
    const rawPhone = phone.trim();
    if (!rawPhone) { setErrorMsg('请输入手机号'); return; }

    const cleanPhone = normalizePhone(rawPhone);
    setPhone(cleanPhone);
    setLoading(true);
    setErrorMsg('');

    try {
      console.log('[Register] 📤 发送验证码:', cleanPhone);

      const { error } = await loginWithOtp(cleanPhone);
      if (error) throw error;

      console.log('[Register] ✅ 验证码已发送');
      setCountdown(60);
      setStep('VERIFY_OTP');

    } catch (err: any) {
      setErrorMsg(err.message || '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  // ════════════════════════════════════════
  // Step 2: 验证 OTP + 初始化新用户
  // ════════════════════════════════════════
  const handleVerifyOtp = async () => {
    const code = otp.trim();
    if (!code || code.length < 4) { setErrorMsg('请输入完整的验证码'); return; }

    setLoading(true);
    setErrorMsg('');

    try {
      const cleanPhone = normalizePhone(phone);
      console.log('[Register] 🔐 验证 OTP:', code);

      // 验证 OTP
      const { error, data, isNewUser } = await verifyOtp(cleanPhone, code);
      if (error) throw error;

      // 获取 authUserId
      const authUserId = data.user?.id || data.session?.user?.id;
      if (!authUserId) throw new Error('获取用户ID失败');

      console.log('[Register] auth_user_id:', authUserId);
      console.log(`[Register] 👤 isNewUser: ${isNewUser}`);

      if (!isNewUser) {
        // ⚠️ 这个手机号已经注册过了！
        setErrorMsg('该手机号已注册，请使用登录功能');
        setTimeout(() => navigation.goBack(), 2000);
        return;
      }

      // ✅ 确认是新用户 → 初始化（创建 profiles + phone auth_account）
      setStep('INIT_USER');
      console.log('[Register] 📝 正在初始化新用户...');

      const initResult = await initNewUser(authUserId, cleanPhone);

      if (!initResult.success) {
        throw new Error(initResult.error || '初始化失败');
      }

      console.log('[Register] ✅ 新用户初始化完成！');
      console.log('[Register] → 跳转到设置密码页面');

      // 进入设置密码流程
      navigation.replace('SetPassword', { phone: cleanPhone, userId: authUserId });

    } catch (err: any) {
      console.error('[Register] ❌ 失败:', err.message);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 重发验证码
  const handleResend = async () => {
    if (countdown > 0) return;
    setLoading(true);
    setErrorMsg('');

    try {
      const cleanPhone = normalizePhone(phone);
      const { error } = await loginWithOtp(cleanPhone);
      if (error) throw error;
      setCountdown(60);
      setOtp('');
    } catch (err: any) {
      setErrorMsg(err.message);
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

  // 步骤指示器
  const renderSteps = () => (
    <View style={styles.stepContainer}>
      {[1, 2, 3].map((s, i) => (
        <React.Fragment key={s}>
          <View style={[
            styles.stepDot,
            (step === 'VERIFY_OTP' && s <= 2 ||
             step === 'INIT_USER') && styles.stepDotActive,
            s < getStepNumber() && styles.stepDotDone,
          ]}>
            {(s < getStepNumber()) ? (
              <Text style={styles.stepCheck}>✓</Text>
            ) : (
              <Text style={[styles.stepNum, (step === 'VERIFY_OTP' && s === 2 || step === 'INPUT_PHONE' && s === 1) && styles.stepNumActive]}>{s}</Text>
            )}
          </View>
          {i < 2 && (
            <View style={[styles.stepLine, (s < getStepNumber()) && styles.stepLineActive]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  const getStepNumber = (): number => {
    switch (step) {
      case 'INPUT_PHONE': return 1;
      case 'VERIFY_OTP': return 2;
      case 'INIT_USER': return 3;
      default: return 1;
    }
  };

  const renderStepLabels = () => (
    <View style={styles.stepLabels}>
      <Text style={[styles.stepLabel, step !== 'INPUT_PHONE' && styles.labelActive]}>手机验证</Text>
      <Text style={[styles.stepLabel, (step === 'VERIFY_OTP' || step === 'INIT_USER') && styles.labelActive]}>验证码</Text>
      <Text style={[styles.stepLabel, step === 'INIT_USER' && styles.labelActive]}>初始化</Text>
    </View>
  );

  // Step 1: 输入手机号
  const renderInputPhone = () => (
    <>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>📝 创建账号</Text>
        <Text style={styles.bannerSub}>填写手机号 → 验证 → 完成注册</Text>
      </View>

      <Text style={styles.label}>手机号</Text>
      <TextInput
        style={styles.input}
        placeholder="+8613800138000"
        placeholderTextColor="#999"
        value={phone}
        onChangeText={(text) => setPhone(text.replace(/[^0-9+]/g, ''))}
        keyboardType="phone-pad"
        autoFocus
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.btnDisabled]}
        onPress={handleSendOtp}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text styles={styles.btnText}>获取验证码</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>已有账号？返回登录 ←</Text>
      </TouchableOpacity>
    </>
  );

  // Step 2: 输入验证码
  const renderVerifyOtp = () => (
    <>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>🔐 输入验证码</Text>
        <Text style={styles.bannerSub}>已发送至 {phone}</Text>
      </View>

      <View style={styles.otpRow}>
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
          autoFocus
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.resendBtn, countdown > 0 && styles.resendDisabled]}
          onPress={handleResend}
          disabled={countdown > 0 || loading}
        >
          <Text style={styles.resendText}>{countdown > 0 ? `${countdown}s` : '重新发送'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.btnDisabled]}
        onPress={handleVerifyOtp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>✅ 验证并创建账号</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.link} onPress={() => { setStep('INPUT_PHONE'); setOtp(''); }}>
        <Text style={styles.linkText}>← 更换手机号</Text>
      </TouchableOpacity>
    </>
  );

  // Step 3: 初始化中
  const renderInitializing = () => (
    <View style={styles.initContainer}>
      <ActivityIndicator size="large" color="#e94560" />
      <Text style={styles.initTitle}>正在创建您的账号...</Text>
      <Text style={styles.initSub}>请稍候，正在初始化用户数据</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.title}>✨ 新用户注册</Text>
            <Text style={styles.subtitle}>加入食刻校园，开启美食之旅</Text>

            {renderError()}
            {step !== 'INIT_USER' && renderSteps()}
            {step !== 'INIT_USER' && renderStepLabels()}

            {step === 'INPUT_PHONE' && renderInputPhone()}
            {step === 'VERIFY_OTP' && renderVerifyOtp()}
            {step === 'INIT_USER' && renderInitializing()}
          </View>

          <Text style={styles.copyright}>© 2026 食刻校园</Text>
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

  title: { fontSize: 22, fontWeight: '700', color: '#1a1a2e', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 20 },

  // 步骤
  stepContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: '#e94560' },
  stepDotActive: { borderWidth: 2, borderColor: '#ffb3ba', backgroundColor: '#e94560' },
  stepNum: { fontSize: 12, fontWeight: '600', color: '#888' },
  stepNumActive: { color: '#fff' },
  stepCheck: { fontSize: 12, fontWeight: '700', color: '#fff' },
  stepLine: { width: 36, height: 2, backgroundColor: '#e0e0e0', marginHorizontal: 6 },
  stepLineActive: { backgroundColor: '#e94560' },
  stepLabels: { flexDirection: 'row', justifyContent: 'center', marginBottom: 18, gap: 12 },
  stepLabel: { fontSize: 10, color: '#999' },
  labelActive: { color: '#e94560', fontWeight: '600' },

  // 错误
  errorBanner: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 6, padding: 10, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  errorText: { fontSize: 12, color: '#dc2626', flex: 1 },
  errorDismiss: { fontSize: 14, color: '#dc2626', marginLeft: 6, fontWeight: '700' },

  // Banner
  banner: {
    backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#ffd6d6',
    borderRadius: 8, padding: 14, marginBottom: 16, alignItems: 'center',
  },
  bannerTitle: { fontSize: 15, color: '#e94560', fontWeight: '600', marginBottom: 4 },
  bannerSub: { fontSize: 12, color: '#f5828a' },

  // 表单
  label: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 5 },
  input: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 8,
    padding: 12, fontSize: 15, color: '#333',
    backgroundColor: '#fafafa', marginBottom: 14,
  },
  otpRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 16 },
  otpInput: { flex: 1, marginRight: 10, marginBottom: 0, fontSize: 20, letterSpacing: 6, textAlign: 'center' },

  // 按钮
  button: { backgroundColor: '#e94560', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  resendBtn: {
    borderWidth: 1, borderColor: '#e94560', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, height: 48, alignItems: 'center', justifyContent: 'center',
  },
  resendDisabled: { borderColor: '#ccc' },
  resendText: { color: '#e94560', fontSize: 13, fontWeight: '600' },

  link: { alignItems: 'center', padding: 10, marginTop: 4 },
  linkText: { fontSize: 13, color: '#888' },

  // 初始化中
  initContainer: { alignItems: 'center', paddingVertical: 40 },
  initTitle: { fontSize: 16, color: '#333', marginTop: 16, fontWeight: '600' },
  initSub: { fontSize: 13, color: '#888', marginTop: 6 },

  copyright: { textAlign: 'center', color: '#bbb', fontSize: 11, marginTop: 20 },
});
