# Troubleshooting

## Registration is not configured

Validate `NEXT_PUBLIC_APP_URL`, Supabase keys, and all SMTP variables. Run `npm run verify:env -- --production`, then redeploy.

## Registration or moderation returns 429 immediately

Confirm migration `0006_distributed_api_rate_limits.sql` is installed. Old test buckets can be cleared with the service-role-only prune function or by waiting for the configured window. Do not disable throttling in production.

## Registration or moderation returns 503 after v1.2

The distributed rate-limit RPC is missing or inaccessible. Apply migration `0006` and confirm the service key is correct.

## Confirmation link opens the wrong host

Correct `NEXT_PUBLIC_APP_URL`, Supabase Site URL, and Redirect URLs. Redeploy after changing Vercel variables.

## Images fail to render

Open `/api/marketplace` and confirm the listing includes one or more `/api/listing-images/<image-id>` URLs. Then open one image URL directly. A `404` means the image metadata is missing or the listing is not currently public; a `503` means the service key or Supabase connection is unavailable. Confirm `SUPABASE_SERVICE_ROLE_KEY`, the private `listing-images` bucket, migration `0005`, and the `listing_images` metadata row. The browser no longer signs Storage URLs itself.

## Assistant shows no AI response

A missing Gemini key, unverified session, model failure, or rate limit causes deterministic fallback behavior. Catalog search should still function without raw IDs.

## Admin access denied

Verify the account has `admin` or `moderator` in `public.user_roles`, then sign out and sign in again.

## Vercel cron returns 401

Set a 32+ character `CRON_SECRET` in Production and redeploy. Vercel must send it as a Bearer token.

## CI dependency review fails

Inspect the dependency diff and advisory. Do not suppress a high-severity finding without documenting reachability, mitigation, and a follow-up upgrade.
