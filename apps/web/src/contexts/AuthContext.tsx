/**
 * 食刻校园 App - 认证上下文 (AuthContext)
 *
 * 核心职责:
 * 1. 管理 session / user / profile 状态
 * 2. 提供登录方法（验证码/密码）- 老用户直接进首页
 * 3. 提供注册初始化方法 - 新用户创建基础数据
 * 4. 启动时恢复登录态
 *
 * 关键区别:
 * - 登录: 检查 profiles 是否存在，存在则进入首页
 * - 注册: 创建基础用户数据 → 设置密码 → 完善资料 → 进首页
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import type { User, Session } from '@supabase/supabase-js';

// ============================================================
// 类型定义
// ============================================================

interface UserProfile {
  id: string;
  school_id?: string;
  campus_id?: string;
  username?: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  level?: number;
  points?: number;
}

interface AuthContextType {
  // 状态
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;

  // ─── 登录方法（老用户使用）───
  loginWithOtp: (phone: string) => Promise<{ error: Error | null; data: any }>;
  verifyOtp: (phone: string, otp: string) => Promise<{ error: Error | null; data: any; isNewUser: boolean }>;
  loginWithPassword: (phone: string, password: string) => Promise<{ error: Error | null; data: any; isNewUser: boolean }>;

  // ─── 注册方法（新用户使用）───
  checkUserRegistered: (phone: string) => Promise<{ isRegistered: boolean }>;
  initNewUser: (authUserId: string, phone: string) => Promise<{ success: boolean; error?: string }>;
  setPassword: (userId: string, phone: string, password: string) => Promise<{ success: boolean; error?: string }>;

  // ─── 通用方法 ───
  updateProfile: (data: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================
// 配置常量
// ============================================================

const SERVER_URL = 'http://localhost:3001';

// ============================================================
// AuthProvider 组件
// ============================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!user && !!session;

  // ─── 获取用户资料 ───
  const fetchProfile = useCallback(async (userId: string, token?: string) => {
    try {
      const headers: Record<string, string> = {};
      if (token || session?.access_token) {
        headers['Authorization'] = `Bearer ${token || session?.access_token}`;
      }

      const response = await fetch(`${SERVER_URL}/api/auth/me`, { headers });

      if (response.ok) {
        const data = await response.json();
        if (data.user && !data.user.is_new) {
          setProfile(data.user);
          return data.user;
        }
      }
    } catch (err) {
      console.error('[AuthContext] 获取用户资料失败:', err);
    }
    return null;
  }, [session?.access_token]);

  // ─── 初始化：恢复登录状态 ───
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.log('[AuthContext] 初始化认证状态...');

        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[AuthContext] 获取 Session 失败:', sessionError.message);
        }

        if (mounted) {
          if (currentSession?.user) {
            console.log('[AuthContext] ✅ 找到有效 Session');
            setSession(currentSession);
            setUser(currentSession.user);
            await fetchProfile(currentSession.user.id, currentSession.access_token);
          } else {
            setUser(null);
            setSession(null);
            setProfile(null);
          }
        }
      } catch (err) {
        console.error('[AuthContext] 初始化异常:', err);
        if (mounted) {
          setUser(null);
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log(`[AuthContext] 认证状态变化: ${event}`);

        if (!mounted) return;

        switch (event) {
          case 'SIGNED_IN':
            if (newSession?.user) {
              setSession(newSession);
              setUser(newSession.user);
              setLoading(false);
              fetchProfile(newSession.user.id, newSession.access_token).catch(() => {});
            }
            break;
          case 'SIGNED_OUT':
            setSession(null);
            setUser(null);
            setProfile(null);
            setLoading(false);
            break;
          case 'TOKEN_REFRESHED':
            if (newSession) setSession(newSession);
            break;
          default:
            setLoading(false);
            break;
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ════════════════════════════════════════════
  // 登录方法（老用户）
  // ════════════════════════════════════════════

  /**
   * 发送验证码 OTP（登录和注册共用）
   */
  const loginWithOtp = async (phone: string) => {
    try {
      console.log('[AuthContext] 📱 发送验证码 OTP:', phone);

      const { data, error } = await supabase.auth.signInWithOtp({ phone });

      if (error) {
        console.error('[AuthContext] ❌ Supabase 错误:', JSON.stringify(error));
        let errorMsg = error.message;
        if (!errorMsg || errorMsg.trim() === '' || errorMsg === 'undefined') {
          errorMsg = '认证服务未启用手机号登录';
        }
        return { error: new Error(errorMsg), data: null };
      }

      console.log('[AuthContext] ✅ 验证码请求已发送');
      return { error: null, data };

    } catch (err: any) {
      console.error('[AuthContext] ❌ 发送验证码异常:', err?.message || err);
      return { error: new Error(err?.message || '网络错误'), data: null };
    }
  };

  /**
   * 验证 OTP 并判断是新用户还是老用户
   *
   * 返回值包含 isNewUser:
   *   true  → 新用户（profiles不存在），需要走注册流程
   *   false → 老用户（profiles已存在），可以直接进首页
   */
  const verifyOtp = async (phone: string, otp: string): Promise<{
    error: Error | null;
    data: any;
    isNewUser: boolean;
  }> => {
    try {
      console.log('[AuthContext] 🔐 验证 OTP');

      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms',
      });

      if (error) {
        console.error('[AuthContext] ❌ OTP 验证失败:', error.message);
        return { error: new Error(error.message), data: null, isNewUser: false };
      }

      console.log('[AuthContext] ✅ OTP 验证成功');

      // 更新本地状态
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user || null);
      }

      const authUserId = data.user?.id || data.session?.user?.id;

      // 关键：检查 profiles 是否存在来判断新老用户
      let isNewUser = false;
      if (authUserId) {
        const userProfile = await fetchProfile(authUserId, data.session?.access_token);
        isNewUser = !userProfile;
        console.log(`[AuthContext] 👤 用户判断: ${isNewUser ? '新用户 ❗' : '老用户 ✓'}`);
        if (isNewUser) {
          console.log('[AuthContext] 💡 新用户需要走注册流程：创建资料 → 设置密码 → 完善信息');
        }
      }

      return { error: null, data, isNewUser };

    } catch (err: any) {
      console.error('[AuthContext] ❌ 验证 OTP 异常:', err.message);
      return { error: err, data: null, isNewUser: false };
    }
  };

  /**
   * 密码登录（老用户使用）
   * 返回 isNewUser 用于提示未注册
   */
  const loginWithPassword = async (phone: string, password: string): Promise<{
    error: Error | null;
    data: any;
    isNewUser: boolean;
  }> => {
    try {
      console.log('[AuthContext] 🔑 密码登录');

      const response = await fetch(`${SERVER_URL}/api/auth/password-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        const isNewUser = result.code === 'NOT_FOUND' || result.error?.includes('未注册');
        return { error: new Error(result.error || '密码登录失败'), data: null, isNewUser };
      }

      console.log('[AuthContext] ✅ 密码验证成功');
      return { error: null, data: result, isNewUser: false };

    } catch (err: any) {
      console.error('[AuthContext] ❌ 密码登录异常:', err.message);
      return { error: err, data: null, isNewUser: false };
    }
  };

  // ════════════════════════════════════════════
  // 注册方法（新用户专用）
  // ════════════════════════════════════════════

  /**
   * 检查手机号是否已注册（用于登录前预检）
   */
  const checkUserRegistered = async (phone: string): Promise<{ isRegistered: boolean }> => {
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/check-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const result = await response.json();
      return { isRegistered: result.isRegistered || false };
    } catch {
      return { isRegistered: false };
    }
  };

  /**
   * 初始化新用户：创建 profiles + phone auth_account
   * 在 verifyOtp 发现是新用户后调用此方法
   */
  const initNewUser = async (authUserId: string, phone: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[AuthContext] 📝 初始化新用户...');

      const currentSession = supabase.auth.getSession();
      const accessToken = (await currentSession).data.session?.access_token;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(`${SERVER_URL}/api/auth/init-user`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ auth_user_id: authUserId, phone }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[AuthContext] ❌ 初始化失败:', result.error);
        return { success: false, error: result.error || '初始化失败' };
      }

      console.log('[AuthContext] ✅ 新用户初始化完成');

      // 刷新本地 profile
      if (result.user?.id) {
        await fetchProfile(result.user.id);
      }

      return { success: true };

    } catch (err: any) {
      console.error('[AuthContext] ❌ 初始化异常:', err.message);
      return { success: false, error: err.message };
    }
  };

  /**
   * 设置密码（注册流程 Step 2）
   */
  const setPassword = async (userId: string, phone: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[AuthContext] 🔒 设置密码');

      const response = await fetch(`${SERVER_URL}/api/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, phone, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || '设置密码失败' };
      }

      console.log('[AuthContext] ✅ 密码设置完成');
      return { success: true };

    } catch (err: any) {
      console.error('[AuthContext] ❌ 设置密码异常:', err.message);
      return { success: false, error: err.message };
    }
  };

  // ════════════════════════════════════════════
  // 通用方法
  // ════════════════════════════════════════════

  /**
   * 更新用户资料（完善资料页面用）
   *
   * ⚠️ 使用新版API: PUT /api/user/profile
   * 特点:
   * - 只允许更新用户可编辑字段
   * - 系统字段会被后端自动过滤
   */
  const updateProfile = async (data: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('[AuthContext] ✏️ 更新用户资料 (PUT /api/user/profile)');

      const accessToken = session?.access_token;
      if (!accessToken) return { success: false, error: '未登录' };

      const response = await fetch(`${SERVER_URL}/api/user/profile`, {
        method: 'PUT', // ⭐ 改为 PUT 方法
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || '更新失败' };
      }

      // 刷新本地 profile
      if (user?.id) {
        await fetchProfile(user.id);
      }

      console.log('[AuthContext] ✅ 资料更新完成');
      return { success: true };

    } catch (err: any) {
      console.error('[AuthContext] ❌ 更新异常:', err.message);
      return { success: false, error: err.message };
    }
  };

  /**
   * 登出
   */
  const logout = async () => {
    try {
      console.log('[AuthContext] 登出');
      const { error } = await supabase.auth.signOut();
      if (error) console.error('[AuthContext] 登出失败:', error.message);
      setSession(null);
      setUser(null);
      setProfile(null);
    } catch (err: any) {
      console.error('[AuthContext] 登出异常:', err.message);
      setSession(null);
      setUser(null);
      setProfile(null);
    }
  };

  /**
   * 刷新用户资料
   */
  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  // ─── Context Value ───

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    isAuthenticated,
    loginWithOtp,
    verifyOtp,
    loginWithPassword,
    checkUserRegistered,
    initNewUser,
    setPassword,
    updateProfile,
    logout,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// 自定义 Hook
// ============================================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }
  return context;
}

export { AuthContext };
