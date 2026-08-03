# Architecture

## Components

### Browser

The Next.js client renders a server-projected public marketplace feed, performs authenticated Supabase mutations, preprocesses listing images, and supplies bearer tokens to protected server routes. It never receives the service-role key, SMTP credentials, Gemini key, or cron secret.

### Vercel / Next.js

Server routes handle controlled registration, recovery email, the sanitized public marketplace projection, active-listing-checked image delivery, assistant generation, multimodal moderation preflight, liveness, and protected maintenance. Same-origin JSON checks protect mutations.

### Supabase

- Auth: confirmed accounts and sessions
- Postgres: listings, offers, conversations, notifications, reports, moderation, enforcement, deletion jobs, and rate limits
- RLS/RPC: authorization boundary for user actions
- Storage: private listing images; only the server creates short-lived upstream reads after checking the listing is public
- Realtime: participant-protected message updates and minimal marketplace change signals

### SMTP

Security emails are generated server-side with one-time Supabase links and delivered through the configured SMTP provider.

### Gemini

Optional. The assistant receives the user request and only matched catalog fields without IDs. Listing moderation receives the submitted title, description, and explicit image previews. Model storage is disabled where supported; output is sanitized or treated as advisory structured data.

## Trust boundaries

1. Browser input is untrusted.
2. Server routes validate shape, size, origin, authentication, suspension state, and rate limits.
3. Database functions re-check ownership, participant membership, role, cooldowns, and account status.
4. Moderator decisions are human actions recorded in database history.
5. Provider credentials remain server-only.

## Least privilege

Public assistant inventory reads use the publishable Supabase client. The service client is otherwise limited to explicit server projections and privileged operations: the public marketplace route selects only active-view fields and image identifiers, the image route re-checks that active view before reading Storage, and auth administration, maintenance, and rate-limit RPCs remain server-only.

## Data flow: listing submission

1. Browser validates fields and preprocesses images into metadata-free WebP.
2. Protected preflight evaluates deterministic copy and quality rules.
3. Optional Gemini review returns advisory signals.
4. Browser records the preflight and uploads to private storage.
5. Listing remains pending until a moderator approves it.
6. The browser requests a same-origin image URL. The server verifies the image belongs to a currently active marketplace-view row, creates a short-lived upstream Storage read, and streams the WebP response.
