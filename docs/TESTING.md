# Testing

## Source gate

```bash
npm test
```

Runs security/source checks, repository structure and secret scanning, and migration/RPC validation.

## Full release gate

```bash
npm run check
npm audit --omit=dev --audit-level=critical
```

The full gate runs ESLint, strict TypeScript, source tests, and an optimized production build.

## Environment gate

```bash
npm run verify:env -- --production
```

## Required integration scenarios

Use a disposable Supabase project and separate test accounts:

- Registration and confirmation
- Recovery and password update
- Invalid and abusive aliases
- Sale and wanted listing creation
- Deterministic and AI moderation outcomes
- Private image upload and signed access
- Cross-account listing, offer, message, and report denial
- Offer accept, decline, cancel, and conversation creation
- Moderator messages and owner replies
- Warning, timed suspension, restoration, and permanent disablement
- Account deletion and reported-thread safety hold
- Rate-limit exhaustion and reset
- Assistant greeting, search cards, and UUID/Markdown suppression
