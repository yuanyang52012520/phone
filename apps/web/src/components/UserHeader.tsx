import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../hooks/useAuth';

interface UserHeaderProps {
  navigation?: any;
}

export default function UserHeader({ navigation }: UserHeaderProps) {
  const { user, profile } = useAuth();

  // 手机号脱敏显示
  const maskPhone = (phone?: string | null) => {
    if (!phone) return '未绑定';
    if (phone.length === 11) {
      return `${phone.slice(0, 3)}****${phone.slice(7)}`;
    }
    return phone;
  };

  // 获取用户显示名称
  const getDisplayName = () => {
    if (profile?.display_name) return profile.display_name;
    if (profile?.name) return profile.name;
    if (profile?.username) return profile.username;
    return '食客用户';
  };

  return (
    <View style={styles.container}>
      <View style={styles.userInfo}>
        {/* 头像 */}
        <TouchableOpacity 
          style={styles.avatar}
          onPress={() => navigation?.navigate('Profile')}
          activeOpacity={0.7}
        >
          <Text style={styles.avatarEmoji}>
            {profile?.display_name ? profile.display_name.charAt(0).toUpperCase() : '👤'}
          </Text>
        </TouchableOpacity>

        {/* 用户信息 */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{getDisplayName()}</Text>
          <Text style={styles.phone}>{maskPhone(profile?.phone)}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Lv.{profile?.level || 1}</Text>
            </View>
            <Text style={styles.pointsText}>
              {profile?.points || 0} 积分
            </Text>
          </View>
        </View>

        {/* 设置/编辑按钮 */}
        <TouchableOpacity 
          style={styles.editButton}
          onPress={() => navigation?.navigate('ProfileEdit')}
          activeOpacity={0.7}
        >
          <Text style={styles.editIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* 统计信息条 */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{profile?.points || 0}</Text>
          <Text style={styles.statLabel}>总积分</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{profile?.level || 1}</Text>
          <Text style={styles.statLabel}>等级</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{getDayStreak()}</Text>
          <Text style={styles.statLabel}>连续签到</Text>
        </View>
      </View>
    </View>
  );

  // 模拟签到天数（实际应从后端获取）
  function getDayStreak(): number {
    return Math.floor(Math.random() * 30) + 1;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: 20,
    paddingBottom: 24,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarEmoji: {
    fontSize: 28,
  },
  info: {
    flex: 1,
    marginLeft: 14,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  phone: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: 'rgba(255,215,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFD700',
  },
  pointsText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editIcon: {
    fontSize: 18,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    marginTop: 16,
    paddingVertical: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: 4,
  },
});
