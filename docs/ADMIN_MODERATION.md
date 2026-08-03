# Administrator and Moderation Guide

## Roles

### Moderator

- Review pending sale and wanted listings
- Inspect full text, metadata, signed images, and narrow explicit/vulgar-image signals
- Approve, remove, or request changes
- Message listing owners through private moderation threads
- Review reports and protected conversation context
- Issue warnings
- Apply and restore timed suspensions for ordinary users

### Administrator

Includes moderator capabilities plus permanent disablement, restoration of banned accounts, and enforcement involving staff accounts.

## Listing workflow

1. Open `/admin` and select Listing review.
2. Verify title, description, price or budget, category, location, condition, and every image.
3. Treat AI findings only as explicit/vulgar-image safety signals, never as title-match or image-quality judgments.
4. Independently decide whether the photo represents the item and request a clearer image when necessary.
5. Approve only when the listing is lawful, understandable, relevant, and sufficiently photographed.
6. Remove with a specific reason when it is prohibited, deceptive, vulgar, explicit, or unsafe.

## Account search

Open **Account enforcement** and use **Search users by public alias**. Search is executed through the protected moderation RPC rather than filtering only the first browser-loaded records. Results are debounced, race-safe, and limited to moderation-visible profile fields. Clear the field to return to the default account list.

## Account actions

Use the least severe effective action:

- Warning: first or low-severity behavior
- 24-hour suspension: immediate cooldown
- 7-day suspension: repeated or meaningful misconduct
- 30-day suspension: serious or persistent misconduct
- Permanent disablement: administrator-only, reserved for severe or repeated abuse

Reasons must be factual, concise, and free of unnecessary personal information. Do not include moderator private details.

## Reports

Move reports through `open`, `reviewing`, `actioned`, and `closed`. Preserve a safety hold when a reported conversation is required for investigation. Do not copy private context into external systems unless authorized and necessary.

## Appeals

A suspended user can read enforcement notices and use moderation messaging for clarification or appeal. Review the original evidence, action history, user response, and consistency with prior cases before changing enforcement.
