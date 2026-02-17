import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Bu hatayı console'a loglamak, env değişkenleri eksikse hızlıca fark etmeni sağlar.
  // Uygulama yine de çalışmayı dener ama Supabase çağrıları hata dönecektir.
  // eslint-disable-next-line no-console
  console.warn("Supabase env değişkenleri eksik. .env.local dosyanı kontrol et.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);