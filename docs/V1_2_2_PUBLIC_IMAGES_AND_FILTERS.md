# v1.2.2 Public Images and Marketplace Filters

## Problem corrected

The v1.2.1 browser loaded public listing rows and image metadata directly through the visitor Supabase client, then requested signed Storage URLs in that same session. A policy or signing failure could therefore produce a valid listing with a blank image for other accounts while the owner still saw it. The filter state also mixed category names and slugs, treated Nearby as Whole campus, and allowed the Wanted route to inherit a stale sale-only filter.

## Public image flow

1. The browser loads `/api/marketplace`.
2. The server uses an explicit service-side projection of `marketplace_listings`, public reputation, and image identifiers only.
3. The response contains same-origin `/api/listing-images/<image-id>` URLs, never Storage paths.
4. The image route verifies the image belongs to a row still present in `marketplace_listings`.
5. Only then does the server create a two-minute upstream Storage URL and stream the image.
6. The browser displays a branded fallback instead of a blank black panel when an image request fails.

Pending, rejected, removed, sold-out, and expired listings are absent from the public view and therefore fail the image-route check.

## Filter corrections

- Wanted pages are always wanted-only regardless of previous browse state.
- Category links use stable slugs; legacy category-name URLs remain accepted.
- Search covers title, description, public seller alias, category, residence, condition, and post type.
- My block uses the signed-in profile residence.
- Nearby uses coarse residence clusters rather than the entire campus.
- Specific-residence, condition, minimum price, maximum price, and negotiable-only filters are supported.
- Reset clears search, scope, category, condition, price, negotiable, and browse post type.
- Filter badges and result counts reflect the active state.

## Deployment

No database migration or new environment variable is required. The existing `SUPABASE_SERVICE_ROLE_KEY` remains server-only and is required by the controlled public feed and image routes. Deploy the code, then hard-refresh or clear the old service worker cache.

## Verification

Use two different accounts and one signed-out/incognito browser:

1. Approve a listing with an image.
2. Confirm the owner, another user, and signed-out visitor all see the same image on the home feed, browse grid, and detail page.
3. Open `/api/marketplace` and verify the listing uses `/api/listing-images/` URLs.
4. Test category, condition, price, negotiable, Wanted, My block, Nearby, exact residence, search, and Reset.
5. Pause or remove the listing and confirm its image URL returns `404` after the browser cache expires.
