# ONYX merge and repair report

## Merge decision

Both supplied archives were extracted and compared path-by-path and content-by-content. They contain the same application structure and the same 40 files. Only three files differ:

- `lib/request-security.ts`
- `lib/supabase-browser.ts`
- `tests/security.test.mjs`

`ONYX-Vercel-Source (1)(1).zip` contains the stronger versions: forwarded-origin validation for Vercel/proxy requests, a singleton browser Supabase client that avoids duplicate GoTrue instances, and tests covering both controls. It was therefore used as the base. The second archive did not contain a broader dashboard or marketplace patch to merge.

## Repaired product workflows

### Offers and buyer messaging

- Added a true `created_by` field to offers so incoming/outgoing direction no longer depends on a sale-only buyer/seller assumption.
- Corrected buyer and seller assignment for wanted posts.
- Added dashboard controls to message, accept, decline, or cancel an offer.
- Accepting an offer creates/reuses the private conversation and navigates directly to it.
- Sale acceptance reserves sale stock; wanted acceptance reserves the wanted request as matched.
- Added in-app notifications for offer creation, acceptance, decline, and cancellation.

### Selling versus buying dashboard

- Separated owned sale listings from owned wanted requests.
- Added distinct `Selling` and `Buying & wanted` views.
- Added `List item to sell` and `Post wanted request` actions directly in the dashboard header.
- Added wanted-request status, budget, close, pause, and resume controls.
- Added separate cards for responses to wanted posts, offers sent, and saved active items.

### Private messaging

- Fixed the wanted-post conversation role inversion.
- Added `open_offer_conversation` so either offer participant can message from the dashboard.
- Removed the unsupported private Realtime channel option that could prevent message subscriptions without separate Realtime authorization setup.
- Added message auto-scroll, route-aware conversation selection, terminal-state composer locking, and notification creation on new messages.
- Combined marketplace and moderation threads in the private inbox without exposing contact details.

### Alias safety

- Added shared alias validation in `lib/alias-safety.ts`.
- Blocks common abusive English aliases and common Hindi abuse written in Latin characters.
- Normalizes basic leetspeak, separators, punctuation, and repeated-character evasion.
- Enforces the rule in the registration UI, registration API, profile settings, database trigger, profile RPC, and new-user trigger.
- Existing disallowed aliases are replaced with a deterministic non-identifying alias and the user receives an in-app notification.

### Moderation

- The moderator queue now displays the full description, all listing images, category, residence, condition, price/budget, post type, owner alias, time, and status.
- Moderators can write a custom approval/removal audit note rather than using a hard-coded reason.
- Added private moderation threads. Moderators can request changes and listing owners can reply from Messages.
- Added a reports view with report details and authorized conversation context.
- Added reviewing, actioned, and closed report states with audit-log entries and reporter notifications.
- Moderation data remains protected by role checks and row-level security.

## Adjacent defects fixed

- Offer notifications and private-message notifications existed in the UI but were rarely created by the database; the relevant RPCs now create them.
- Wanted-post offers previously appeared in the wrong direction because direction was inferred from buyer/seller role; it now follows the real initiator.
- A closed/completed/cancelled/expired conversation could still show an active composer; it is now locked.
- The browser Supabase client remains a singleton to prevent duplicate authentication clients.
- Vercel forwarded host/protocol validation from the stronger archive was retained.
- A duplicate TypeScript field introduced during the first moderation refactor was removed, and heterogeneous admin query results now have explicit row types.

## Database deployment

Apply the files in this order:

1. `supabase/migrations/0001_onyx_core.sql`
2. `supabase/migrations/0002_vercel_privacy_hardening.sql`
3. `supabase/migrations/0003_open_email_registration.sql`
4. `supabase/migrations/0004_marketplace_workflow_and_moderation.sql`
5. `supabase/taxonomy.sql`

An existing deployment that already has migrations 0001–0003 only needs migration 0004, followed by a new Vercel deployment of this source.

## Validation completed

