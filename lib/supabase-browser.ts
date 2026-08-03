import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type OnyxBrowserGlobals = typeof globalThis & {
  __onyxSupabaseClient?: SupabaseClient;
};

const onyxBrowserGlobals = globalThis as OnyxBrowserGlobals;

function buildClient(url: string, key: string, browser: boolean) {
  return createClient(url, key, {
    auth: {
      persistSession: browser,
      autoRefreshToken: browser,
      detectSessionInUrl: browser,
    },
    global: { headers: { "X-Client-Info": "onyx-marketplace-web" } },
  });
}

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  if (typeof window === "undefined") return buildClient(url, key, false);
  onyxBrowserGlobals.__onyxSupabaseClient ??= buildClient(url, key, true);
  return onyxBrowserGlobals.__onyxSupabaseClient;
}
