# Moderation incidents

## Roles

- **Owner**: grant/revoke roles, permanent bans, act on moderators.
- **Moderator**: force rename, temporary cloud bans, leaderboard exclusions within policy.

Browser UI is a convenience only — every privileged action rechecks private DB state.

## Incident flow

1. Capture report / appeal id and username (not emails in public notes).
2. Apply the least-restrictive action that stops harm.
3. Record a mandatory reason and expiry when temporary.
4. Confirm the audit log entry exists.
5. For false positives: revoke restriction and note the appeal outcome.

## Ban evasion

Person-level evasion with alternate identities cannot be guaranteed. Document limits honestly; do not deploy device fingerprinting or raw IP retention for this purpose.

## Contact

Appeals may also arrive via the configured contact address (`src/lib/siteContact.ts`). Keep that address real before launch — CI `check:contact` fails on the placeholder.
