# Operations Runbook

## Daily

- Review pending listings and open reports.
- Check Vercel function and cron failures.
- Investigate unusual registration, recovery, assistant, or preflight rate-limit activity.
- Confirm moderation messages are answered.

## Weekly

- Review Dependabot and security alerts.
- Export no user data unless required; review aggregate operational counts instead.
- Check Supabase database, storage, and egress usage.
- Review staff role assignments and remove unnecessary access.
- Test one disposable registration and listing flow.

## Monthly

- Test account deletion and safety-hold behavior.
- Review SMTP deliverability and sender reputation.
- Verify backup and restoration procedures.
- Review moderation consistency and appeal outcomes.
- Rotate credentials when policy requires or access changes.

## Incident: leaked secret

1. Revoke or rotate it at the provider immediately.
2. Update Vercel environment variables.
3. Redeploy Production and any affected Preview environments.
4. Review provider logs for misuse.
5. Remove the secret from Git history when committed; rotation remains mandatory.

## Incident: abusive listing bypass

1. Remove the listing and preserve necessary moderation evidence.
2. Apply proportionate account enforcement.
3. Identify whether the bypass occurred in client validation, API preflight, database checks, or moderator process.
4. Add a regression test and corrective migration when database enforcement is affected.

## Incident: authorization concern

Disable the affected route or revert the application deployment. Do not weaken RLS as a temporary fix. Reproduce against a disposable Supabase project and prepare an additive corrective migration.
