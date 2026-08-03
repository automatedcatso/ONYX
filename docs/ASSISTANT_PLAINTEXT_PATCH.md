# ONYX Assistant Plain-Text and Identifier-Leak Patch

This patch fixes assistant responses that exposed Markdown markers such as `**`, raw listing UUIDs, generic catalog dumps, and repetitive disclaimers.

## Included changes

- Greetings are handled locally and do not trigger a marketplace search.
- Internal listing IDs are never sent to Gemini.
- The assistant is explicitly restricted to plain text without Markdown, JSON, tables, code fences, or internal references.
- A server-side sanitizer strips UUIDs, Markdown markers, HTML-like tags, raw JSON wrappers, and internal reference labels.
- The client sanitizes assistant text again before rendering.
- Matching listings are rendered as clickable cards; IDs remain internal.
- Catalog searches run only when the request is actually about finding or browsing an item.
- A regression test protects the new behavior.

## Apply to an existing Git checkout

From the ONYX repository root:

```bat
git apply ONYX-Assistant-Plaintext-Fix.patch
git status
git add app/api/assistant/route.ts app/onyx-app.tsx app/globals.css lib/assistant-safety.ts tests/security.test.mjs docs/ASSISTANT_PLAINTEXT_PATCH.md
git commit -m "Fix assistant formatting and listing ID leaks"
git push origin main
```

If you use the patch ZIP instead, extract it into the repository root and allow it to overwrite existing files, then run the `git add`, `git commit`, and `git push` commands above.

No new environment variables or Supabase migrations are required.
