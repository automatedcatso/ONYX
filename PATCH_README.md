# ONYX v1.2.2 Patch

This overlay is intended for ONYX v1.2.1. It includes the public image-delivery repair and complete marketplace-filter correction.

## Apply

Extract this archive directly over the repository root and replace existing files. Do not create a nested folder.

```bat
cd /d "D:\dlt pls\ONYX\ONYX-Merged-Moderation-Fixed"
npm test
git status
git add .
git commit -m "Fix public listing images and marketplace filters"
git push origin main
```

No Supabase migration or new environment variable is required. `SUPABASE_SERVICE_ROLE_KEY` must already exist in Vercel as a server-only Production variable.

## Verify

1. Wait for Vercel to report Ready.
2. Hard-refresh with Ctrl+Shift+R.
3. Open `/api/marketplace`; active listings with photos should contain `/api/listing-images/` URLs.
4. Test the same listing while signed in as its owner, as another user, and in an incognito window.
5. Test Wanted, category, condition, price, negotiable, My block, Nearby, specific residence, search, and Reset filters.
