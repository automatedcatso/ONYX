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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || key.startsWith("sb_secret_")) return null;

  try {
    const parsed = new URL(url);
    const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && parsed.protocol === "http:")) return null;
  } catch {
    return null;
  }

  if (typeof window === "undefined") return buildClient(url, key, false);
  onyxBrowserGlobals.__onyxSupabaseClient ??= buildClient(url, key, true);
  return onyxBrowserGlobals.__onyxSupabaseClient;
}
