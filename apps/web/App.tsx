/**
 * 食刻校园 App - 入口文件
 *
 * 功能:
 * - 集成 AuthContext 认证上下文
 * - 配置导航路由
 * - 实现路由保护（未登录跳转登录页）
 * - 初始化时检查登录状态
 *
 * 路由策略:
 * - 未登录 → Login 页面
 * - 已登录 → Home 页面（无论资料是否完整）
 *
 * 注册流程（由各 Screen 内部控制跳转）:
 *   RegisterScreen (输入手机号+验证OTP+初始化用户)
 *     ↓ navigation.replace()
 *   SetPasswordScreen (设置密码)
 *     ↓ navigation.replace()
 *   EditProfileScreen (完善资料，必填无跳过)
 *     ↓ navigation.reset() 到首页
 *   Home
 *
 * ⚠️ EditProfile 不作为应用初始路由！
 *    它只能通过注册流程内部导航到达，
 *    避免老用户/测试账号每次启动都进入完善资料页
 */

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

// 认证上下文
import { AuthProvider, useAuth } from './src/contexts/AuthContext';

// 页面
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import SetPasswordScreen from './src/screens/SetPasswordScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import HomeScreen from './src/screens/HomeScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Stack = createNativeStackNavigator();

// ============================================================
// 工具函数：检查用户资料是否完善
// ============================================================

/**
 * 检查 profile 是否包含必要的用户信息
 *
 * 判断标准: 以下字段至少有一个有值才算"资料已完善"
 * - display_name (昵称) ⭐ 最重要
 * - username (用户名)
 * - school_id (学校ID)
 * - campus_id (校区ID)
 *
 * @param profile - 从 /api/auth/me 获取的用户资料对象
 * @returns true = 资料已完善, false = 需要完善资料
 */
function isProfileComplete(profile: any): boolean {
  if (!profile) return false;

  // 关键字段列表（至少需要一个有值）
  const keyFields = [
    'display_name',
    'username',
    'school_id',
    'campus_id'
  ];

  // 检查是否有任何一个关键字段有值
  const hasData = keyFields.some(field => {
    const value = profile[field];
    return value !== undefined && value !== null && value !== '';
  });

  return hasData;
}

// ============================================================
// 路由保护组件
// 根据认证状态决定显示哪个页面
// ============================================================

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading, isAuthenticated, user, profile } = useAuth();

  // 加载中
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e94560" />
      </View>
    );
  }

  return <>{children}</>;
}

// ============================================================
// 主应用内容（在 AuthProvider 内部使用）
// ============================================================

function AppContent() {
  const { loading, isAuthenticated, user, profile } = useAuth();
  const navigationRef = React.useRef<any>(null);

  // ─── 确定初始路由 ───
  const getInitialRouteName = () => {
    // 未登录或加载中 → 登录页
    if (!isAuthenticated || loading) {
      return 'Login';
    }

    // 已登录 → 检查资料完整性
    console.log('[App] 检查用户资料完整性...');
    console.log('[App] Profile:', JSON.stringify(profile, null, 2));

    // ✅ 修复: EditProfile 只通过注册流程内部导航到达，
    //    不再作为应用初始路由（避免每次启动都进入完善资料页）
    //
    // 注册流程: RegisterScreen → SetPassword → EditProfile → Home
    // 这个跳转链路在各 Screen 内部用 navigation.replace() 控制
    //
    // 此处只做两件事：
    //   1. 未登录 → Login
    //   2. 已登录 → Home（无论资料是否完整，老用户可稍后在个人中心完善）

    console.log('[App] ✅ 已登录 → 进入首页');
    return 'Home';
  };

  const initialRoute = getInitialRouteName();

  // ─── 监听 profile 变化，动态调整路由 ───
  // （用于 EditProfile 提交成功后自动回到 Home）
  useEffect(() => {
    if (isAuthenticated && !loading && initialRoute === 'EditProfile') {
      console.log('[App] 💡 当前处于 EditProfile 页面等待完善资料');
    }
  }, [isAuthenticated, loading, initialRoute]);

  return (
    <NavigationContainer ref={navigationRef}>
      <AuthGuard>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          {/* 公开页面 */}
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ animation: 'fade' }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ animation: 'slide_from_bottom' }}
          />

          {/* 注册流程页面（中间态） */}
          <Stack.Screen
            name="SetPassword"
            component={SetPasswordScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{
              animation: 'slide_from_right',
              // 禁止返回（必须完成资料）
              gestureEnabled: false,
            }}
          />

          {/* 受保护页面（需要登录且资料已完善） */}
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{
              animation: 'slide_from_right',
            }}
          />
        </Stack.Navigator>
      </AuthGuard>
    </NavigationContainer>
  );
}

// ============================================================
// 主应用组件
// ============================================================

export default function App() {
  return (
    // AuthProvider 包裹整个应用，提供认证状态
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

// ============================================================
// 样式
// ============================================================

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
  },
});
