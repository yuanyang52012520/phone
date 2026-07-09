import React, { useState, useEffect } from 'react';
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

// API 基础地址
const SERVER_URL = 'http://localhost:3001';

interface UserProfile {
  id: string;
  phone: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  region: string | null;
}

export default function ProfileScreen({ navigation, route }: any) {
  // 接收传入的用户信息或 token
  const initialUserInfo = route?.params?.userInfo;

  // 表单状态
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [region, setRegion] = useState('');
  
  // 原始手机号（只读显示）
  const [phone, setPhone] = useState('');

  // 状态管理
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ============================================================
  // 初始化：加载用户资料
  // ============================================================
  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    setLoading(true);
    
    try {
      // 尝试从后端获取完整资料（需要 JWT）
      const token = await getStoredToken();
      
      if (token) {
        try {
          const response = await fetch(`${SERVER_URL}/api/auth/me-jwt`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            const profile: UserProfile = data.user;
            
            setUsername(profile.username || '');
            setDisplayName(profile.display_name || '');
            setBio(profile.bio || '');
            setRegion(profile.region || '');
            setPhone(profile.phone || '');
            return;
          }
        } catch (err) {
          console.log('[Profile] 从后端获取资料失败，使用本地信息');
        }
      }

      // 回退：使用传入的初始信息
      if (initialUserInfo) {
        setUsername(initialUserInfo.username || '');
        setPhone(initialUserInfo.phone || '');
      }
    } catch (err) {
      console.error('[Profile] 加载用户资料失败:', err);
      setErrorMsg('加载用户资料失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取存储的 JWT Token（用于加载资料时）
  const getStoredToken = async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch {
      return null;
    }
  };

  // ============================================================
  // 保存资料
  // ============================================================
  const handleSave = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    // 用户名校验
    if (username.trim().length > 20) {
      setErrorMsg('用户名不能超过20个字符');
      return;
    }

    setSaving(true);

    try {
      // 获取 Supabase session 作为认证凭证
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setErrorMsg('未登录，无法保存资料');
        setSaving(false);
        return;
      }

      const response = await fetch(`${SERVER_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          username: username.trim() || undefined,
          display_name: displayName.trim() || undefined,
          bio: bio.trim() || null,
          region: region.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.error || '保存失败');
        return;
      }

      // 保存成功
      setSuccessMsg('资料保存成功！');
      console.log('[Profile] 资料保存成功:', data.profile);

      // 延迟返回并传递更新后的数据
      setTimeout(() => {
        navigation.goBack();
        // 通知上一页面刷新
        if (route.params?.onRefresh) {
          route.params.onRefresh(data.profile);
        }
      }, 800);

    } catch (err: any) {
      setErrorMsg(`网络错误: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // 头像区域
  // ============================================================
  const renderAvatarSection = () => (
    <View style={styles.avatarSection}>
      <View style={styles.avatarWrapper}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarEmoji}>
            {username?.charAt(0) || '👤'}
          </Text>
        </View>
        <View style={styles.cameraBadge}>
          <Text style={styles.cameraIcon}>📷</Text>
        </View>
      </View>
    </View>
  );

  // ============================================================
  // 渲染：加载中
  // ============================================================
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e94560" />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  // ============================================================
  // 主渲染
  // ============================================================
  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={styles.navbar}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>个人资料</Text>
        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>保存</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* 头像 */}
          {renderAvatarSection()}

          {/* 表单卡片 */}
          <View style={styles.formCard}>
            {/* 错误/成功提示 */}
            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMsg}</Text>
                <TouchableOpacity onPress={() => setErrorMsg('')}>
                  <Text style={styles.dismissText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {successMsg ? (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            ) : null}

            {/* 手机号（只读） */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>手机号</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>{phone || '未设置'}</Text>
                <Text style={styles.readOnlyHint}>账号信息不可修改</Text>
              </View>
            </View>

            <View style={styles.fieldDivider} />

            {/* 用户名 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>用户名</Text>
              <TextInput
                style={styles.input}
                placeholder="请输入用户名"
                placeholderTextColor="#999"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  setErrorMsg('');
                }}
                maxLength={20}
              />
            </View>

            <View style={styles.fieldDivider} />

            {/* 显示名称 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>显示名称</Text>
              <TextInput
                style={styles.input}
                placeholder="请输入显示名称（可选）"
                placeholderTextColor="#999"
                value={displayName}
                onChangeText={(text) => {
                  setDisplayName(text);
                  setErrorMsg('');
                }}
              />
            </View>

            <View style={styles.fieldDivider} />

            {/* 个人简介 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>个人简介</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="介绍一下自己（可选）"
                placeholderTextColor="#999"
                value={bio}
                onChangeText={(text) => {
                  setBio(text);
                  setErrorMsg('');
                }}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            <View style={styles.fieldDivider} />

            {/* 地区 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>地区</Text>
              <TextInput
                style={styles.input}
                placeholder="所在地区（可选）"
                placeholderTextColor="#999"
                value={region}
                onChangeText={(text) => {
                  setRegion(text);
                  setErrorMsg('');
                }}
              />
            </View>
          </View>

          {/* 提示信息 */}
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>💡 提示</Text>
            <Text style={styles.hintText}>
              • 用户名将显示在您的个人主页{'\n'}
              • 显示名称可以是真实姓名或昵称{'\n'}
              • 个人简介帮助其他用户了解您
            </Text>
          </View>

          {/* 底部留白 */}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================
// 样式定义
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },

  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 22,
    color: '#333',
    fontWeight: '600',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#e94560',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },

  avatarSection: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 38,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: {
    fontSize: 14,
  },

  formCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 4,
  },

  errorBanner: {
    backgroundColor: '#f8d7da',
    borderWidth: 1,
    borderColor: '#f5c6cb',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: '#721c24',
    flex: 1,
  },
  successBanner: {
    backgroundColor: '#d4edda',
    borderWidth: 1,
    borderColor: '#c3e6cb',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 12,
    alignItems: 'center',
  },
  successText: {
    fontSize: 14,
    color: '#155724',
    fontWeight: '500',
  },
  dismissText: {
    fontSize: 16,
    color: '#721c24',
    marginLeft: 8,
    fontWeight: '700',
  },

  fieldGroup: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldDivider: {
    height: 1,
    backgroundColor: '#f5f5f5',
    marginLeft: 48,
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fafafa',
  },

  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  readOnlyField: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  readOnlyText: {
    fontSize: 16,
    color: '#333',
  },
  readOnlyHint: {
    fontSize: 11,
    color: '#bbb',
  },

  hintCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#f0f7ff',
    borderWidth: 1,
    borderColor: '#b3d9ff',
    borderRadius: 10,
    padding: 14,
  },
  hintTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0066cc',
    marginBottom: 6,
  },
  hintText: {
    fontSize: 12,
    color: '#3385cc',
    lineHeight: 18,
  },
});
