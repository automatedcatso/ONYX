# Security Model

## Protected assets

- Account credentials and email addresses
- Service, SMTP, Gemini, and cron secrets
- Private messages and reports
- Pending and removed listing images
- Moderator identity and enforcement history
- Database integrity and marketplace authorization

## Primary threats

- Cross-account data access
- Direct database calls that bypass the interface
- Account enumeration and email abuse
- Automated assistant and image-preflight abuse
- Prompt injection and model-output leakage
- Vulgar aliases and listing content
- Explicit or vulgar images
- Moderator misuse
- Secret disclosure and unsafe preview deployments

## Controls

- Confirmed authentication and generic auth responses
- Same-origin JSON mutation checks
- Strict input and payload limits
- RLS and checked `security definer` RPCs
- Database account-enforcement triggers and functions
- Private Storage with same-origin image delivery that re-checks the active public listing projection
- Distributed HMAC-keyed identity and network rate limits
- Plain-text rendering and assistant sanitization
- AI advisory-only workflow
- Security headers, no source maps, no tracking SDK
- Auditable moderation and deletion jobs
- CI, CodeQL, dependency review, repository secret scan

## Residual risk

No deployment is invulnerable. Provider accounts and logs, compromised administrator accounts, incorrect manual configuration, malicious dependencies, model errors, social engineering, and jurisdiction-specific obligations require operational controls beyond source code.

## Incident priorities

1. Contain access and disable affected features.
2. Rotate exposed credentials.
3. Preserve necessary logs and evidence without broad copying.
4. Patch authorization or migration defects.
5. Notify affected operators and users when required.
6. Record the root cause and preventative action.
