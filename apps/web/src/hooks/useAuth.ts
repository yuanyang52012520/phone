import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Session, User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  username?: string;
  display_name?: string;
  name?: string;
  phone?: string;
  bio?: string;
  level: number;
  points: number;
  role?: string;
  campus_id?: string;
  school_id?: string;
  region?: string;
  extra_data?: any;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 获取当前 session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error updating profile:', error);
      return { success: false, error: error.message };
    }
  };

  const addPoints = async (pointsToAdd: number, reason: string = '') => {
    if (!profile) return { success: false, error: 'No profile' };

    const newPoints = profile.points + pointsToAdd;
    
    // 计算新等级
    let newLevel = profile.level;
    const levelThresholds = [0, 100, 500, 1500, 4000]; // 等级阈值
    for (let i = levelThresholds.length - 1; i >= 0; i--) {
      if (newPoints >= levelThresholds[i]) {
        newLevel = i + 1;
        break;
      }
    }

    const result = await updateProfile({ 
      points: newPoints, 
      level: newLevel 
    });

    // 记录积分变化日志（使用 user_level_logs 表）
    if (result.success) {
      try {
        await supabase.from('user_level_logs').insert({
          user_id: user!.id,
          action: 'add_points',
          points_delta: pointsToAdd,
          level_before: profile.level,
          level_after: newLevel,
          description: reason || `增加 ${pointsToAdd} 积分`
        });
      } catch (logError) {
        console.error('Error logging points:', logError);
      }
    }

    return result;
  };

  return {
    session,
    user,
    profile,
    loading,
    updateProfile,
    addPoints,
  };
}
