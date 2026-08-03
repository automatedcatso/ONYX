# ONYX Campus Marketplace

ONYX is a Vercel-ready Next.js marketplace for verified students. Public activity uses aliases and coarse residence names; email, internal account identifiers, precise location, and contact details are not projected into marketplace pages.

This source contains no sample users, listings, offers, messages, reviews, counts, or fallback sessions. With no Supabase connection it renders an explicit unconfigured state. With an empty database it renders real empty states.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Vercel server functions and standard `next build`
- Supabase Postgres, Auth, Realtime, and Storage
- Nodemailer with configurable SMTP for registration and recovery links
- Optional Gemini assistant grounded only in the active marketplace projection; model calls require a verified session

## Local setup

Requirements: Node.js 22.13+ and npm 10+.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The local server uses `http://127.0.0.1:3010` by default. This dedicated origin prevents a service worker or cached shell from another project previously hosted on `localhost:3000` from appearing as ONYX. Use `npm run dev:lan` only when you intentionally need access from another device on the same trusted network.

On Windows, `MASTER_SETUP.bat` installs the locked dependencies and creates `.env.local` if needed. `MASTER_RUN.bat` starts the same Next.js development server.

If an older app is already visible in a tab at `localhost:3000`, stop ONYX with `Ctrl+C`, close that tab, and run `MASTER_RUN.bat` again. Open only `http://127.0.0.1:3010`. You do not need to delete the older project; the origins are isolated.

If React reports that `eval()` is unavailable while using `npm run dev`, replace `next.config.ts` with the current version and restart the server. If necessary, delete the generated `.next` folder before restarting. The development CSP permits `eval()` only for React and Next.js debugging; optimized production builds and Vercel deployments continue to block it.

## Supabase setup

Use a fresh project and apply these SQL files in order:

1. `supabase/migrations/0001_onyx_core.sql`
2. `supabase/migrations/0002_vercel_privacy_hardening.sql`
3. `supabase/migrations/0003_open_email_registration.sql`
4. `supabase/migrations/0004_marketplace_workflow_and_moderation.sql`
5. `supabase/migrations/0005_account_enforcement_and_ai_moderation.sql`
6. `supabase/taxonomy.sql`

Registration accepts any syntactically valid email address, including personal Gmail and other standard providers. Configure Supabase Auth for confirmed email/password accounts and prevent public client-side account provisioning so `/api/auth/register` remains the only signup path. Add the production and preview callback URLs. The server route creates one-time links and sends them with your SMTP transport. If you already applied an earlier version of migration `0002`, run migration `0003` to remove its legacy institution-domain trigger.

The second migration adds:

- email-confirmed registration and public alias profiles;
- least-privilege grants and row-level policies;
- authenticated RPCs for listings, offers, participant-checked messages, reports, profile changes, inventory, moderation, and deletion requests;
- an 8 MB WebP-only listing image bucket with listing-ownership policies and no user ID in object paths;
- Realtime publication for participant-protected messages and a minimal public listing-change signal.

The browser publish flow decodes, resizes, and re-encodes JPG, PNG, and WebP uploads before storage. This removes embedded EXIF/GPS metadata; the storage bucket rejects other MIME types.

The fourth migration completes the marketplace workflows that the UI expects:

- records the actual offer initiator, fixes buyer/seller roles for wanted posts, and adds accept, decline, cancel, and message actions;
- creates in-app notifications for new offers, offer decisions, private messages, and moderation decisions;
- blocks abusive English aliases and common Hindi abuse written in Latin characters at both registration and database-write boundaries;
- adds private moderation threads so authorized staff can request listing changes and owners can reply without exchanging contact details;
- exposes role-protected moderation summaries while retaining row-level security for listing descriptions, images, reports, and message context.

The fifth migration adds the full moderation command center and enforcement layer:

- warning history, timed suspensions, restoration, and administrator-only permanent disablement;
- database-bound enforcement that pauses listings and blocks suspended accounts from publishing, offering, ordinary messaging, favorites, and image uploads;
- deterministic English and Romanized-Hindi listing-copy checks for obvious vulgarity, sexual content, and off-platform contact details;
- advisory multimodal pre-check signals for explicit imagery, visible abusive wording, image relevance, and basic clarity;
- private listing-image storage with short-lived authorized signed URLs, so pending or removed images are not exposed as public bucket objects;
- human approval for every new listing, with AI uncertainty sent to the queue rather than treated as an automatic violation.

Existing deployments must apply migrations `0004` and `0005` in order before using the updated dashboard and moderation controls. Migration `0005` is sufficient when `0001`–`0004` are already installed.

## Environment variables

