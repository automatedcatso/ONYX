# Contributing

## Development requirements

- Node.js 22.13 or newer
- npm 10 or newer
- A disposable Supabase project for integration work

## Workflow

1. Create a branch from `main`.
2. Keep migrations additive and numbered; never edit an already deployed migration to change production state.
3. Do not commit environment files, service credentials, user exports, production screenshots, or real marketplace content.
4. Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` before opening a pull request.
5. Describe database changes, rollback considerations, privacy effects, and moderator-facing behavior in the pull request.

## Code standards

- Keep service-role operations in server-only modules.
- Use RLS and checked RPCs for user mutations.
- Render user and model content as text, not HTML.
- Preserve generic authentication responses where account enumeration is possible.
- Treat AI results as advisory; human moderation remains authoritative.
- Add or update tests for every security-sensitive behavior.

## Database changes

Create the next sequential file under `supabase/migrations/`. Wrap it in `begin;` and `commit;`, use `if not exists` where safe, explicitly revoke grants, and document deployment order in `docs/DATABASE_MIGRATIONS.md`.

## Reporting vulnerabilities

Do not open a public issue for a suspected vulnerability. Follow `SECURITY.md`.
