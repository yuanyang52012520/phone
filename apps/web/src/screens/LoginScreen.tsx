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
} from 'react-native';
import { supabase } from '../services/supabase';

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  /** 第一步：通过 Supabase Auth 发送 OTP 验证码 */
  const handleSendCode = async () => {
    const cleanPhone = phone.trim();
    setErrorMsg('');

    if (!cleanPhone) {
      setErrorMsg('请输入手机号');
      return;
    }

    console.log('[Login] 通过 Supabase Auth 发送验证码到:', cleanPhone);
    setLoading(true);

    try {
      const { error, data } = await supabase.auth.signInWithOtp({
        phone: cleanPhone,
      });

      console.log('[Login] signInWithOtp response:', { error, data });

      if (error) {
        const errMsg = error.message || JSON.stringify(error) || '未知错误';
        console.error('[Login] Supabase signInWithOtp 错误:', error);
        setErrorMsg(`发送失败: ${errMsg}`);
        return;
      }

      console.log('[Login] 验证码发送成功（由 Supabase Auth 生成）');
      setStep('otp');
      setOtp('');
    } catch (err: any) {
      console.error('[Login] 发送异常:', err);
      setErrorMsg(`网络错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /** 第二步：通过 Supabase Auth 验证 OTP */
  const handleVerifyOtp = async () => {
    const code = otp.trim();
    setErrorMsg('');

    if (!code || code.length < 4) {
      setErrorMsg('请输入完整的验证码');
      return;
    }

    console.log('[Login] 通过 Supabase Auth 验证 OTP:', code);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: code,
        type: 'sms',
      });

      if (error) {
        console.error('[Login] Supabase verifyOtp 错误:', error.message);
        setErrorMsg(`验证失败: ${error.message}`);
        return;
      }

      console.log('[Login] 验证成功，用户:', data.user?.id);
      navigation.replace('Home');
    } catch (err: any) {
      console.error('[Login] 验证异常:', err);
      setErrorMsg(`网络错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>食客系统</Text>
        <Text style={styles.subtitle}>
          {step === 'phone' ? '手机号登录' : '输入验证码'}
        </Text>

        <View style={styles.steps}>
          <View style={[styles.stepDot, step === 'phone' && styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, step === 'otp' && styles.stepDotActive]} />
        </View>
        <View style={styles.stepLabels}>
          <Text style={styles.stepLabel}>输入手机号</Text>
          <Text style={styles.stepLabel}>验证码确认</Text>
        </View>

        {/* 错误提示 */}
        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={() => setErrorMsg('')}>
              <Text style={styles.errorDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* 手机号输入 */}
        {step === 'phone' && (
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

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>发送验证码</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* OTP 输入 */}
        {step === 'otp' && (
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
                🔐 Supabase Auth 验证码
              </Text>
              <Text style={styles.devBannerSub}>
                验证码已由 Supabase 发送到您的手机
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
                setStep('phone');
                setOtp('');
                setErrorMsg('');
              }}
              disabled={loading}
            >
              <Text style={styles.linkText}>← 更换手机号</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
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
});
