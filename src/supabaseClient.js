import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.startsWith("YOUR_")) {
  console.warn("Supabase credentials are not configured or are placeholders in .env file.");
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
