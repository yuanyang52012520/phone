/**
 * 食刻校园 App - 注册页面
 *
 * ⚠️ 严格注册流程（4步，禁止跳过）:
 *   ① 输入手机号 → 发送OTP
 *   ② 验证手机号 → 创建基础数据 (init-user)
 *   ③ 设置密码   → (导航到 SetPasswordScreen)
 *   ④ 完善资料   → (导航到 EditProfileScreen) → 首页
 *
 * 关键规则:
 * - 验证码验证成功不能直接进入首页
 * - 必须完成资料初始化（initUser）
 * - 必须设置密码
 * - 必须完善资料（至少填写昵称）
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

type RegisterStep = 'INPUT_PHONE' | 'VERIFY_OTP' | 'INITIALIZING' | 'READY_FOR_NEXT';

interface RegisterScreenProps {
  navigation: NativeStackNavigationProp<any>;
  route?: {
    params?: {
      phone?: string;
    };
  };
}

// 手机号格式化工具
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
// 主组件
// ============================================================

export default function RegisterScreen({ navigation, route }: RegisterScreenProps) {
  const { loginWithOtp, verifyOtp, initNewUser } = useAuth();

  // 初始手机号（从登录页传入）
  const initialPhone = route?.params?.phone || '';

  // 当前步骤
  const [step, setStep] = useState<RegisterStep>('INPUT_PHONE');

  // 表单状态
  const [phone, setPhone] = useState(initialPhone);
  const [otp, setOtp] = useState('');

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

  // 清理
  React.useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearTimeout(countdownRef.current);
      }
    };
  }, []);

  // ============================================================
  // 步骤1: 发送验证码
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
      console.log('[Register] 发送验证码:', cleanPhone);

      // 调用 Supabase Auth signInWithOtp
      const result = await loginWithOtp(cleanPhone);

      if (result.error) {
        throw new Error(result.error.message || '发送验证码失败');
      }

      console.log('[Register] ✅ 验证码发送成功');
      alert('✅ 验证码请求已发送！\n\n请查看后端终端 (pnpm dev:server)\n是否显示 [SMS HOOK] 日志\n\n如果没有日志 → Supabase 未调用 Hook');
      setCountdown(60);
      setStep('VERIFY_OTP');

    } catch (err: any) {
      console.error('[Register] 发送验证码失败:', err.message);
      setErrorMsg(err.message || '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 步骤2: 验证 OTP 并初始化用户
  // ============================================================
  const handleVerifyAndInit = async () => {
    const code = otp.trim();

    if (!code || code.length < 4) {
      setErrorMsg('请输入完整的验证码');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const cleanPhone = normalizePhone(phone);
      console.log('[Register] 验证 OTP:', code);

      // ── 2a. 验证 OTP ──
      const { data, error } = await verifyOtp(cleanPhone, code);

      if (error) {
        throw new Error(error.message === 'Invalid OTP' ? '验证码错误或已过期' : error.message);
      }

      console.log('[Register] ✅ OTP 验证成功');

      // 获取 auth_user_id
      const authUserId = data.user?.id || data.session?.user?.id;

      if (!authUserId) {
        throw new Error('获取用户ID失败');
      }

      console.log('[Register] auth_user_id:', authUserId);

      // ── 2b. 初始化新用户（创建基础 profiles 数据）──
      // ⚠️ 这一步必须执行，创建系统字段（level=1, points=0等）
      console.log('[Register] 初始化新用户...');

      setStep('INITIALIZING'); // 显示加载状态

      const initResult = await initNewUser(authUserId, cleanPhone);

      if (!initResult.success) {
        throw new Error(initResult.error || '初始化用户失败');
      }

      console.log('[Register] ✅ 用户初始化完成！');
      setStep('READY_FOR_NEXT');

      // ── 2c. 自动跳转到"设置密码"页面 ──
      setTimeout(() => {
        console.log('[Register] → 导航到 SetPassword 页面...');
        navigation.replace('SetPassword', {
          phone: cleanPhone,
          userId: authUserId,
        });
      }, 500);

    } catch (err: any) {
      console.error('[Register] 注册失败:', err.message);
      setErrorMsg(err.message || '注册失败');
      // 失败时返回验证步骤
      if (step === 'INITIALIZING') {
        setStep('VERIFY_OTP');
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 重发验证码
  // ============================================================
  const handleResendCode = async () => {
    if (countdown > 0) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const cleanPhone = normalizePhone(phone);
      console.log('[Register] 重发验证码:', cleanPhone);

      const { error } = await loginWithOtp(cleanPhone);

      if (error) {
        throw new Error(error.message || '重发失败');
      }

      console.log('[Register] ✅ 验证码重发成功');
      setCountdown(60);
      setOtp('');

    } catch (err: any) {
      setErrorMsg(err.message || '重发失败');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 返回上一步
  // ============================================================
  const handleGoBack = () => {
    if (step === 'VERIFY_OTP' || step === 'INITIALIZING') {
      setStep('INPUT_PHONE');
      setOtp('');
    } else {
      navigation.goBack();
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

  // 步骤指示器（4步完整流程）
  const renderSteps = () => (
    <View style={styles.stepContainer}>
      {/* Step 1: 输入手机号 */}
      <View style={[styles.stepDot, step !== 'INPUT_PHONE' && styles.stepDotActive]}>
        {(step === 'VERIFY_OTP' || step === 'INITIALIZING' || step === 'READY_FOR_NEXT') && (
          <Text style={styles.stepCheck}>✓</Text>
        )}
      </View>
      <View style={[styles.stepLine, (step === 'INITIALIZING' || step === 'READY_FOR_NEXT') && styles.stepLineActive]} />

      {/* Step 2: 验证手机号 */}
      <View style={[
        styles.stepDot,
        (step === 'VERIFY_OTP' || step === 'INITIALIZING') && styles.stepDotCurrent,
        (step === 'READY_FOR_NEXT') && styles.stepDotActive,
      ]}>
        {(step === 'INITIALIZING' || step === 'READY_FOR_NEXT') && (
          <Text style={styles.stepCheck}>✓</Text>
        )}
      </View>
      <View style={[styles.stepLine, step === 'READY_FOR_NEXT' && styles.stepLineActive]} />

      {/* Step 3: 设置密码 */}
      <View style={[
        styles.stepDot,
        step === 'READY_FOR_NEXT' && styles.stepDotSuccess,
      ]}>
        {step === 'READY_FOR_NEXT' && <Text style={styles.stepCheck}>→</Text>}
      </View>
      <View style={[styles.stepLine]} />

      {/* Step 4: 完善资料 */}
      <View style={[
        styles.stepDot,
        step === 'READY_FOR_NEXT' && styles.stepDotSuccess,
      ]}>
        {step === 'READY_FOR_NEXT' && <Text style={styles.stepCheck}>→</Text>}
      </View>
    </View>
  );

  // 步骤标签
  const renderStepLabels = () => (
    <View style={styles.stepLabels}>
      <Text style={[styles.stepLabel, step !== 'INPUT_PHONE' && styles.stepLabelActive]}>
        输入手机号
      </Text>
      <Text style={[
        styles.stepLabel,
        (step === 'VERIFY_OTP' || step === 'INITIALIZING' || step === 'READY_FOR_NEXT') && styles.stepLabelActive,
      ]}>
        验证手机号
      </Text>
      <Text style={[styles.stepLabel, step === 'READY_FOR_NEXT' && styles.stepLabelActive]}>
        设置密码
      </Text>
      <Text style={[styles.stepLabel, step === 'READY_FOR_NEXT' && styles.stepLabelActive]}>
        完善资料
      </Text>
    </View>
  );

  // 步骤1: 输入手机号
  const renderInputPhone = () => (
    <>
      {/* 注册提示 */}
      <View style={styles.registerBanner}>
        <Text style={styles.registerBannerTitle}>📝 新用户注册</Text>
        <Text style={styles.registerBannerSub}>
          填写手机号 → 验证手机号 → 设置密码 → 完善资料
        </Text>
      </View>

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

      {/* 发送验证码按钮 */}
      <TouchableOpacity
        style={[styles.registerButton, loading && styles.buttonDisabled]}
        onPress={handleSendOtp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.registerButtonText}>获取验证码</Text>
        )}
      </TouchableOpacity>

      {/* 已有账号 */}
      <TouchableOpacity
        style={styles.loginLink}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.loginLinkText}>
          已有账号？返回登录 ←
        </Text>
      </TouchableOpacity>
    </>
  );

  // 步骤2: 验证OTP
  const renderVerifyOtp = () => (
    <>
      {/* 提示信息 */}
      <View style={styles.verifyBanner}>
        <Text style={styles.verifyText}>🔐 请输入发送至以下手机的验证码：</Text>
        <Text style={styles.phoneDisplay}>{phone}</Text>
      </View>

      {/* 验证码输入 */}
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
          style={[
            styles.resendButton,
            countdown > 0 && styles.resendButtonDisabled,
          ]}
          onPress={handleResendCode}
          disabled={countdown > 0 || loading}
        >
          <Text style={styles.resendButtonText}>
            {countdown > 0 ? `${countdown}s后重发` : '重新发送'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 注册按钮 */}
      <TouchableOpacity
        style={[styles.registerButton, loading && styles.buttonDisabled]}
        onPress={handleVerifyAndInit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.registerButtonText}>✅ 验证并继续</Text>
        )}
      </TouchableOpacity>

      {/* 返回按钮 */}
      <TouchableOpacity
        style={styles.backLink}
        onPress={handleGoBack}
        disabled={loading}
      >
        <Text style={styles.backLinkText}>← 更换手机号</Text>
      </TouchableOpacity>
    </>
  );

  // 步骤3: 初始化中
  const renderInitializing = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#e94560" />
      <Text style={styles.loadingText}>正在创建账号...</Text>
      <Text style={styles.loadingSubtext}>正在初始化用户数据</Text>
    </View>
  );

  // 步骤4: 准备就绪（短暂显示后自动跳转）
  const renderReadyForNext = () => (
    <View style={styles.successContainer}>
      <Text style={styles.successEmoji}>✅</Text>
      <Text style={styles.successTitle}>验证成功！</Text>
      <Text style={styles.successText}>正在进入下一步...</Text>
    </View>
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
            <Text style={styles.title}>✨ 创建新账号</Text>
            <Text style={styles.subtitle}>注册食刻校园，开启美食之旅</Text>

            {/* 错误提示 */}
            {renderError()}

            {/* 步骤指示器（非加载状态显示） */}
            {step !== 'INITIALIZING' && step !== 'READY_FOR_NEXT' && renderSteps()}
            {step !== 'INITIALIZING' && step !== 'READY_FOR_NEXT' && renderStepLabels()}

            {/* 表单内容 */}
            {step === 'INPUT_PHONE' && renderInputPhone()}
            {step === 'VERIFY_OTP' && renderVerifyOtp()}
            {step === 'INITIALIZING' && renderInitializing()}
            {step === 'READY_FOR_NEXT' && renderReadyForNext()}
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

  // 步骤指示器
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: '#e94560',
  },
  stepDotCurrent: {
    backgroundColor: '#e94560',
    borderWidth: 2,
    borderColor: '#ffb3ba',
  },
  stepDotSuccess: {
    backgroundColor: '#16a34a',
  },
  stepCheck: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  stepLine: {
    width: 30,
    height: 2,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: '#e94560',
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 18,
    gap: 4,
  },
  stepLabel: {
    fontSize: 9,
    color: '#999',
  },
  stepLabelActive: {
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
  registerButton: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  resendButton: {
    borderWidth: 1,
    borderColor: '#e94560',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendButtonDisabled: {
    borderColor: '#ccc',
  },
  resendButtonText: {
    color: '#e94560',
    fontSize: 12,
    fontWeight: '600',
  },

  // Banner
  registerBanner: {
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#ffd6d6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  registerBannerTitle: {
    fontSize: 13,
    color: '#e94560',
    fontWeight: '600',
    marginBottom: 2,
  },
  registerBannerSub: {
    fontSize: 11,
    color: '#f5828a',
  },
  verifyBanner: {
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#ffd6d6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  verifyText: {
    fontSize: 12,
    color: '#e94560',
    marginBottom: 4,
  },
  phoneDisplay: {
    fontSize: 16,
    color: '#e94560',
    fontWeight: '700',
  },

  // 链接
  loginLink: {
    alignItems: 'center',
    padding: 8,
  },
  loginLinkText: {
    fontSize: 13,
    color: '#888',
  },
  backLink: {
    alignItems: 'center',
    padding: 6,
    marginTop: 2,
  },
  backLinkText: {
    fontSize: 13,
    color: '#e94560',
    fontWeight: '500',
  },

  // 加载状态
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },

  // 成功状态
  successContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  successEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e94560',
    marginBottom: 6,
  },
  successText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  successSubtext: {
    fontSize: 12,
    color: '#999',
  },

  // 版权
  copyright: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: 11,
    marginTop: 20,
  },
});
