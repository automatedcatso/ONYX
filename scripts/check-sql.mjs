import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const migrationDirectory = join(root, "supabase", "migrations");
const migrationNames = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
assert.deepEqual(migrationNames, [
  "0001_onyx_core.sql",
  "0002_vercel_privacy_hardening.sql",
  "0003_open_email_registration.sql",
  "0004_marketplace_workflow_and_moderation.sql",
  "0005_account_enforcement_and_ai_moderation.sql",
  "0006_distributed_api_rate_limits.sql",
]);

let sql = "";
for (const name of migrationNames) {
  const contents = await readFile(join(migrationDirectory, name), "utf8");
  if (name === "0006_distributed_api_rate_limits.sql") {
    assert.match(contents, /\bbegin\s*;/i, `${name} must begin a transaction`);
    assert.match(contents, /\bcommit\s*;/i, `${name} must commit its transaction`);
  }
  const dollarQuotes = contents.match(/\$\$/g)?.length ?? 0;
  assert.equal(dollarQuotes % 2, 0, `${name} has unbalanced dollar quotes`);
  sql += `\n${contents}`;
}

const sourceFiles = [
  "app/onyx-app.tsx",
  "app/api/assistant/route.ts",
  "app/api/cron/maintenance/route.ts",
  "lib/rate-limit.ts",
];
const source = (await Promise.all(sourceFiles.map((name) => readFile(join(root, name), "utf8")))).join("\n");
const rpcNames = [...source.matchAll(/\.rpc\(\s*["']([a-z0-9_]+)["']/gi)].map((match) => match[1]);
const missing = [...new Set(rpcNames)].filter((name) => !new RegExp(`function\\s+public\\.${name}\\s*\\(`, "i").test(sql));
assert.deepEqual(missing, [], `RPC functions missing from migrations: ${missing.join(", ")}`);

assert.match(sql, /revoke all on function public\.consume_api_rate_limit[\s\S]*from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.consume_api_rate_limit[\s\S]*to service_role/i);
assert.match(sql, /alter table public\.api_rate_limit_buckets enable row level security/i);

console.log(`SQL migration checks passed for ${migrationNames.length} migrations and ${new Set(rpcNames).size} RPC references.`);
