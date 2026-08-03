import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const requiredPaths = [
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "SUPPORT.md",
  "MASTER_VERIFY_DEPLOYMENT.bat",
  ".env.example",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/dependabot.yml",
  "docs/README.md",
  "docs/DEPLOYMENT.md",
  "docs/ENVIRONMENT.md",
  "docs/ADMIN_MODERATION.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY_MODEL.md",
  "docs/OPERATIONS_RUNBOOK.md",
  "docs/RELEASE_CHECKLIST.md",
  "supabase/migrations/0006_distributed_api_rate_limits.sql",
];

for (const path of requiredPaths) {
  const details = await stat(join(root, path));
  assert.ok(details.isFile(), `${path} must exist`);
}

const ignored = new Set([".git", ".next", ".vercel", "node_modules"]);
const textExtensions = new Set(["", ".bat", ".css", ".example", ".json", ".md", ".mjs", ".sql", ".ts", ".tsx", ".txt", ".yml"]);

async function walk(directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const secretPatterns = [
  /sb_secret_[A-Za-z0-9_-]{20,}/g,
  /AIza[A-Za-z0-9_-]{25,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /ghp_[A-Za-z0-9]{30,}/g,
  /github_pat_[A-Za-z0-9_]{30,}/g,
];

for (const file of await walk()) {
  if (!textExtensions.has(extname(file)) || file.endsWith("scripts/verify-repository.mjs")) continue;
  const contents = await readFile(file, "utf8");
  for (const pattern of secretPatterns) {
    assert.ok(!pattern.test(contents), `Potential secret detected in ${relative(root, file)}`);
    pattern.lastIndex = 0;
  }
}

const packageFile = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.equal(packageFile.license, "MIT");
assert.match(packageFile.version, /^\d+\.\d+\.\d+$/);
assert.equal(packageFile.repository?.url, "https://github.com/automatedcatso/ONYX.git");

const readme = await readFile(join(root, "README.md"), "utf8");
for (const path of requiredPaths.filter((path) => path.startsWith("docs/"))) {
  assert.ok(readme.includes(path), `README must link to ${path}`);
}

console.log("Repository structure and secret scan passed.");
