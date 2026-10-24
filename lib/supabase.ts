import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const rememberSessionKey = "fason-takip-remember-session";

export function setRememberSession(remember: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(rememberSessionKey, String(remember));
}

const sessionStorageAdapter = {
  getItem(key: string) {
    if (typeof window === "undefined") return null;
    const remember = window.localStorage.getItem(rememberSessionKey) !== "false";
    return (remember ? window.localStorage : window.sessionStorage).getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window === "undefined") return;
    const remember = window.localStorage.getItem(rememberSessionKey) !== "false";
    (remember ? window.localStorage : window.sessionStorage).setItem(key, value);
  },
  removeItem(key: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: sessionStorageAdapter,
      },
    })
  : null;
