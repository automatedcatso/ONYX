# Changelog

All notable changes are recorded here. Versions follow Semantic Versioning.

## 1.2.1 — 2026-08-04

### Changed

- Narrowed Gemini image moderation to high-confidence pornographic imagery and clearly readable vulgar, abusive, hateful, or sexually explicit text.
- Removed AI title-image matching, item-relevance scoring, photo-quality scoring, lighting checks, blur checks, and composition judgments.
- Kept the sale-photo requirement and minimum image dimensions, while leaving clarity and relevance decisions to human moderators.
- Upgraded Account enforcement search to query moderation-visible accounts server-side by public alias, with debounce, loading state, clear control, empty state, and race-safe results.
- Updated listing and moderator copy so users understand that AI is a narrow safety screen rather than a product-photo judge.

## 1.2.0 — 2026-08-04

### Added

- Distributed, database-backed API throttling for registration, recovery, assistant, and moderation-preflight routes.
- Independent HMAC-only identity and network rate-limit buckets that never store raw email, account, network, token, or user-agent values.
- Environment, repository, migration, and secret-scanning verification scripts.
- GitHub CI, CodeQL, dependency review, Dependabot, issue templates, pull-request template, and CODEOWNERS.
- Production documentation for deployment, environment variables, architecture, moderation, security, operations, troubleshooting, and releases.
- MIT license and project governance files.

### Changed

- Assistant inventory reads now use the public Supabase client rather than the elevated service client.
- SMTP and runtime configuration are centrally validated and fail closed when malformed.
- Cron maintenance prunes expired API-throttle buckets.
- Security headers explicitly disable the obsolete browser XSS auditor.

## 1.1.0 — 2026-08-03

- Made assistant responses greeting-aware, plain-text, and resistant to UUID, Markdown, JSON, and internal-reference leakage.
- Rendered marketplace matches as application-controlled listing cards.

## 1.0.0 — 2026-08-03

- Merged marketplace source and security patch.
- Completed offers, wanted listings, messaging, notifications, moderation threads, account enforcement, private listing images, and balanced AI-assisted moderation.
