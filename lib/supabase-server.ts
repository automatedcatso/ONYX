import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabasePublicConfiguration, supabaseServiceConfiguration } from "@/lib/runtime-config";

const commonOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { "X-Client-Info": "onyx-marketplace-server" } },
} as const;

export function createPublicSupabaseClient() {
  const config = supabasePublicConfiguration();
  if (!config) return null;
  return createClient(config.url, config.publishableKey, commonOptions);
}

export function createServiceSupabaseClient() {
  const config = supabaseServiceConfiguration();
  if (!config) return null;
  return createClient(config.url, config.serviceKey, commonOptions);
}
