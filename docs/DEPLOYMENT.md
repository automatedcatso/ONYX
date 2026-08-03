# Production Deployment

## Prerequisites

- GitHub repository containing the project root
- Vercel project
- Supabase project
- SMTP account capable of sending confirmation and recovery links
- Optional Gemini API key
- Node.js 22.13 or newer for local validation

## 1. Validate the source

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Create `.env.local` from `.env.example`, fill it with the intended deployment values, and run:

```bash
npm run verify:env -- --production
```

On Windows, `MASTER_VERIFY_DEPLOYMENT.bat` runs the complete local release gate.

## 2. Apply Supabase migrations

For a fresh project, run in order:

1. `0001_onyx_core.sql`
2. `0002_vercel_privacy_hardening.sql`
3. `0003_open_email_registration.sql`
4. `0004_marketplace_workflow_and_moderation.sql`
5. `0005_account_enforcement_and_ai_moderation.sql`
6. `0006_distributed_api_rate_limits.sql`
7. `taxonomy.sql`

For an existing v1.1 deployment, apply only migration `0006`, then deploy the v1.2 application. The new application expects the `consume_api_rate_limit` and `prune_api_rate_limits` RPCs.

## 3. Configure authentication

Enable confirmed email/password authentication. Set the Site URL to the canonical production origin. Add the production origin and approved preview origins to Redirect URLs. Keep direct browser signup disabled when the controlled `/api/auth/register` route is the intended registration path.

## 4. Configure Vercel

- Framework: Next.js
- Install command: `npm ci`
- Build command: `npm run build`
- Node.js: 22.x
- Root directory: the directory containing `package.json`

Add every variable documented in `ENVIRONMENT.md`. Production secrets must be limited to the Production environment unless preview access is intentionally enabled.

## 5. Deploy and verify

After deployment:

1. Open `/api/health` and confirm `{ "status": "ok" }`.
2. Register a disposable account and verify the confirmation email.
3. Test password recovery.
4. Submit one sale listing and one wanted request.
5. Confirm both enter moderation as expected.
6. Approve one listing and verify private signed image rendering.
7. Create, message, accept, decline, and cancel offers using separate accounts.
8. Issue a warning and timed suspension from `/admin`.
9. Confirm a suspended user cannot publish, offer, favorite, or send ordinary marketplace messages.
10. Test the assistant greeting and catalog cards; no UUID or Markdown should appear.
11. Inspect the Vercel cron execution after its first scheduled run.

## 6. Promote an administrator

Register the administrator account normally, then execute:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = lower('admin@example.com')
on conflict (user_id, role) do nothing;
```

Sign out and sign in again before opening `/admin`.

## Rollback

Application rollback is performed from Vercel Deployments. Database migrations are forward-only; do not delete columns or tables during an emergency rollback. Restore the previous deployment, disable affected features, and prepare a corrective migration.
