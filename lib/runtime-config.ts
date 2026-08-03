import "server-only";

function nonEmpty(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validHttpOrigin(value: string | undefined) {
  const normalized = nonEmpty(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && url.protocol === "http:")) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function validSupabaseOrigin(value: string | undefined) {
  const normalized = nonEmpty(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && url.protocol === "http:")) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function publicApplicationOrigin() {
  return validHttpOrigin(process.env.NEXT_PUBLIC_APP_URL);
}

export function supabasePublicConfiguration() {
  const url = validSupabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = nonEmpty(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!url || !publishableKey) return null;
  if (publishableKey.startsWith("sb_secret_")) return null;
  return { url, publishableKey };
}

export function supabaseServiceConfiguration() {
  const publicConfig = supabasePublicConfiguration();
  const serviceKey = nonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!publicConfig || !serviceKey) return null;
  if (serviceKey === publicConfig.publishableKey || serviceKey.startsWith("sb_publishable_")) return null;
  return { url: publicConfig.url, serviceKey };
}

export function smtpConfiguration() {
  const host = nonEmpty(process.env.SMTP_HOST);
  const user = nonEmpty(process.env.SMTP_USER);
  const pass = nonEmpty(process.env.SMTP_PASS);
  const from = nonEmpty(process.env.SMTP_FROM);
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true";
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (port === 465 && !secure) return null;
  return { host, user, pass, from, port, secure };
}

export function cronSecret() {
  const value = nonEmpty(process.env.CRON_SECRET);
  return value && value.length >= 32 ? value : null;
}
