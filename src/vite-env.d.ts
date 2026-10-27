/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional override for the Supabase project URL (defaults to shared/supabaseConfig.ts). */
  readonly VITE_SUPABASE_URL?: string;
  /** Optional override for the Supabase publishable (anon) key. Public by design. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
