/**
 * 食刻校园 App - 个人中心
 * 
 * 显示和编辑用户资料
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function ProfileScreen({ navigation }: any) {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* 头部信息 */}
        <View style={styles.header}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {user?.display_name?.charAt(0) || 'U'}
            </Text>
          </View>
          <Text style={styles.displayName}>
            {user?.display_name || '新用户'}
          </Text>
          {user?.username && (
            <Text style={styles.username}>@{user.username}</Text>
          )}
        </View>

        {/* 用户信息卡片 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>基本信息</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>用户ID</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {user?.id?.substring(0, 12)}...
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>等级</Text>
            <Text style={styles.infoValue}>Lv.{user?.level || 1}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>积分</Text>
            <Text style={styles.infoValue}>{user?.points || 0}</Text>
          </View>

          {user?.bio && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>简介</Text>
              <Text style={styles.infoValue}>{user.bio}</Text>
            </View>
          )}
        </View>

        {/* 功能列表 */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>账户设置</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>编辑资料</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>修改密码</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>通知设置</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 版本信息 */}
        <Text style={styles.version}>版本 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  header: {
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarLargeText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  displayName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  username: {
    fontSize: 14,
    color: '#999',
  },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 20,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: '#1a1a2e',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  menuItemText: {
    fontSize: 15,
    color: '#333',
  },
  menuArrow: {
    fontSize: 20,
    color: '#ccc',
  },
  version: {
    textAlign: 'center',
    color: '#ccc',
    fontSize: 12,
    paddingVertical: 24,
  },
});
