# v1.2.1 Image Safety and User Search Patch

## Scope

This patch is designed to be applied together with the v1.2 production-hardening changes.

It changes two workflows:

1. Gemini image moderation is restricted to pornographic/explicit imagery and clearly readable vulgar or abusive text.
2. The moderation dashboard searches accounts server-side by public alias.

## Database requirements

- Fresh deployments: apply migrations `0001` through `0006` in order.
- Existing v1.1 deployments: apply migration `0006` before deploying this code.
- Existing v1.2.0 deployments: no new migration is required.

## Image-moderation behavior

The AI no longer receives or compares the listing title and description. It does not score relevance, item visibility, clarity, brightness, blur, centering, or composition.

A sale listing still requires at least one image, and image decoding still requires a minimum size of 240 × 240 pixels. Human moderators remain responsible for requesting clearer or more relevant photographs.

## Account search behavior

The Account enforcement tab sends the public-alias query to `get_moderation_users`. This avoids limiting searches to whichever 250 accounts happened to be loaded initially. The interface includes:

- 280 ms debounce
- Latest-request-wins race protection
- Loading indicator
- Clear button
- Result count
- Search-specific empty and error states

## Deployment

After applying the combined overlay:

```bash
npm test
git add .
git commit -m "Relax image AI and add moderator user search"
git push origin main
```

No environment-variable change is required.