- Compared every archive entry and every differing file.
- Parsed all 19 TypeScript/TSX files with the TypeScript compiler: no syntax failures.
- Ran a strict internal UI type pass with external framework modules stubbed: no internal type failures after fixes.
- Cross-checked every UI RPC call against SQL function definitions: 18 used, 18 defined.
- Cross-checked every UI table/view reference against the schema: no missing schema objects.
- Searched the source for unresolved `TODO`, `FIXME`, `HACK`, `debugger`, and `console.log` markers: none found.
- Ran all six source-integrity/security tests successfully.

The full `npm run check` production gate could not be completed in this sandbox because its npm registry mirror does not contain some locked public packages. This is an environment dependency-fetch failure, not a source test failure. Run `npm ci && npm run check` on the deployment machine or in Vercel, where the public npm registry is available. Live authorization and transaction behavior should also be exercised against a disposable Supabase project before production launch.


# Moderation and account-enforcement upgrade

## Password visibility repair

The password icon was previously decorative and the input remained permanently `type="password"`. It is now an accessible button that toggles between masked and visible text, exposes `aria-pressed`, and works for sign-in, registration, and recovery-password entry.

## Moderation command center

The `/admin` route now provides three operational workspaces:

1. **Listing review** — full copy, every authorized image, listing facts, automated advisory signals, approve/remove decisions, and private change requests to the owner.
2. **Safety reports** — report details, protected conversation context where applicable, and reviewing/actioned/closed states.
3. **Account enforcement** — alias search, account state, warnings, listings, reports, required reasons, 24-hour/7-day/30-day suspensions, restoration, administrator-only permanent disablement, and immutable action history.

Moderators can warn and temporarily suspend ordinary accounts. Permanent disablement and action against staff accounts require the `admin` role. Users retain sign-in access to read the reason, notifications, and private moderation messages; marketplace writes are blocked at the database boundary.

## Balanced listing pre-moderation

New submissions pass through:

- deterministic text checks for obvious English and Romanized-Hindi vulgarity, explicit sexual solicitation, and off-platform contact details;
- client-side image decode/re-encode, minimum dimensions, metadata removal, and basic dark/washed-out/blurry checks;
- optional server-side Gemini multimodal review for clear pornographic imagery, visible abusive text, item relevance, and image clarity;
- mandatory human moderation before any listing becomes active.

The thresholds are intentionally conservative. Clear violations require changes. Uncertain AI results are marked `manual_review`, not rejected. Ambiguous standalone terms that can be legitimate product wording are not automatically blocked without explicit context.

## Image privacy and bypass resistance

Migration `0005` changes `listing-images` to a private bucket. Active marketplace pages, owners, and moderators receive short-lived signed URLs only when storage policies authorize access. Pending and removed images are therefore not exposed as permanent public-bucket URLs.

Image uploads require all of the following:

- an authenticated, non-suspended owner;
- a pending listing owned by that account;
- a recorded preflight decision of `allow` or `manual_review`;
- WebP format under the configured size limit.

The database still treats automated results as advisory and requires human approval.

## Deployment upgrade

For an existing ONYX database already running migrations `0001`–`0004`, execute:

```text
supabase/migrations/0005_account_enforcement_and_ai_moderation.sql
```

Then configure or confirm these Vercel variables and redeploy:

```text
GEMINI_API_KEY                 optional; without it deterministic rules and human review remain active
GEMINI_MODERATION_MODEL        optional separate multimodal model
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

A fresh database must apply `0001`, `0002`, `0003`, `0004`, `0005`, then `taxonomy.sql`.

## Additional validation

- Parsed all 20 TypeScript/TSX files with the TypeScript compiler: no syntax failures.
- Cross-checked 24 frontend RPC calls against SQL function definitions: all 24 exist.
- Cross-checked all 18 frontend table/view/storage references: no missing schema objects.
- Structurally validated migration `0005` dollar quoting and parenthesis balance.
- Ran all seven source-integrity/security tests successfully, including password visibility, moderation UI wiring, account enforcement, private signed images, preflight attachment, and suspended-upload denial.

The complete `npm run check` gate still requires a normal public npm registry. This sandbox's incomplete registry mirror did not install the locked Next.js toolchain, so a production build was not claimed here. Run `npm ci && npm run check` locally or through Vercel after applying the migration.
