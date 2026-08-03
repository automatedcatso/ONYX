# Security Policy

## Supported version

Security fixes are maintained for the current `main` branch and the latest tagged release.

## Private reporting

Use GitHub private vulnerability reporting for this repository. Include the affected route or database object, reproduction steps, impact, and a minimal proof of concept. Do not include real user data, credentials, private messages, or explicit imagery.

Do not disclose a suspected vulnerability publicly until the maintainer has investigated and a fix is available.

## Response process

The maintainer should acknowledge a complete report, reproduce it in an isolated environment, assign severity, prepare a patch and migration when required, rotate affected credentials, review provider logs, and publish a concise advisory after remediation.

## Security boundaries

- Vercel executes the web and API layer.
- Supabase controls authentication, database authorization, Realtime, and object storage.
- SMTP delivers security links.
- Gemini is optional and receives only explicit assistant input or listing previews during pre-moderation.

Provider account compromise, leaked service keys, incorrect RLS, malicious moderators, and unsupported local modifications are outside the guarantees of the unmodified source. See `docs/SECURITY_MODEL.md`.
