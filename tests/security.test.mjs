import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".next", ".vercel", "node_modules"]);
const textExtensions = new Set([".bat", ".css", ".example", ".json", ".md", ".mjs", ".sql", ".ts", ".tsx", ".txt", ".yml"]);

async function walk(directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

test("source tree contains no legacy host adapters or sample records", async () => {
  const files = await walk();
  const relative = files.map((file) => file.slice(root.length + 1));
  const forbiddenPaths = [
    [".", "open", "ai/hosting.json"].join(""),
    ["vi", "te.config.ts"].join(""),
    ["driz", "zle.config.ts"].join(""),
    ["worker", "/index.ts"].join(""),
    "db/schema.ts",
    ["app/", "chat", "gpt-auth.ts"].join(""),
  ];
  for (const path of forbiddenPaths) assert.ok(!relative.includes(path), `${path} must not ship`);

  const forbiddenText = [
    ["seed", "Listings"].join(""),
    ["safe", "Inventory"].join(""),
    ["Folding", " Study Table"].join(""),
    ["Hero", " Sprint Cycle"].join(""),
    ["Induction", " Cooktop + Pan"].join(""),
    ["Warm", " Desk Lamp"].join(""),
    ["Mattress", " + Bedsheet Set"].join(""),
    ["vin", "ext"].join(""),
    ["wrang", "ler"].join(""),
    ["cloud", "flare:workers"].join(""),
    ["chat", "gpt"].join(""),
  ];
  for (const file of files) {
    const extension = file.slice(file.lastIndexOf("."));
    if (!textExtensions.has(extension) || file.endsWith("tests/security.test.mjs")) continue;
    const contents = await readFile(file, "utf8");
    for (const marker of forbiddenText) assert.ok(!contents.toLowerCase().includes(marker.toLowerCase()), `${marker} found in ${file}`);
  }
});

test("personal workstation paths and obvious personal identifiers are absent", async () => {
  const files = await walk();
  const markers = [
    ["/", "work", "space/"].join(""),
    ["/", "Users/"].join(""),
    ["C:", "\\Users\\"].join(""),
    ["gmail", ".com"].join(""),
    ["file", "://"].join(""),
  ];
  for (const file of files) {
    const extension = file.slice(file.lastIndexOf("."));
    if (!textExtensions.has(extension) || file.endsWith("tests/security.test.mjs")) continue;
    const contents = await readFile(file, "utf8");
    for (const marker of markers) assert.ok(!contents.includes(marker), `${marker} found in ${file}`);
  }
});

test("production privacy controls are present", async () => {
  const config = await readFile(join(root, "next.config.ts"), "utf8");
  const packageFile = await readFile(join(root, "package.json"), "utf8");
  const launcher = await readFile(join(root, "MASTER_RUN.bat"), "utf8");
  assert.match(config, /productionBrowserSourceMaps:\s*false/);
  assert.match(config, /Referrer-Policy[\s\S]*no-referrer/);
  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /X-Robots-Tag/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /process\.env\.NODE_ENV === "development"/);
  assert.match(config, /isDevelopment \? \["'unsafe-eval'"\] : \[\]/);
  assert.match(packageFile, /NEXT_TELEMETRY_DISABLED=1/);
  assert.match(packageFile, /next dev --hostname 127\.0\.0\.1 --port 3010/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:3010/);

  const clientSurface = [
    await readFile(join(root, "app/onyx-app.tsx"), "utf8"),
    await readFile(join(root, "lib/supabase-browser.ts"), "utf8"),
  ].join("\n");
  assert.ok(!clientSurface.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(!clientSurface.includes("GEMINI_API_KEY"));
  assert.match(await readFile(join(root, "lib/supabase-server.ts"), "utf8"), /import "server-only"/);

  const browserClient = await readFile(join(root, "lib/supabase-browser.ts"), "utf8");
  assert.match(browserClient, /__onyxSupabaseClient/);
  assert.match(browserClient, /typeof window === "undefined"/);

  const requestSecurity = await readFile(join(root, "lib/request-security.ts"), "utf8");
  assert.match(requestSecurity, /x-forwarded-host/);
  assert.match(requestSecurity, /x-forwarded-proto/);
  assert.match(requestSecurity, /allowedOrigins\.has\(origin\)/);
  assert.match(requestSecurity, /process\.env\.NODE_ENV !== "production"/);

  const maintenance = await readFile(join(root, "app/api/cron/maintenance/route.ts"), "utf8");
  assert.match(maintenance, /timingSafeEqual/);
  const runtimeConfig = await readFile(join(root, "lib/runtime-config.ts"), "utf8");
  assert.match(runtimeConfig, /CRON_SECRET/);
  assert.match(maintenance, /status:\s*401/);

  const assistant = await readFile(join(root, "app/api/assistant/route.ts"), "utf8");
  assert.match(assistant, /auth\.getUser\(accessToken\)/);
  assert.match(assistant, /store:\s*false/);
});

test("all supplied editorial assets are metadata-free WebP files", async () => {
  const names = [
    "gothic-moon-cathedral.webp",
    "cathedral-courtyard.webp",
    "red-sun-temple.webp",
    "onyx-wave.webp",
    "alias-manifesto.webp",
  ];
  for (const name of names) {
    const path = join(root, "public/art", name);
    const details = await stat(path);
    const header = await readFile(path);
    assert.ok(details.size > 10_000 && details.size < 2_000_000, `${name} has an unexpected size`);
    assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(header.subarray(8, 12).toString("ascii"), "WEBP");
    assert.ok(!header.includes(Buffer.from("EXIF")), `${name} contains EXIF metadata`);
    assert.ok(!header.includes(Buffer.from("XMP ")), `${name} contains XMP metadata`);
  }
});

test("registration accepts standard email providers and database writes fail closed", async () => {
  const registration = await readFile(join(root, "app/api/auth/register/route.ts"), "utf8");
  const reset = await readFile(join(root, "app/api/auth/request-reset/route.ts"), "utf8");
  const requestSecurity = await readFile(join(root, "lib/request-security.ts"), "utf8");
  const environmentExample = await readFile(join(root, ".env.example"), "utf8");
  const migration = await readFile(join(root, "supabase/migrations/0002_vercel_privacy_hardening.sql"), "utf8");
  const openRegistration = await readFile(join(root, "supabase/migrations/0003_open_email_registration.sql"), "utf8");
  const client = await readFile(join(root, "app/onyx-app.tsx"), "utf8");
  assert.match(registration, /isTrustedMutationRequest/);
  assert.match(registration, /z\.string\(\)\.trim\(\)\.email\(\)\.max\(254\)/);
  assert.doesNotMatch(registration, /isAllowedEmail|ALLOWED_EMAIL_DOMAINS|approved campus domain/);
  assert.doesNotMatch(reset, /isAllowedEmail|ALLOWED_EMAIL_DOMAINS/);
  assert.doesNotMatch(requestSecurity, /allowedEmailDomains|isAllowedEmail|ALLOWED_EMAIL_DOMAINS/);
  assert.doesNotMatch(environmentExample, /ALLOWED_EMAIL_DOMAINS/);
  assert.doesNotMatch(client, /Campus email|campus\.edu|server-side allowlist/);
  assert.doesNotMatch(migration, /allowed_email_domains|enforce_auth_email_domain|campus_email_required/);
  assert.match(openRegistration, /drop trigger if exists enforce_auth_email_domain_insert/);
  assert.match(openRegistration, /drop trigger if exists enforce_auth_email_domain_update/);
  assert.match(openRegistration, /drop function if exists public\.enforce_auth_email_domain/);
  assert.match(migration, /security definer/gi);
  assert.match(migration, /listing_images_owner_upload/);
  assert.match(migration, /moderator_required/);
  assert.match(migration, /marketplace_events/);
  assert.match(migration, /send_conversation_message/);
  assert.match(migration, /report_private_conversation/);
  assert.match(migration, /alias_change_cooldown/);
  assert.match(migration, /revoke insert, update, delete on public\.messages/);
  assert.ok(!client.includes('.from("messages").insert'));
  assert.ok(!client.includes('.from("reports").insert'));
});

test("marketplace workflows and moderation are wired end to end", async () => {
  const migration = await readFile(join(root, "supabase/migrations/0004_marketplace_workflow_and_moderation.sql"), "utf8");
  const client = await readFile(join(root, "app/onyx-app.tsx"), "utf8");
  const aliasSafety = await readFile(join(root, "lib/alias-safety.ts"), "utf8");
  const registration = await readFile(join(root, "app/api/auth/register/route.ts"), "utf8");

  assert.match(migration, /alter table public\.offers add column if not exists created_by/);
  assert.match(migration, /v_buyer := case when v_listing\.post_type = 'sale' then auth\.uid\(\) else v_listing\.owner_id end/);
  assert.match(migration, /create or replace function public\.open_offer_conversation/);
  assert.match(migration, /create or replace function public\.respond_to_offer/);
  assert.match(migration, /create function public\.get_my_offer_summaries/);
  assert.match(migration, /create table if not exists public\.moderation_threads/);
  assert.match(migration, /create table if not exists public\.moderation_messages/);
  assert.match(migration, /moderation_threads_participants_select/);
  assert.match(migration, /send_listing_moderation_message/);
  assert.match(migration, /insert into public\.notifications/);
  assert.match(migration, /alias_is_allowed/);
  assert.match(migration, /profiles_safe_alias/);

  assert.match(client, /Post wanted request/);
  assert.match(client, /open_offer_conversation/);
  assert.match(client, /respond_to_offer/);
  assert.match(client, /Responses to your wanted posts/);
  assert.match(client, /moderation-gallery/);
  assert.match(client, /Message listing owner/);
  assert.match(client, /get_my_moderation_thread_summaries/);
  assert.doesNotMatch(client, /private:\s*true/);

  assert.match(aliasSafety, /isAllowedAlias/);
  assert.match(aliasSafety, /LEET_MAP/);
  assert.match(aliasSafety, /CONTAINS_BLOCKED/);
  assert.match(registration, /isAllowedAlias/);
});

test("password visibility, account enforcement, and AI-assisted moderation are wired", async () => {
  const client = await readFile(join(root, "app/onyx-app.tsx"), "utf8");
  const imageSafety = await readFile(join(root, "lib/image-safety.ts"), "utf8");
  const contentSafety = await readFile(join(root, "lib/content-safety.ts"), "utf8");
  const preflight = await readFile(join(root, "app/api/moderation/preflight/route.ts"), "utf8");
  const migration = await readFile(join(root, "supabase/migrations/0005_account_enforcement_and_ai_moderation.sql"), "utf8");

  assert.match(client, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(client, /aria-label=\{showPassword \? "Hide password" : "Show password"\}/);
  assert.match(client, /moderate_user_account/);
  assert.match(client, /Account enforcement/);
  assert.match(client, /Disable 7 days/);
  assert.match(client, /Permanent disable/);
  assert.match(client, /Search users by public alias/);
  assert.match(client, /get_moderation_users",\{p_search:query\.trim\(\)\}/);
  assert.match(client, /userSearchBusy/);
  assert.match(client, /record_listing_moderation_preflight/);
  assert.match(client, /\/api\/moderation\/preflight/);
  assert.match(client, /createSignedUrl/);
  assert.doesNotMatch(client, /getPublicUrl/);

  assert.match(contentSafety, /vulgar_or_explicit_text/);
  assert.match(contentSafety, /external_contact_details/);
  assert.match(contentSafety, /behenchod/);
  assert.doesNotMatch(imageSafety, /measureImageQuality/);
  assert.match(imageSafety, /moderationPreview/);
  assert.match(preflight, /explicitConfidence >= 0\.94/);
  assert.match(preflight, /Do not decide whether an image matches a listing title/);
  assert.match(preflight, /Do not assess image quality, lighting, sharpness, composition, item visibility, relevance/);
  assert.doesNotMatch(preflight, /relevance:\s*z\.enum/);
  assert.doesNotMatch(preflight, /itemVisible:\s*z\.boolean/);
  assert.match(preflight, /Human moderators review every submitted listing/i);
  assert.match(preflight, /inlineData/);

  assert.match(migration, /create table if not exists public\.account_moderation/);
  assert.match(migration, /create table if not exists public\.account_moderation_actions/);
  assert.match(migration, /create table if not exists public\.listing_moderation_signals/);
  assert.match(migration, /create or replace function public\.moderate_user_account/);
  assert.match(migration, /create or replace function public\.get_moderation_users/);
  assert.match(migration, /create trigger listings_safe_copy/);
  assert.match(migration, /enforce_active_marketplace_actor/);
  assert.match(migration, /account_suspended/);
  assert.match(migration, /update storage\.buckets set public=false/);
  assert.match(migration, /listing_images_preflight_required/);
  assert.match(migration, /public\.account_can_participate\(auth\.uid\(\)\)/);
});

test("assistant responses are plain-text, greeting-aware, and UUID-safe", async () => {
  const route = await readFile(join(root, "app/api/assistant/route.ts"), "utf8");
  const client = await readFile(join(root, "app/onyx-app.tsx"), "utf8");
  const safety = await readFile(join(root, "lib/assistant-safety.ts"), "utf8");

  assert.match(route, /isGreetingOnly\(parsed\.data\.message\)/);
  assert.match(route, /without internal identifiers/);
  assert.match(route, /Do not use Markdown, bullets, headings, asterisks/);
  assert.doesNotMatch(route, /include an exact listing ID/);
  assert.match(route, /sanitizeAssistantText\(extractText\(interaction\)/);
  assert.match(client, /assistant-match-card/);
  assert.match(client, /sanitizeAssistantText\(rawText\)/);
  assert.match(safety, /UUID_PATTERN/);
  assert.match(safety, /replace\(\/\[\\\\`\*_~\|\]\/g/);
});


test("distributed rate limits and least-privilege assistant reads are wired", async () => {
  const migration = await readFile(join(root, "supabase/migrations/0006_distributed_api_rate_limits.sql"), "utf8");
  const rateLimit = await readFile(join(root, "lib/rate-limit.ts"), "utf8");
  const assistant = await readFile(join(root, "app/api/assistant/route.ts"), "utf8");
  const registration = await readFile(join(root, "app/api/auth/register/route.ts"), "utf8");
  const reset = await readFile(join(root, "app/api/auth/request-reset/route.ts"), "utf8");
  const preflight = await readFile(join(root, "app/api/moderation/preflight/route.ts"), "utf8");
  const maintenance = await readFile(join(root, "app/api/cron/maintenance/route.ts"), "utf8");

  assert.match(migration, /create table if not exists public\.api_rate_limit_buckets/);
  assert.match(migration, /create or replace function public\.consume_api_rate_limit/);
  assert.match(migration, /grant execute on function public\.consume_api_rate_limit[\s\S]*to service_role/);
  assert.match(migration, /revoke all on table public\.api_rate_limit_buckets from public, anon, authenticated/);
  assert.match(rateLimit, /createHmac\("sha256"/);
  assert.match(rateLimit, /x-vercel-forwarded-for/);
  assert.match(rateLimit, /consume_api_rate_limit/);
  assert.match(registration, /scope: "auth-register"/);
  assert.match(reset, /scope: "auth-reset"/);
  assert.match(preflight, /scope: "moderation-preflight"/);
  assert.match(assistant, /scope: "assistant"/);
  assert.match(assistant, /createPublicSupabaseClient/);
  assert.match(assistant, /loadInventory\(createPublicSupabaseClient\(\)\)/);
  assert.match(maintenance, /prune_api_rate_limits/);
});

test("repository governance and release automation are present", async () => {
  const packageFile = await readFile(join(root, "package.json"), "utf8");
  const license = await readFile(join(root, "LICENSE"), "utf8");
  const ci = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
  const security = await readFile(join(root, "SECURITY.md"), "utf8");
  const readme = await readFile(join(root, "README.md"), "utf8");

  assert.match(packageFile, /"version": "1\.2\.1"/);
  assert.match(packageFile, /"license": "MIT"/);
  assert.match(packageFile, /verify:env/);
  assert.match(license, /MIT License/);
  assert.match(ci, /npm run check/);
  assert.match(ci, /npm audit --omit=dev --audit-level=critical/);
  assert.match(security, /private vulnerability reporting/i);
  assert.match(readme, /docs\/DEPLOYMENT\.md/);
  assert.match(readme, /docs\/SECURITY_MODEL\.md/);
});
