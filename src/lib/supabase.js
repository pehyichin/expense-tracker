import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/** Fetch every row of a query past Supabase's 1000-row page limit. */
export async function fetchAll(build) {
  const size = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
    from += size;
  }
  return out;
}
