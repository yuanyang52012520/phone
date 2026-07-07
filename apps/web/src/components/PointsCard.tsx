import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PointsCardProps {
  level: number;
  points: number;
}

// 等级配置
const LEVEL_CONFIG = [
  { level: 1, name: '铜牌食客', icon: '🥉', minPoints: 0, color: '#CD7F32' },
  { level: 2, name: '银牌食客', icon: '🥈', minPoints: 100, color: '#C0C0C0' },
  { level: 3, name: '金牌食客', icon: '🥇', minPoints: 500, color: '#FFD700' },
  { level: 4, name: '铂金食客', icon: '💎', minPoints: 1500, color: '#E5E4E2' },
  { level: 5, name: '钻石食客', icon: '👑', minPoints: 4000, color: '#B9F2FF' },
];

export default function PointsCard({ level, points }: PointsCardProps) {
  const currentLevel = LEVEL_CONFIG[Math.min(level - 1, LEVEL_CONFIG.length - 1)] || LEVEL_CONFIG[0];
  const nextLevel = LEVEL_CONFIG[Math.min(level, LEVEL_CONFIG.length - 1)];
  
  // 计算升级进度
  const progress = nextLevel 
    ? Math.min(((points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100, 100)
    : 100;

  return (
    <View style={[styles.container, { borderLeftColor: currentLevel.color }]}>
      <View style={styles.header}>
        <Text style={styles.icon}>{currentLevel.icon}</Text>
        <View style={styles.info}>
          <Text style={styles.levelName}>{currentLevel.name}</Text>
          <Text style={styles.points}>积分: {points}</Text>
        </View>
      </View>
      
      {nextLevel && level < LEVEL_CONFIG.length && (
        <View style={styles.progressSection}>
          <View style={styles.progressLabel}>
            <Text style={styles.progressText}>
              距离 {nextLevel.name} 还需 {nextLevel.minPoints - points} 积分
            </Text>
            <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${progress}%`, backgroundColor: currentLevel.color }
              ]} 
            />
          </View>
        </View>
      )}

      {/* 等级特权说明 */}
      <View style={styles.privileges}>
        <Text style={styles.privilegeTitle}>当前特权</Text>
        <Text style={styles.privilegeText}>• 基础点餐服务</Text>
        {level >= 2 && <Text style={styles.privilegeText}>• +5% 积分加成</Text>}
        {level >= 3 && <Text style={styles.privilegeText}>• +10% 积分加成</Text>}
        {level >= 4 && <Text style={styles.privilegeText}>• 优先排队通道</Text>}
        {level >= 5 && <Text style={styles.privilegeText}>• 专属客服支持</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 40,
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  levelName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 2,
  },
  points: {
    fontSize: 14,
    color: '#666',
  },
  progressSection: {
    marginBottom: 12,
  },
  progressLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressText: {
    fontSize: 12,
    color: '#888',
  },
  progressPercent: {
    fontSize: 12,
    color: '#e94560',
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  privileges: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  privilegeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    marginBottom: 6,
  },
  privilegeText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
});
