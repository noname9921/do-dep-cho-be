import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// null when env vars are missing → app falls back to items.json (demo mode)
export const supabase = url && key ? createClient(url, key) : null;
