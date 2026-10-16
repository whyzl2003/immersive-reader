import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://purgeqvvyyyizflifchw.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_k8v-re81c2nSy0JYHQI7FQ_UWmGK3hO';

// 全局 Supabase 客户端实例
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
