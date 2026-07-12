/**
 * 食刻校园 App - 设置密码页面（注册流程 Step 2）
 *
 * 流程:
 * 注册验证码成功 → 创建基础用户 → 进入此页设置密码 → 完善资料
 */

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

import { useAuth } from '../contexts/AuthContext';
import type { NativeStackNavigationProp } from '@react-navigation/native';

type SetPasswordScreenProps = {
  navigation: NativeStackNavigationProp<any>;
  route?: {
    params?: {
      phone?: string;
      userId?: string;
    };
  };
};

export default function SetPasswordScreen({ navigation, route }: SetPasswordScreenProps) {
  const { setPassword, user } = useAuth();

  const phone = route?.params?.phone || '';
  const authUserId = route?.params?.userId || user?.id || '';

  const [password, setPasswordInput] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 显示/隐藏密码
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSetPassword = async () => {
    setErrorMsg('');

    // 校验
    if (!password || password.length < 6) {
      setErrorMsg('密码长度至少6位');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      console.log('[SetPassword] 设置密码...');

      const result = await setPassword(authUserId, phone, password);

      if (!result.success) {
        throw new Error(result.error || '设置密码失败');
      }

      console.log('[SetPassword] ✅ 密码设置成功，跳转完善资料');

      // 跳转到完善资料页面
      navigation.replace('EditProfile', { phone, userId: authUserId });

    } catch (err: any) {
      console.error('[SetPassword] 失败:', err.message);
      setErrorMsg(err.message || '设置密码失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            {/* 标题 */}
            <Text style={styles.title}>🔒 设置密码</Text>
            <Text style={styles.subtitle}>设置登录密码，保护账号安全</Text>

            {/* 进度指示 */}
            <View style={styles.progressRow}>
              <View style={[styles.progressDot, styles.progressDone]}>
                <Text style={styles.progressCheck}>✓</Text>
              </View>
              <View style={[styles.progressLine, styles.progressLineActive]} />
              <View style={[styles.progressDot, styles.progressCurrent]}>
                <Text style={styles.progressNum}>2</Text>
              </View>
              <View style={styles.progressLine} />
              <View style={[styles.progressDot, styles.progressPending]}>
                <Text style={styles.progressNum}>3</Text>
              </View>
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabelActive}>手机验证</Text>
              <Text style={styles.progressLabelActive}>设置密码</Text>
              <Text style={styles.progressLabel}>完善资料</Text>
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

            {/* 密码 */}
            <Text style={styles.label}>登录密码</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.inputWithIcon}
                placeholder="请输入6位以上密码"
                placeholderTextColor="#999"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPasswordInput}
                editable={!loading}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Text style={styles.eyeText}>{showPassword ? '隐藏' : '显示'}</Text>
              </TouchableOpacity>
            </View>

            {/* 确认密码 */}
            <Text style={styles.label}>确认密码</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.inputWithIcon}
                placeholder="再次输入密码"
                placeholderTextColor="#999"
                secureTextEntry={!showConfirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                <Text style={styles.eyeText}>{showConfirm ? '隐藏' : '显示'}</Text>
              </TouchableOpacity>
            </View>

            {/* 提交按钮 */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>下一步：完善资料</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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

  // 进度指示器
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDone: {
    backgroundColor: '#e94560',
  },
  progressCurrent: {
    backgroundColor: '#e94560',
    borderWidth: 2,
    borderColor: '#ffb3ba',
  },
  progressPending: {
    backgroundColor: '#e0e0e0',
  },
  progressCheck: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  progressNum: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  progressLine: {
    width: 40,
    height: 2,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 6,
  },
  progressLineActive: {
    backgroundColor: '#e94560',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 18,
    gap: 8,
  },
  progressLabel: {
    fontSize: 10,
    color: '#999',
  },
  progressLabelActive: {
    color: '#e94560',
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

  // 表单
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 5,
  },
  inputWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  inputWithIcon: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 11,
    paddingRight: 60,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -12,
  },
  eyeText: {
    color: '#e94560',
    fontSize: 12,
    fontWeight: '600',
  },

  // 按钮
  submitButton: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
