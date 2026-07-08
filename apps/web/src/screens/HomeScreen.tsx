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
} from 'react-native';
import { supabase } from '../services/supabase';

// API 基础地址
const SERVER_URL = 'http://localhost:3001';

type AuthMode = 'login' | 'register'; // 登录 或 注册模式

// 模拟美食数据
const mockFoodList = [
  {
    id: 1,
    name: '台湾卤肉饭',
    location: '第一食堂 二楼',
    description: '卤肉香浓入味，配上溏心蛋绝了！米饭粒粒分明，性价比超高～',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
    tag: '今日推荐',
    recommendCount: 23,
    likes: 98,
    avatars: [
      'https://i.pravatar.cc/40?img=1',
      'https://i.pravatar.cc/40?img=2',
      'https://i.pravatar.cc/40?img=3',
    ],
  },
  {
    id: 2,
    name: '重庆小面',
    location: '第一食堂 一楼',
    description: '麻辣鲜香，劲道十足！嗜辣星人一定不要错过～',
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=300&fit=crop',
    tag: null,
    recommendCount: 17,
    likes: 76,
    avatars: [
      'https://i.pravatar.cc/40?img=4',
      'https://i.pravatar.cc/40?img=5',
    ],
  },
  {
    id: 3,
    name: '香煎鸡排饭',
    location: '第二食堂 二楼',
    description: '鸡排外酥里嫩，酱汁超下饭！食堂的宝藏窗口之一～',
    image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop',
    tag: null,
    recommendCount: 12,
    likes: 64,
    avatars: [
      'https://i.pravatar.cc/40?img=6',
      'https://i.pravatar.cc/40?img=7',
    ],
  },
  {
    id: 4,
    name: '柠檬冰红茶',
    location: '饮品窗口',
    description: '清爽解腻，饭后来一杯超满足！夏日必备～',
    image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=300&fit=crop',
    tag: null,
    recommendCount: 9,
    likes: 42,
    avatars: [
      'https://i.pravatar.cc/40?img=8',
      'https://i.pravatar.cc/40?img=9',
    ],
  },
];

