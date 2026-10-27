// The browser's one Supabase client, used only for email + password sign-in.
// The URL and publishable key are public by design; they can be overridden at build time.
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_SUPABASE_PUBLISHABLE_KEY, DEFAULT_SUPABASE_URL } from "../../shared/supabaseConfig.ts";

const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** The current access token, refreshed by supabase-js if it is about to expire. Null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Signs out this browser only (other devices stay signed in). Never throws. */
export async function signOutLocally(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The local session is removed even if the network call fails.
  }
}
