// Supabase project used for email + password sign-in.
// Both values are public by design (the publishable key only allows what Supabase's
// auth and row-level security permit), so they can live in the repo and the browser bundle.
// Override with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (browser, build time)
// and SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY (Netlify Functions) to point at another project.
// If you change the project, also update connect-src in netlify.toml's Content-Security-Policy.

export const DEFAULT_SUPABASE_URL = "https://ecufmvqoktrekubghqky.supabase.co";
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BZIQ-IlhcvafGSkr0dKbhg_7Bf8MY9d";
