import process from "node:process";

const errors = [];
const warnings = [];
const production = process.argv.includes("--production") || process.env.NODE_ENV === "production";

function value(name) {
  return String(process.env[name] ?? "").trim();
}

function required(name) {
  const current = value(name);
  if (!current) errors.push(`${name} is missing.`);
  if (/YOUR_|REPLACE|CHANGEME|EXAMPLE/i.test(current)) errors.push(`${name} still contains a placeholder.`);
  return current;
}

function parseUrl(name, current, { httpsOnly = false, originOnly = false } = {}) {
  if (!current) return null;
  try {
    const parsed = new URL(current);
    const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if (httpsOnly && parsed.protocol !== "https:" && (production || !local)) errors.push(`${name} must use HTTPS except for local development.`);
    if (production && !local && parsed.protocol !== "https:") errors.push(`${name} must use HTTPS in production.`);
    if (originOnly && parsed.pathname !== "/") errors.push(`${name} must be an origin without a path.`);
    if (originOnly && (parsed.search || parsed.hash)) errors.push(`${name} must not include query parameters or a fragment.`);
    return parsed;
  } catch {
    errors.push(`${name} is not a valid URL.`);
    return null;
  }
}

const appUrl = required("NEXT_PUBLIC_APP_URL");
parseUrl("NEXT_PUBLIC_APP_URL", appUrl, { originOnly: true });

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
parseUrl("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl, { httpsOnly: true, originOnly: true });

const publishable = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const service = required("SUPABASE_SERVICE_ROLE_KEY");
if (publishable && service && publishable === service) errors.push("Supabase publishable and service keys must be different.");
if (publishable.startsWith("sb_secret_")) errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains a secret key.");
if (service.startsWith("sb_publishable_")) errors.push("SUPABASE_SERVICE_ROLE_KEY contains a publishable key.");

const smtpHost = required("SMTP_HOST");
const smtpPort = Number(required("SMTP_PORT"));
const smtpSecure = required("SMTP_SECURE");
required("SMTP_USER");
required("SMTP_PASS");
required("SMTP_FROM");
if (smtpHost && /\s/.test(smtpHost)) errors.push("SMTP_HOST must not contain spaces.");
if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) errors.push("SMTP_PORT must be an integer from 1 to 65535.");
if (!/^(true|false)$/.test(smtpSecure)) errors.push("SMTP_SECURE must be true or false.");
if (smtpPort === 465 && smtpSecure !== "true") errors.push("SMTP_SECURE must be true when SMTP_PORT is 465.");
if (smtpPort === 587 && smtpSecure === "true") warnings.push("Port 587 normally uses SMTP_SECURE=false with STARTTLS.");

const cronSecret = required("CRON_SECRET");
if (cronSecret && cronSecret.length < 32) errors.push("CRON_SECRET must contain at least 32 characters.");

const geminiKey = value("GEMINI_API_KEY");
for (const modelName of ["GEMINI_MODEL", "GEMINI_MODERATION_MODEL"]) {
  const model = value(modelName);
  if (model && !/^[A-Za-z0-9._-]{2,120}$/.test(model)) errors.push(`${modelName} contains invalid characters.`);
}
if (!geminiKey) warnings.push("GEMINI_API_KEY is empty; AI assistance and multimodal moderation will use deterministic fallbacks.");

if (errors.length) {
  console.error("ONYX environment validation failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length) {
    console.error("\nWarnings:");
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log("ONYX environment validation passed.");
for (const warning of warnings) console.warn(`Warning: ${warning}`);
