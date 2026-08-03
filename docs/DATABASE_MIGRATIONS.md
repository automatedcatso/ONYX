# Database Migrations

## Rules

- Migrations are immutable after production deployment.
- Add a new sequential migration for every schema or policy change.
- Wrap every migration in `begin;` and `commit;`.
- Explicitly grant and revoke table and function privileges.
- Use `security definer` only when necessary and set a fixed `search_path`.
- Test cross-account denial, moderator access, and service-role-only functions in a disposable project.

## Current order

| Migration | Purpose |
|---|---|
| `0001` | Core marketplace schema |
| `0002` | Privacy, RLS, storage, checked RPCs, deletion lifecycle |
| `0003` | Standard email registration cleanup |
| `0004` | Offers, wanted roles, notifications, moderation threads, alias protection |
| `0005` | Account enforcement, private images, listing text/image moderation |
| `0006` | Distributed API rate-limit buckets and maintenance pruning |

`taxonomy.sql` installs categories and coarse locations after schema migrations.

## Migration 0006

The application consumes independent HMAC buckets for the route identity and network hint. Only the digests are stored, so changing email addresses does not bypass the network limit and changing networks does not bypass the identity limit. The table is inaccessible to anonymous and authenticated roles; only the service role can execute the atomic consume and prune functions.

Deploy migration `0006` before v1.2 application code. Registration, recovery, and moderation preflight intentionally fail closed if the database throttle RPC is unavailable.

## Verification

```bash
npm run test:sql
```

This checks migration ordering, transaction wrappers, dollar-quote balance, frontend RPC references, and service-role-only grants for rate limiting.
