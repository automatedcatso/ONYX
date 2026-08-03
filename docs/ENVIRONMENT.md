# Environment Variables

## Complete template

```dotenv
NEXT_PUBLIC_APP_URL=https://your-production-origin.example
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_MODERATION_MODEL=gemini-3.5-flash-lite

CRON_SECRET=
```

## Required variables

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Browser-visible | Canonical origin used for trusted mutations and email redirects |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible | Supabase project origin |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-visible | Browser and least-privilege server reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Controlled auth administration, maintenance, verified-user checks, and rate-limit RPCs |
| `SMTP_HOST` | Server only | Mail server hostname |
| `SMTP_PORT` | Server only | Mail server port |
| `SMTP_SECURE` | Server only | `true` for implicit TLS, commonly port 465; otherwise `false` |
| `SMTP_USER` | Server only | SMTP authentication user |
| `SMTP_PASS` | Server only | SMTP password or app password |
| `SMTP_FROM` | Server only | Verified sender identity |
| `CRON_SECRET` | Server only | Protects `/api/cron/maintenance`; minimum 32 characters |

## Optional variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Enables AI assistant generation and multimodal listing review |
| `GEMINI_MODEL` | Assistant model name |
| `GEMINI_MODERATION_MODEL` | Optional separate moderation model |

Without a Gemini key, deterministic catalog search, text safety, image-quality checks, and human moderation remain available.

## Validation

```bash
npm run verify:env -- --production
```

The validator rejects malformed origins, HTTP production URLs, swapped Supabase keys, invalid SMTP port/TLS combinations, short cron secrets, and placeholder values.

## Secret handling

- Never prefix server secrets with `NEXT_PUBLIC_`.
- Never commit `.env.local` or copy Vercel values into source files.
- Rotate the service key, SMTP password, Gemini key, and cron secret after accidental disclosure.
- Redeploy after any Vercel environment change.
- Restrict preview deployments when production credentials are present.
