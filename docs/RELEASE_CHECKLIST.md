# Release Checklist

## Source

- [ ] Version and changelog updated
- [ ] Migration order documented
- [ ] No secrets or private data in the diff
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Critical dependency audit passes

## Database

- [ ] Backup or recovery point confirmed
- [ ] New migrations tested in a disposable project
- [ ] Grants and RLS reviewed
- [ ] Cross-account denial tested
- [ ] Roll-forward correction plan understood

## Deployment

- [ ] Environment validation passes
- [ ] Production URL and redirects match
- [ ] Preview deployments do not expose production secrets unintentionally
- [ ] Health route succeeds
- [ ] Cron succeeds
- [ ] Registration and recovery email succeed

## Marketplace

- [ ] Sale and wanted posts work
- [ ] Moderation text and images render
- [ ] Offers and messages work for both post types
- [ ] Suspensions are enforced at database boundaries
- [ ] Assistant emits plain text and cards without internal IDs

## Operations

- [ ] Administrator account verified
- [ ] Moderator access reviewed
- [ ] Support and private security reporting paths active
- [ ] Legal and campus policy review current
