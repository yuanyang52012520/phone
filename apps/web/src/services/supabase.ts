import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://zxugomsqlzoxdkkgjyar.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dWdvbXNxbHpveGRra2dqeWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODc0NTYsImV4cCI6MjA5NjQ2MzQ1Nn0.zppcZgQyk01cA-Z6fP_deHyfbLYackull4odJu7yB6M';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
