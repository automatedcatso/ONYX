# ONYX v1.2.1 Combined Production Patch

This overlay contains the complete v1.2 production-hardening package plus the v1.2.1 moderation changes. Apply it to an ONYX v1.1 repository.

## Included

- Distributed database-backed API rate limits
- Runtime and environment validation
- CI, CodeQL, Dependabot, issue templates, ownership rules, MIT license, and operational documentation
- Plain-text, UUID-safe assistant behavior
- Narrow image AI that checks only high-confidence pornographic/explicit imagery and clearly readable vulgar or abusive text
- No AI title-image matching, relevance scoring, item-visibility scoring, blur scoring, lighting scoring, or composition scoring
- Server-backed moderator user search by public alias with debounce, latest-request-wins protection, loading state, clear control, and error/empty states

## Database order

If the deployed database is still on v1.1, run this before deploying the code:

```text
supabase/migrations/0006_distributed_api_rate_limits.sql
```

If migration 0006 is already installed, do not run it again. v1.2.1 adds no new migration.

## Apply on Windows

Extract this ZIP directly over the repository root, for example:

```text
D:\dlt pls\ONYX\ONYX-Merged-Moderation-Fixed
```

Choose **Replace the files in the destination**. Do not create a nested patch folder inside the project.

Then run:

```bat
cd /d "D:\dlt pls\ONYX\ONYX-Merged-Moderation-Fixed"
npm test
git status
git add .
git commit -m "Harden ONYX and relax image moderation"
git push origin main
```

Expected source gate:

```text
10 tests passed
Repository structure and secret scan passed
SQL migration checks passed for 6 migrations and 25 RPC references
```

## Vercel

A push to `main` should start a Vercel deployment automatically. No environment-variable change is required. After the deployment becomes Ready, hard-refresh the site with `Ctrl + Shift + R`.

## Verification

1. Submit a legitimate listing photo that is not perfectly framed or does not closely mirror the title wording. It must not be rejected for relevance, lighting, blur, centering, or composition.
2. Sale listings must still include at least one image of at least 240 × 240 pixels.
3. Clearly pornographic imagery or clearly readable vulgar/abusive image text should still be blocked at high confidence.
4. Open `/admin`, choose **Account enforcement**, and search an alias using **Search users by public alias**.
5. Clear the search and confirm the default account list returns.
