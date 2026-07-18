# Uptime and incidents

## Monitoring

- Cloudflare Pages / DNS uptime for the site origin.
- Optional Sentry (or similar) only when `VITE_SENTRY_DSN` is set — no session replay, no PII, low sample.
- Product analytics (PostHog EU) is not an uptime signal.

## Severity

| Level | Examples | Response |
| --- | --- | --- |
| Critical | Site down, auth broken for all users, wrong daily answers for all 12 lanes | Page owner; roll back Pages deploy; disable ranked writes if needed |
| High | Single mode broken, sync failing widely, moderation queue stuck | Fix forward or roll back within hours |
| Medium | Partial CDN image failures, telemetry outage | Track; local play must keep working |
| Low | Copy / cosmetic | Next release |

## Immediate steps

1. Confirm blast radius (anonymous local play vs signed-in cloud).
2. Post owner maintenance banner via moderation Status controls if needed.
3. Roll back Cloudflare Pages deployment if the regression is front-end.
4. Capture timestamps, affected modes/tastes, and deployment ID — never paste secrets into tickets.

## Communication

Use the in-app status banner for player-facing outages. Keep wording factual and short.
