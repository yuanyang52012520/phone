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
  Image,
  Alert,
} from 'react-native';
import { supabase } from '../services/supabase';

// API 基础地址
const SERVER_URL = 'http://localhost:3001';

type GenderOption = 0 | 1 | 2; // 0: 保密, 1: 男, 2: 女

interface UserProfile {
  id: string;
  phone: string;
  nickname: string;
  avatar_url: string | null;
  real_name: string | null;
  gender: number;
  birthday: string | null;
}

export default function ProfileScreen({ navigation, route }: any) {
  // 接收传入的用户信息或 token
  const initialUserInfo = route?.params?.userInfo;

  // 表单状态
  const [nickname, setNickname] = useState('');
  const [realName, setRealName] = useState('');
  const [gender, setGender] = useState<GenderOption>(0);
  const [birthday, setBirthday] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  
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
            
            setNickname(profile.nickname || '');
            setRealName(profile.real_name || '');
            setGender((profile.gender as GenderOption) || 0);
            setBirthday(profile.birthday || '');
            setAvatarUrl(profile.avatar_url || '');
            setPhone(profile.phone || '');
            return;
          }
        } catch (err) {
          console.log('[Profile] 从后端获取资料失败，使用本地信息');
        }
      }

      // 回退：使用传入的初始信息
      if (initialUserInfo) {
        setNickname(initialUserInfo.nickname || '');
        setPhone(initialUserInfo.phone || '');
        setAvatarUrl(initialUserInfo.avatar_url || '');
      }
    } catch (err) {
      console.error('[Profile] 加载用户资料失败:', err);
      setErrorMsg('加载用户资料失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取存储的 JWT Token
  const getStoredToken = async (): Promise<string | null> => {
    try {
      // 可以从 AsyncStorage 或其他地方获取 token
      // 这里简化处理，实际项目中应从安全存储获取
      const { data: { user } } = await supabase.auth.getSession();
      // 如果使用自定义 token 存储，这里需要调整
      return user ? 'dummy-token' : null; // 占位，需要根据实际存储方式调整
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

    // 昵称校验
    if (nickname.trim().length > 20) {
      setErrorMsg('昵称不能超过20个字符');
      return;
    }

    // 生日格式校验（如果填写了）
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      setErrorMsg('生日格式应为 YYYY-MM-DD');
      return;
    }

    setSaving(true);

    try {
      const token = await getStoredToken();
      
      if (!token) {
        // 如果没有 token，尝试用 session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setErrorMsg('未登录，无法保存资料');
          setSaving(false);
          return;
        }
      }

      const response = await fetch(`${SERVER_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          nickname: nickname.trim() || undefined,
          avatar_url: avatarUrl.trim() || undefined,
          real_name: realName.trim() || undefined,
          gender: gender !== 0 ? gender : undefined,
          birthday: birthday.trim() || undefined,
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
  // 选择性别
  // ============================================================
  const renderGenderSelector = () => (
    <View style={styles.genderContainer}>
      <Text style={styles.label}>性别</Text>
      <View style={styles.genderOptions}>
        <TouchableOpacity
          style={[styles.genderOption, gender === 0 && styles.genderOptionActive]}
          onPress={() => setGender(0)}
        >
          <Text style={[styles.genderText, gender === 0 && styles.genderTextActive]}>
            保密
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.genderOption, gender === 1 && styles.genderOptionActive]}
          onPress={() => setGender(1)}
        >
          <Text style={[styles.genderText, gender === 1 && styles.genderTextActive]}>
            👨 男
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.genderOption, gender === 2 && styles.genderOptionActive]}
          onPress={() => setGender(2)}
        >
          <Text style={[styles.genderText, gender === 2 && styles.genderTextActive]}>
            👩 女
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ============================================================
  // 头像区域
  // ============================================================
  const renderAvatarSection = () => (
    <View style={styles.avatarSection}>
      <TouchableOpacity style={styles.avatarWrapper}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarEmoji}>
              {nickname?.charAt(0) || '👤'}
            </Text>
          </View>
        )}
        <View style={styles.cameraBadge}>
          <Text style={styles.cameraIcon}>📷</Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.avatarHint}>点击更换头像</Text>
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

            {/* 昵称 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>昵称</Text>
              <TextInput
                style={styles.input}
                placeholder="请输入昵称"
                placeholderTextColor="#999"
                value={nickname}
                onChangeText={(text) => {
                  setNickname(text);
                  setErrorMsg('');
                }}
                maxLength={20}
              />
            </View>

            <View style={styles.fieldDivider} />

            {/* 真实姓名 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>真实姓名</Text>
              <TextInput
                style={styles.input}
                placeholder="请输入真实姓名（可选）"
                placeholderTextColor="#999"
                value={realName}
                onChangeText={(text) => {
                  setRealName(text);
                  setErrorMsg('');
                }}
                maxLength={10}
              />
            </View>

            <View style={styles.fieldDivider} />

            {/* 性别选择 */}
            {renderGenderSelector()}

            <View style={styles.fieldDivider} />

            {/* 生日 */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>生日</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD（可选）"
                placeholderTextColor="#999"
                value={birthday}
                onChangeText={(text) => {
                  setBirthday(text);
                  setErrorMsg('');
                }}
                maxLength={10}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.fieldDivider} />

            {/* 头像 URL（高级选项） */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>头像链接（URL）</Text>
              <TextInput
                style={styles.input}
                placeholder="https://example.com/avatar.jpg"
                placeholderTextColor="#999"
                value={avatarUrl}
                onChangeText={(text) => {
                  setAvatarUrl(text);
                  setErrorMsg('');
                }}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          </View>

          {/* 提示信息 */}
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>💡 提示</Text>
            <Text style={styles.hintText}>
              • 昵称将显示在您的个人主页{'\n'}
              • 生日仅用于个性化推荐，不会公开显示{'\n'}
              • 头像支持 JPG、PNG 格式图片链接
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
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
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
  avatarHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#999',
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

  genderContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  genderOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  genderOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e8e8e8',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  genderOptionActive: {
    borderColor: '#e94560',
    backgroundColor: '#fff5f7',
  },
  genderText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  genderTextActive: {
    color: '#e94560',
    fontWeight: '600',
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
