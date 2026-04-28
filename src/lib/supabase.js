import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

if (typeof window === 'undefined') {
  global.window = global;
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return null;
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  return user;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  
  if (error) {
    console.error('Error getting profile:', error);
    return null;
  }
  return data;
}

export async function createProfile(userId, fullName, hexColor = '#2E7D32') {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      full_name: fullName,
      hex_color: hexColor,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating profile:', error);
    throw error;
  }
  return data;
}