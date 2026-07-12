/**
 * 食刻校园 App - 完善资料页面（注册流程 Step 4）
 *
 * ⚠️ 这是注册流程的必填步骤，禁止跳过！
 *
 * 流程:
 * 设置密码成功 → 进入此页完善资料 → 提交 → 注册完成进入首页
 *
 * 用户可编辑字段:
 *   - display_name (昵称) ✅ 必填
 *   - username (用户名) ⚪ 可选（设置后不可修改）
 *   - school_id (学校) ⚪ 可选
 *   - campus_id (校区) ⚪ 可选
 *   - bio (简介) ⚪ 可选
 *   - avatar_url (头像) ⚪ 暂不可用
 *
 * 系统字段（禁止修改）:
 *   level, points, extra_data, accept_notifications, created_at, updated_at
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

// ============================================================
// 类型定义
// ============================================================

type EditProfileScreenProps = {
  navigation: NativeStackNavigationProp<any>;
  route?: {
    params?: {
      phone?: string;
      userId?: string;
    };
  };
};

// API 基础地址
const SERVER_URL = 'http://localhost:3001';

// ============================================================
// 主组件
// ============================================================

export default function EditProfileScreen({ navigation, route }: EditProfileScreenProps) {
  const { user, session } = useAuth();

  const phone = route?.params?.phone || '';
  const authUserId = route?.params?.userId || user?.id || '';

  // 表单状态
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [bio, setBio] = useState('');

  // UI状态
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ============================================================
  // 提交资料
  // ============================================================
  const handleSubmit = async () => {
    setErrorMsg('');

    // 必填验证：昵称不能为空
    if (!displayName.trim()) {
      setErrorMsg('请输入昵称');
      return;
    }

    setLoading(true);

    try {
      console.log('[EditProfile] 提交资料...');

      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('登录态已过期，请重新操作');

      // ── 调用新版 API: PUT /api/user/profile ──
      // ⚠️ 这个接口只允许更新用户可编辑字段
      // 系统字段会被后端自动过滤
      console.log('[EditProfile] 调用 PUT /api/user/profile...');

      const response = await fetch(`${SERVER_URL}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          // ✅ 允许更新的字段
          display_name: displayName.trim(),
          username: username.trim() || null,
          school_id: schoolId.trim() || null,
          campus_id: campusId.trim() || null,
          bio: bio.trim() || null,
          avatar_url: null, // 暂不支持头像上传

          // ❌ 如果恶意传递系统字段，后端会忽略：
          // level: 9999,        // ← 会被忽略
          // points: 99999,      // ← 会被忽略
          // extra_data: {hack: true}, // ← 会被忽略
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '保存资料失败');
      }

      console.log('[EditProfile] ✅ 资料完善完成！注册流程结束，跳转首页');

      // 显示成功提示
      alert('🎉 注册完成！\n\n欢迎加入食刻校园\n即将进入首页...');

      // 注册完成，替换导航栈到首页
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });

    } catch (err: any) {
      console.error('[EditProfile] 失败:', err.message);
      setErrorMsg(err.message || '保存失败');
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
            <Text style={styles.title}>✨ 完善资料</Text>
            <Text style={styles.subtitle}>让我们更了解你</Text>

            {/* 进度指示 */}
            <View style={styles.progressRow}>
              <View style={[styles.progressDot, styles.progressDone]}>
                <Text style={styles.progressCheck}>✓</Text>
              </View>
              <View style={[styles.progressLine, styles.progressLineActive]} />
              <View style={[styles.progressDot, styles.progressDone]}>
                <Text style={styles.progressCheck}>✓</Text>
              </View>
              <View style={[styles.progressLine, styles.progressLineActive]} />
              <View style={[styles.progressDot, styles.progressCurrent]}>
                <Text style={styles.progressNum}>3</Text>
              </View>
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabelActive}>手机验证</Text>
              <Text style={styles.progressLabelActive}>设置密码</Text>
              <Text style={styles.progressLabelActive}>完善资料</Text>
            </View>

            {/* 头像占位 */}
            <TouchableOpacity style={styles.avatarWrapper} disabled>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarLetter}>{(displayName || '新')[0]}</Text>
              </View>
              <Text style={styles.avatarHint}>点击更换头像（暂不可用）</Text>
            </TouchableOpacity>

            {/* 错误提示 */}
            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
                <TouchableOpacity onPress={() => setErrorMsg('')}>
                  <Text style={styles.errorDismiss}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* 昵称 (必填) */}
            <Text style={styles.label}>昵称 *</Text>
            <TextInput
              style={styles.input}
              placeholder="你的昵称"
              placeholderTextColor="#999"
              value={displayName}
              onChangeText={setDisplayName}
              editable={!loading}
              maxLength={20}
            />

            {/* 用户名 (可选，设置后不可修改) */}
            <Text style={styles.label}>用户名（可选）</Text>
            <TextInput
              style={styles.input}
              placeholder="@username"
              placeholderTextColor="#999"
              value={username}
              onChangeText={(text) => setUsername(text.replace(/[^a-zA-Z0-9_]/g, ''))}
              editable={!loading}
              autoCapitalize="none"
              maxLength={30}
            />

            {/* 学校ID - 暂时注释，待学校选择功能实现后启用
            <Text style={styles.label}>学校编号（可选）</Text>
            <TextInput
              style={styles.input}
              placeholder="学校编号"
              placeholderTextColor="#999"
              value={schoolId}
              onChangeText={setSchoolId}
              editable={!loading}
            />
            */}

            {/* 校区ID - 暂时注释，待校区选择功能实现后启用
            <Text style={styles.label}>校区编号（可选）</Text>
            <TextInput
              style={styles.input}
              placeholder="校区编号"
              placeholderTextColor="#999"
              value={campusId}
              onChangeText={setCampusId}
              editable={!loading}
            />
            */}

            {/* 简介 */}
            <Text style={styles.label}>个人简介（可选）</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="介绍一下自己..."
              placeholderTextColor="#999"
              value={bio}
              onChangeText={setBio}
              editable={!loading}
              multiline
              numberOfLines={3}
              maxLength={200}
            />

            {/* 提交按钮 */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>🎉 完成，开始使用</Text>
              )}
            </TouchableOpacity>

            {/* ℹ️ 说明文字（替代"跳过"按钮） */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>💡 完善资料后即可开始使用所有功能</Text>
              <Text style={styles.infoSubtext}>昵称为必填项，其他信息可稍后在个人中心修改</Text>
            </View>
          </View>
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
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
    paddingBottom: 40,
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
    marginBottom: 18,
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
  progressDone: { backgroundColor: '#e94560' },
  progressCurrent: {
    backgroundColor: '#e94560',
    borderWidth: 2,
    borderColor: '#ffb3ba',
  },
  progressCheck: { color: '#fff', fontSize: 12, fontWeight: '700' },
  progressNum: { color: '#fff', fontSize: 12, fontWeight: '600' },
  progressLine: {
    width: 36,
    height: 2,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 6,
  },
  progressLineActive: { backgroundColor: '#e94560' },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  progressLabel: { fontSize: 10, color: '#999' },
  progressLabelActive: { color: '#e94560', fontWeight: '600' },

  // 头像
  avatarWrapper: {
    alignItems: 'center',
    marginBottom: 18,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e94560',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  avatarHint: {
    fontSize: 11,
    color: '#bbb',
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
  errorText: { fontSize: 12, color: '#dc2626', flex: 1 },
  errorDismiss: { fontSize: 14, color: '#dc2626', marginLeft: 6, fontWeight: '700' },

  // 表单
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 11,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
    marginBottom: 10,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },

  // 按钮
  submitButton: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // 说明框（替代跳过按钮）
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '500',
    marginBottom: 2,
  },
  infoSubtext: {
    fontSize: 11,
    color: '#7dd3fc',
  },
});