export default function HomeScreen({ navigation }: any) {
  // 状态管理
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  
  // 表单数据
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  
  // 步骤控制
  const [step, setStep] = useState<'input_phone' | 'verify_otp' | 'set_profile' | 'input_password'>('input_phone');
  
  // 加载和错误状态
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [userInfo, setUserInfo] = useState<any>(null);

  // ============================================================
  // 初始化检查登录状态
  // ============================================================
  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsLoggedIn(true);
        // TODO: 从后端获取完整用户信息
        setUserInfo({
          phone: user.phone_metadata?.phone || user.user_metadata?.phone || '',
          nickname: user.user_metadata?.nickname || '食客',
          avatar_url: null,
        });
      }
    } catch (err) {
      console.log('[Home] 检查登录状态失败:', err);
    }
  };

  // ============================================================
  // 显示认证表单
  // ============================================================
  const handleShowAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setShowAuthForm(true);
    setStep('input_phone');
    resetForm();
  };

  const handleCloseAuth = () => {
    setShowAuthForm(false);
    resetForm();
  };

  const resetForm = () => {
    setPhone('');
    setOtp('');
    setPassword('');
    setConfirmPassword('');
    setNickname('');
    setErrorMsg('');
    setLoading(false);
  };

  // ============================================================
  // 发送验证码 / 密码登录
  // ============================================================
  const handleSubmitPhone = async () => {
    const cleanPhone = phone.trim();
    setErrorMsg('');

    if (!cleanPhone) {
      setErrorMsg('请输入手机号');
      return;
    }

    setLoading(true);

    try {
      if (authMode === 'login' && step === 'input_password') {
        // 密码登录
        await handlePasswordLogin(cleanPhone);
      } else if (step === 'input_password') {
        // 注册时设置密码步骤，这里不会走到
      } else {
        // 验证码流程
        await sendOtpAndCheck(cleanPhone);
      }
    } catch (err: any) {
      setErrorMsg(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 发送验证码并检查用户状态（通过后端）
  // ============================================================
  const sendOtpAndCheck = async (cleanPhone: string) => {
    try {
      // 检查手机号是否已注册
      let isNewUser = false;
      
      try {
        const checkRes = await fetch(`${SERVER_URL}/api/auth/check-phone/${encodeURIComponent(cleanPhone)}`);
        const checkData = await checkRes.json();
        
        if (!checkData.registered) {
          isNewUser = true;
        }
      } catch (err) {
        console.log('[Home] 检查手机号失败，继续发送验证码');
        isNewUser = authMode === 'register';
      }

      // 通过后端发送 SMS 验证码（后端代理到 Supabase Auth）
      const smsRes = await fetch(`${SERVER_URL}/api/auth/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });
      
      const smsData = await smsRes.json();

      if (!smsRes.ok) {
        if (smsData.code === 'RATE_LIMITED') {
          throw new Error('发送过于频繁，请60秒后再试');
        }
        throw new Error(smsData.error || '发送验证码失败');
      }

      console.log('[Home] 后端发送验证码成功');

      // 根据模式和用户状态决定下一步
      if (isNewUser || authMode === 'register') {
        setStep('verify_otp');
      } else {
        setStep('verify_otp');
      }
    } catch (err: any) {
      throw err;
    }
  };

  // ============================================================
  // 密码登录
  // ============================================================
  const handlePasswordLogin = async (cleanPhone?: string) => {
    const pwd = password.trim();
    const cleanPh = cleanPhone || phone.trim();

    if (!pwd) {
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
        body: JSON.stringify({ phone: cleanPh, password: pwd }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.error || '登录失败');
        return;
      }

      // 登录成功
      setIsLoggedIn(true);
      setUserInfo(data.user);
      setShowAuthForm(false);
      resetForm();

      console.log('[Home] 密码登录成功:', data.user.id);
    } catch (err: any) {
      setErrorMsg(`网络错误: ${err.message}`);
    }
  };

  // ============================================================
  // 验证 OTP（通过后端验证）
  // ============================================================
  const handleVerifyOtp = async () => {
    const code = otp.trim();
    setErrorMsg('');

    if (!code || code.length < 4) {
      setErrorMsg('请输入完整的验证码');
      return;
    }

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

      console.log('[Home] 后端验证成功, isNewUser:', data.isNewUser);

      // 检查是否需要完善资料（新用户）
      if (data.isNewUser) {
        setStep('set_profile');
      } else {
        // 老用户：直接登录
        setIsLoggedIn(true);
        setUserInfo({
          phone: phone.trim(),
          nickname: data.user?.nickname || '食客',
          avatar_url: data.user?.avatar_url || null,
        });
        setShowAuthForm(false);
        resetForm();
      }
    } catch (err: any) {
      setErrorMsg(err.message || `网络错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 提交资料（注册完成）
  // ============================================================
  const handleSubmitProfile = async () => {
    const pwd = password.trim();
    const confirmPwd = confirmPassword.trim();

    setErrorMsg('');

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

      // 注册成功
      setIsLoggedIn(true);
      setUserInfo(data.profile);
      setShowAuthForm(false);
      resetForm();

      console.log('[Home] 注册成功:', data.profile.id);
    } catch (err: any) {
      setErrorMsg(`网络错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 退出登录
  // ============================================================
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setUserInfo(null);
    setShowAuthForm(false);
    resetForm();
  };

  // ============================================================
  // 刷新用户信息（从 ProfileScreen 返回时调用）
  // ============================================================
  const handleProfileUpdate = (updatedProfile: any) => {
    setUserInfo(prev => ({
      ...prev,
      ...updatedProfile,
    }));
  };

  // ============================================================
  // 输入处理
  // ============================================================
  const handlePhoneChange = (text: string) => {
    setPhone(text.replace(/[^0-9+]/g, ''));
  };

  const handleOtpChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length <= 6) {
      setOtp(cleaned);
    }
  };

  // ============================================================
  // 渲染：未登录状态的首页 - 食客系统主界面（游客）
  // ============================================================
  const renderGuestView = () => (
    <View style={styles.mainContainer}>
      {/* 顶部导航 */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>食客系统 ✨</Text>
        <TouchableOpacity style={styles.notifyBtn}>
          <Text style={styles.notifyIcon}>🔔</Text>
          <View style={styles.notifyBadge} />
        </TouchableOpacity>
      </View>

      {/* 搜索栏 */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={styles.searchPlaceholder}>搜索食堂、菜品、用户或评价</Text>
        <TouchableOpacity style={styles.scanBtn}>
          <Text style={styles.scanIcon}>⌨️</Text>
        </TouchableOpacity>
      </View>

      {/* 今日推荐 */}
      <ScrollView 
        style={styles.contentArea} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>今日推荐</Text>
          <TouchableOpacity>
            <Text style={styles.viewAll}>查看全部 ›</Text>
          </TouchableOpacity>
        </View>

        {/* 美食列表 */}
        {mockFoodList.map((item) => (
          <TouchableOpacity key={item.id} style={styles.foodCard} activeOpacity={0.7}>
            <Image source={{ uri: item.image }} style={styles.foodImage} />
            <View style={styles.foodInfo}>
              {item.tag && (
                <View style={styles.tagBadge}>
                  <Text style={styles.tagText}>{item.tag}</Text>
                </View>
              )}
              <Text style={styles.foodName}>{item.name}</Text>
              <Text style={styles.foodLocation}>📍 {item.location}</Text>
              <Text style={styles.foodDesc} numberOfLines={2}>{item.description}</Text>
              <View style={styles.foodFooter}>
                <View style={styles.userAvatars}>
                  {item.avatars.map((avatar, idx) => (
                    <Image key={idx} source={{ uri: avatar }} style={styles.miniAvatar} />
                  ))}
                  <Text style={styles.recommendCount}>{item.recommendCount}人推荐</Text>
                </View>
                <TouchableOpacity style={styles.likeBtn}>
                  <Text style={styles.likeIcon}>❤️</Text>
                  <Text style={styles.likeCount}>{item.likes}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* 注册/登录入口 */}
        <TouchableOpacity 
          style={styles.authEntryBtn}
          onPress={() => handleShowAuth('login')}
          activeOpacity={0.8}
        >
          <Text style={styles.authEntryText}>注 册 / 登 录</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );

  // ============================================================
  // 渲染：已登录状态的首页 - 食客系统主界面
  // ============================================================
  const renderLoggedInView = () => (
    <View style={styles.mainContainer}>
      {/* 顶部导航 */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>食客系统 ✨</Text>
        <TouchableOpacity style={styles.notifyBtn}>
          <Text style={styles.notifyIcon}>🔔</Text>
          <View style={styles.notifyBadge} />
        </TouchableOpacity>
      </View>

      {/* 搜索栏 */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={styles.searchPlaceholder}>搜索食堂、菜品、用户或评价</Text>
        <TouchableOpacity style={styles.scanBtn}>
          <Text style={styles.scanIcon}>⌨️</Text>
        </TouchableOpacity>
      </View>

      {/* 今日推荐 */}
      <ScrollView 
        style={styles.contentArea} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>今日推荐</Text>
          <TouchableOpacity>
            <Text style={styles.viewAll}>查看全部 ›</Text>
          </TouchableOpacity>
        </View>

        {/* 美食列表 */}
        {mockFoodList.map((item) => (
          <TouchableOpacity key={item.id} style={styles.foodCard} activeOpacity={0.7}>
            <Image source={{ uri: item.image }} style={styles.foodImage} />
            <View style={styles.foodInfo}>
              {item.tag && (
                <View style={styles.tagBadge}>
                  <Text style={styles.tagText}>{item.tag}</Text>
                </View>
              )}
              <Text style={styles.foodName}>{item.name}</Text>
              <Text style={styles.foodLocation}>📍 {item.location}</Text>
              <Text style={styles.foodDesc} numberOfLines={2}>{item.description}</Text>
              <View style={styles.foodFooter}>
                <View style={styles.userAvatars}>
                  {item.avatars.map((avatar, idx) => (
                    <Image key={idx} source={{ uri: avatar }} style={styles.miniAvatar} />
                  ))}
                  <Text style={styles.recommendCount}>{item.recommendCount}人推荐</Text>
                </View>
                <TouchableOpacity style={styles.likeBtn}>
                  <Text style={styles.likeIcon}>❤️</Text>
                  <Text style={styles.likeCount}>{item.likes}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* 用户信息卡片 */}
        <View style={styles.userCard}>
          {userInfo?.avatar_url ? (
            <Image source={{ uri: userInfo.avatar_url }} style={styles.avatarLarge} />
          ) : (
            <View style={styles.avatarPlaceholderLarge}>
              <Text style={styles.avatarTextLarge}>{userInfo?.nickname?.charAt(0) || '食'}</Text>
            </View>
          )}
          <Text style={styles.greetingName}>你好，{userInfo?.nickname || '食客'} 👋</Text>
          
          <View style={styles.userActions}>
            <TouchableOpacity 
              style={styles.profileBtn}
              onPress={() => navigation?.navigate('Profile', { userInfo, onRefresh: handleProfileUpdate })}
            >
              <Text style={styles.profileBtnText}>编辑资料</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutSmallBtn} onPress={handleLogout}>
              <Text style={styles.logoutSmallBtnText}>退出登录</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );

  // ============================================================
  // 渲染：认证表单弹窗
  // ============================================================
  const renderAuthForm = () => (
    <ScrollView contentContainerStyle={styles.authScrollContent}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.authContainer}
      >
        <View style={styles.authCard}>
          {/* 头部 */}
          <View style={styles.authHeader}>
            <Text style={styles.authTitle}>食客系统</Text>
            <Text style={styles.authSubtitle}>手机号验证码登录</Text>
            
            {/* 关闭按钮 */}
            <TouchableOpacity style={styles.closeButton} onPress={handleCloseAuth}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
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

          {/* 步骤1：输入手机号 / 密码登录 */}
          {(step === 'input_phone' || step === 'input_password') && (
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

              {/* 登录方式切换（仅登录模式） */}
              {authMode === 'login' && (
                <View style={styles.modeSwitch}>
                  <TouchableOpacity 
                    style={[styles.modeTab, step !== 'input_password' && styles.modeTabActive]}
                    onPress={() => { setStep('input_phone'); setErrorMsg(''); }}
                    disabled={loading}
                  >
                    <Text style={[styles.modeText, step !== 'input_password' && styles.modeTextActive]}>
                      📱 验证码
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.modeTab, step === 'input_password' && styles.modeTabActive]}
                    onPress={() => { setStep('input_password'); setErrorMsg(''); }}
                    disabled={loading}
                  >
                    <Text style={[styles.modeText, step === 'input_password' && styles.modeTextActive]}>
                      🔑 密码
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 密码输入框（密码模式下显示） */}
              {step === 'input_password' && (
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
                </>
              )}

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSubmitPhone}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {step === 'input_password' ? '登 录' : (authMode === 'register' ? '下一步' : '获取验证码')}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* 步骤2：输入验证码 */}
          {step === 'verify_otp' && (
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
                onPress={() => { setStep('input_phone'); setOtp(''); }}
                disabled={loading}
              >
                <Text style={styles.linkText}>← 更换手机号</Text>
              </TouchableOpacity>
            </>
          )}

          {/* 步骤3：填写资料（仅注册） */}
          {step === 'set_profile' && (
            <>
              <Text style={styles.subtitle} style={{ ...styles.subtitle, marginBottom: 16 }}>
                设置您的账户信息
              </Text>

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
          )}

          {/* 底部切换 */}
          <View style={styles.switchMode}>
            <Text style={styles.switchModeText}>
              {authMode === 'register' ? '已有账号？' : '没有账号？'}
            </Text>
            <TouchableOpacity 
              onPress={() => { 
                setAuthMode(authMode === 'register' ? 'login' : 'register'); 
                setStep('input_phone'); 
                resetForm(); 
              }}
            >
              <Text style={styles.switchModeLink}>
                {authMode === 'register' ? '去登录' : '立即注册'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScrollView>
  );

  // ============================================================
  // 主渲染
  // ============================================================
  if (showAuthForm) {
    return renderAuthForm();
  }

  return isLoggedIn ? renderLoggedInView() : renderGuestView();
}

// ============================================================
// 样式定义
// ============================================================
const styles = StyleSheet.create({
  // ==================== 主界面容器 ====================
  mainContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  safeArea: {
    flex: 1,
  },

  // 顶部导航栏
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  notifyBtn: {
    position: 'relative',
    padding: 6,
  },
  notifyIcon: {
    fontSize: 22,
  },
  notifyBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e94560',
  },

  // 搜索栏
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: '#bbb',
  },
  scanBtn: {
    padding: 4,
  },
  scanIcon: {
    fontSize: 20,
  },

  // 内容区
  contentArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // 今日推荐标题
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  viewAll: {
    fontSize: 13,
    color: '#999',
  },

  // 美食卡片
  foodCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  foodImage: {
    width: 120,
    height: 120,
    resizeMode: 'cover',
  },
  foodInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'flex-start',
  },
  tagBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#52C41A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
  },
  tagText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  foodName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  foodLocation: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  foodDesc: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
    marginBottom: 8,
  },
  foodFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#fff',
    marginLeft: -6,
  },
  recommendCount: {
    fontSize: 11,
    color: '#999',
    marginLeft: 8,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  likeCount: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },

  // 登录/注册入口按钮
  authEntryBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#FFD6D6',
    alignItems: 'center',
  },
  authEntryText: {
    fontSize: 17,
    color: '#e94560',
    fontWeight: 'bold',
    letterSpacing: 2,
  },

  // 已登录用户卡片
  userCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarLarge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginBottom: 12,
  },
  avatarPlaceholderLarge: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarTextLarge: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  greetingName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  userActions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    gap: 16,
  },
  profileBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#e94560',
    borderRadius: 24,
  },
  profileBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  logoutSmallBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 24,
  },
  logoutSmallBtnText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },

  // 底部间距
  bottomSpacing: {
    height: 20,
  },

  // 底部导航栏
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingBottom: 8,
    paddingTop: 8,
    paddingHorizontal: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  tabActive: {},
  tabIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  tabIconActive: {
    fontSize: 22,
    marginBottom: 2,
  },
  tabText: {
    fontSize: 11,
    color: '#999',
  },
  tabTextActive: {
    fontSize: 11,
    color: '#e94560',
    fontWeight: '600',
  },

  // ==================== 认证表单 ====================
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authCard: {
    backgroundColor: '#fff',
    width: '85%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  authHeader: {
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  authTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  authSubtitle: {
    fontSize: 12,
    color: '#888',
  },

  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
  },
  stepDotActive: {
    backgroundColor: '#e94560',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#ddd',
    marginHorizontal: 6,
  },

  closeButton: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    color: '#666',
  },

  errorBanner: {
    backgroundColor: '#f8d7da',
    borderWidth: 1,
    borderColor: '#f5c6cb',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
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

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  phoneDisplay: {
    fontSize: 11,
    color: '#999',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
    marginBottom: 14,
  },
  otpInput: {
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
  },

  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
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

  button: {
    backgroundColor: '#E85D75',
    borderRadius: 10,
    padding: 13,
    alignItems: 'center',
    marginBottom: 8,
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
    padding: 4,
  },
  linkText: {
    color: '#e94560',
    fontSize: 14,
  },

  devBanner: {
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffc107',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
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

  switchMode: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  switchModeText: {
    fontSize: 13,
    color: '#888',
    marginRight: 4,
  },
  switchModeLink: {
    fontSize: 13,
    color: '#e94560',
    fontWeight: '600',
  },
});