Copy `.env.example` to `.env.local` only for local development. Configure production values in Vercel rather than committing an environment file.

Required in production:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `CRON_SECRET` (long random value used by the protected maintenance schedule)

Optional:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_MODERATION_MODEL` (optional separate multimodal listing-review model)

Never prefix service, SMTP, or model keys with `NEXT_PUBLIC_`.

## Deploy to Vercel

1. Put this folder in a private Git repository.
2. Import it in Vercel; the framework should be detected as Next.js.
3. Add environment variables separately for Preview and Production.
4. Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin for each environment.
5. Deploy. Then verify `/api/health`, the protected daily maintenance schedule, registration email, password visibility, recovery email, respectful-alias rejection, sale and wanted publishing, vulgar-copy rejection, image pre-check feedback, private-image rendering, full moderation review, moderator-to-owner messaging, warning and timed-suspension enforcement, offer acceptance/decline/cancellation, reservation creation, and private messaging with disposable test accounts.
6. Use Vercel Deployment Protection for non-public preview environments and add rate limits for auth and assistant endpoints at the firewall layer.

`vercel.json` uses `npm ci` and `npm run build`; there is no alternate worker runtime or host-specific build adapter.

## Security and privacy design

- Production browser source maps are disabled.
- The CSP permits `eval()` only in local development because React's development tooling requires it; production and Vercel responses do not include that permission.
- Framework build and runtime telemetry is disabled in the cross-platform npm scripts.
- The application sends `Referrer-Policy: no-referrer`, CSP, HSTS, frame denial, MIME sniffing denial, restrictive Permissions Policy, and cross-origin isolation headers.
- Search indexing and image indexing are disabled in metadata, `robots.txt`, and response headers.
- Mutation routes require same-origin JSON requests and keep responses out of caches.
- Registration accepts standard email providers while still requiring email confirmation through the configured account provider.
- Registration and recovery use generic responses to reduce account enumeration.
- Gemini keys and Supabase service credentials are server-only. Assistant and moderation model calls require a verified session. Listing image previews are sent only during explicit submission, receive conservative advisory treatment, and never replace human approval.
- Messages, reports, offers, listing state changes, and profile changes pass through checked database functions with participant validation, bounded input, and targeted cooldowns or abuse limits.
- User content is rendered as text. No analytics, advertising SDK, remote tracking pixel, or client error-monitoring SDK is bundled.
- Uploaded source artwork is re-encoded as metadata-free WebP assets. Listing uploads are decoded, resized, and re-encoded in the browser, then stored in a private bucket and rendered through authorized signed URLs.
- The health route returns only `{ "status": "ok" }`.

No internet service can truthfully promise that an operator is untraceable. Vercel, Supabase, SMTP, DNS, Git hosting, and model providers retain account, billing, abuse-prevention, and operational logs under their own policies. Use role-based accounts, a role-based support address, a privacy-protecting domain registrar where lawful, least-privilege access, and provider retention settings. Do not attempt to conceal unlawful activity or evade valid legal process.

## Artwork

The five supplied images are used as editorial hero, trust, wanted-board, auth/seller, and empty-state artwork under `public/art/`. They were resized and re-encoded to WebP with metadata removed. Listing cards never present this editorial artwork as actual merchandise.

## Validation

Run the complete release gate:

```bash
npm run check
npm audit --omit=dev
```

The gate runs ESLint, strict TypeScript, security/source-integrity tests, and an optimized production build. Before a real launch, add integration tests against a disposable Supabase project for registration, confirmation, upload, moderation, cross-account authorization denial, offers, message membership, blocking, and account deletion.

## Source map

```text
app/onyx-app.tsx                         Product UI and real-data states
app/api/auth/                            Server-side registration and recovery
app/api/assistant/route.ts               Read-only, inventory-grounded assistant
app/api/moderation/preflight/route.ts    Authenticated text/image advisory pre-check
lib/alias-safety.ts                      English and Romanized-Hindi alias safety checks
lib/content-safety.ts                    Balanced listing-copy rules and result merging
lib/image-safety.ts                      Metadata removal, resizing, and quality preview
lib/marketplace.ts                       Safe public marketplace projection
lib/request-security.ts                  Same-origin and allowlist controls
supabase/migrations/0001_onyx_core.sql   Core schema and RLS baseline
supabase/migrations/0002_vercel_privacy_hardening.sql
supabase/migrations/0003_open_email_registration.sql
supabase/migrations/0004_marketplace_workflow_and_moderation.sql
supabase/migrations/0005_account_enforcement_and_ai_moderation.sql
supabase/taxonomy.sql                    Residence/category reference data only
public/art/                              Metadata-free editorial WebP assets
vercel.json                              Vercel build configuration
```
