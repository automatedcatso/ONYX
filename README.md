# ONYX Campus Marketplace

ONYX is a production-oriented, pseudonymous campus marketplace built with Next.js, Vercel, and Supabase. Students can sell items, post wanted requests, exchange offers, message privately, and complete local handovers. Listings remain human-moderated, with deterministic safety rules and optional AI assistance.

## Core capabilities

- Sale listings and wanted posts
- Offer accept, decline, cancel, and private conversation flows
- Public aliases with English and Romanized-Hindi abuse protection
- Private listing images with signed access
- Human moderation with owner correction threads
- Warnings, timed suspension, restoration, and administrator-only permanent disablement
- Deterministic text safety and narrow explicit/vulgar-image screening
- Plain-text assistant responses with application-controlled listing cards
- Database-backed, cross-instance API rate limiting
- Account deletion jobs and reported-thread safety holds

## Technology

- Next.js 16, React 19, TypeScript
- Supabase Auth, Postgres, RLS, RPC, Realtime, and Storage
- Vercel functions and cron
- Nodemailer over configurable SMTP
- Optional Gemini assistant and multimodal moderation

## Start locally

Requirements: Node.js 22.13+ and npm 10+.

```bash
npm ci
cp .env.example .env.local
npm run verify:env
npm run dev
```

Windows launchers are included:

```text
MASTER_SETUP.bat
MASTER_RUN.bat
MASTER_VERIFY_DEPLOYMENT.bat
```

`MASTER_VERIFY_DEPLOYMENT.bat` runs the production source, environment, lint, TypeScript, and build gates before release.

Local ONYX runs at `http://127.0.0.1:3010`.

## Database setup

Apply these files in order to a fresh Supabase project:

1. `supabase/migrations/0001_onyx_core.sql`
2. `supabase/migrations/0002_vercel_privacy_hardening.sql`
3. `supabase/migrations/0003_open_email_registration.sql`
4. `supabase/migrations/0004_marketplace_workflow_and_moderation.sql`
5. `supabase/migrations/0005_account_enforcement_and_ai_moderation.sql`
6. `supabase/migrations/0006_distributed_api_rate_limits.sql`
7. `supabase/taxonomy.sql`

Existing v1.1 deployments need migration `0006` before deploying v1.2 or v1.2.1. No additional migration is required when upgrading from v1.2.0 to v1.2.1.

## Environment

Copy `.env.example` locally and configure the same values in Vercel. Required production values are:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
SMTP_FROM
CRON_SECRET
```

Gemini variables are optional. Run:

```bash
npm run verify:env -- --production
```

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for exact requirements.

## Validation

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The source tests verify privacy controls, marketplace and moderation wiring, assistant sanitization, repository structure, secret scanning, migration order, and frontend RPC coverage.

## Documentation

- [Documentation index](docs/README.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Database migrations](docs/DATABASE_MIGRATIONS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Administrator and moderation](docs/ADMIN_MODERATION.md)
- [AI moderation](docs/AI_MODERATION.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Operations runbook](docs/OPERATIONS_RUNBOOK.md)
- [Testing](docs/TESTING.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Legal review checklist](docs/LEGAL_REVIEW_CHECKLIST.md)
- [v1.2 hardening patch](docs/V1_2_HARDENING_PATCH.md)
- [v1.2.1 image-safety and account-search patch](docs/V1_2_1_IMAGE_SAFETY_AND_USER_SEARCH.md)

## Repository governance

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Support](SUPPORT.md)
- [Changelog](CHANGELOG.md)
- [MIT License](LICENSE)

GitHub Actions runs the complete release gate. CodeQL, dependency review, Dependabot, issue templates, protected security reporting, pull-request checks, and CODEOWNERS are included.

## Security notes

The browser never receives the Supabase service key, SMTP password, Gemini key, or cron secret. User mutations are enforced by RLS and checked database functions. Pending images remain private. API rate-limit buckets store only independent HMAC digests, not raw network or account identifiers. AI output is untrusted, sanitized, advisory, and limited to explicit/vulgar image screening; human moderators decide clarity and relevance.

No hosted service can guarantee anonymity from infrastructure providers or valid legal process. Use least-privilege operator accounts, protect provider credentials, review retention settings, and obtain legal and campus-policy review before launch.
