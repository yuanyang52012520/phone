import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface QuickActionsProps {
  onNavigate: (screen: string) => void;
}

const actions = [
  {
    id: 'queue',
    icon: '🎫',
    label: '取号排队',
    screen: 'Queue',
    color: '#e94560',
    bgColor: '#fff0f3',
  },
  {
    id: 'status',
    icon: '📋',
    label: '排队状态',
    screen: 'QueueStatus',
    color: '#4CAF50',
    bgColor: '#E8F5E9',
  },
  {
    id: 'canteen',
    icon: '🏪',
    label: '选择食堂',
    screen: 'CanteenList',
    color: '#FF9800',
    bgColor: '#FFF3E0',
  },
  {
    id: 'dishes',
    icon: '🍜',
    label: '今日推荐',
    screen: 'TodayRecommend',
    color: '#9C27B0',
    bgColor: '#F3E5F5',
  },
];

export default function QuickActions({ onNavigate }: QuickActionsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>快捷服务</Text>
      <View style={styles.grid}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={[styles.actionItem, { backgroundColor: action.bgColor }]}
            onPress={() => onNavigate(action.screen)}
            activeOpacity={0.7}
          >
            <Text style={styles.icon}>{action.icon}</Text>
            <Text style={[styles.label, { color: action.color }]}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 12,
  },
  actionItem: {
    width: (120),
    aspectRatio: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  icon: {
    fontSize: 36,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
