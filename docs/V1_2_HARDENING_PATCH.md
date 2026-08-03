# v1.2 Hardening Patch

## Upgrade order

1. Back up the current repository and confirm the latest v1.1 deployment is healthy.
2. Apply `supabase/migrations/0006_distributed_api_rate_limits.sql` in Supabase SQL Editor.
3. Overlay the v1.2 patch files into the project root.
4. Run `npm test`.
5. Run `npm run verify:env -- --production` with the deployment variables available.
6. Commit and push to `main`.
7. Confirm Vercel CI and deployment succeed.
8. Test registration, recovery, moderation preflight, assistant, and the maintenance cron.

The database migration must be applied before the application deployment. Registration, recovery, and moderation preflight fail closed when the distributed rate-limit RPC is missing.

## Environment changes

No new environment variable is introduced. Existing `CRON_SECRET` must contain at least 32 characters. The patch uses the server-only Supabase service key as the HMAC key for non-reversible rate-limit bucket digests.

## Git commands

```bash
git status
npm test
git add .
git commit -m "Harden ONYX production deployment and documentation"
git push origin main
```

## Supabase verification

```sql
select to_regclass('public.api_rate_limit_buckets') as rate_limit_table;
select to_regprocedure('public.consume_api_rate_limit(text,integer,integer)') as consume_rpc;
select to_regprocedure('public.prune_api_rate_limits()') as prune_rpc;
```

All three results should be non-null.

## Post-deployment checks

- `/api/health` returns only `{"status":"ok"}`.
- Repeated valid registration attempts eventually receive a controlled limit response.
- Recovery remains generic whether or not the account exists.
- Assistant catalog cards work without raw IDs or Markdown.
- Moderation preflight returns clear retry guidance after its limit.
- The maintenance cron completes and removes old throttle buckets.
