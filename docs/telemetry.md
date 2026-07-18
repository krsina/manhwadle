# Telemetry

Manhwadle uses a **two-tier** privacy model:

| Tier | Vendor | Purpose | Consent |
|------|--------|---------|---------|
| Essential / cookieless | **Cloudflare Web Analytics** (when `VITE_CF_WEB_ANALYTICS_TOKEN` is set) | Traffic counts and Core Web Vitals | Not gated by the product-analytics banner. Public beacon token only — no project secrets in the client. |
| Product (sparse) | **PostHog EU** (`https://eu.i.posthog.com`) | Allowlisted milestone events | **Default deny** until the user grants product analytics consent. Honors Global Privacy Control as denial (no override). |

**Marketing / advertising consent is separate** and remains denied; it is not granted by the product-analytics banner or Settings toggle.

Supabase holds player state and verified leaderboard facts. **Do not** use Supabase as a raw analytics event lake.

## Environment

```bash
# PostHog EU — omit both to keep product telemetry a full no-op
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://eu.i.posthog.com

# Cloudflare Web Analytics public beacon token (cookieless essential tier)
VITE_CF_WEB_ANALYTICS_TOKEN=
```

## PostHog configuration

When env + consent are present, the client initializes PostHog with:

- Explicit `capture()` only
- Autocapture, automatic pageviews/pageleaves, dead clicks, rageclicks **off**
- Session replay / DOM capture **off**
- Surveys disabled via event filtering
- `person_profiles: 'never'`
- Sensitive automatic properties stripped (`$current_url`, `$ip`, emails, etc.)
- No persistent analytics identity before consent (SDK is not initialized until grant)

On withdrawal or GPC denial the client calls `opt_out_capturing()` + `reset()`.

## Event contract

Only these events may be sent. Properties are TypeScript-constrained and runtime-sanitized.

| Event | Properties |
|-------|------------|
| `taste_selected` | `taste`: action \| romance \| both |
| `mode_selected` | `mode`, `entry_source`: home \| switcher \| direct \| legacy \| settings \| unknown |
| `route_view` | `route`: normalized allowlisted path only (`/`, `/settings`, `/play/:mode`, …) |
| `round_started` | `mode`, `taste`, `hard_mode` |
| `abandonment_checkpoint` | `mode`, `taste`, `progress_bucket` (guess buckets only) |
| `round_completed` | `mode`, `taste`, `outcome`, `surrendered`, `guess_bucket`, `hint_bucket`, `duration_bucket`, `hard_mode` |
| `bonus_result` | `mode`, `correct` |
| `result_share` | `success`, `method`: clipboard \| share \| unknown |
| `auth_prompt` / `auth_start` / `auth_complete` | `provider_category`: email \| oauth \| unknown |
| `next_round_started` | `mode`, `taste` |
| `ad_slot_viewable` | `slot_id` (schema reserved; not used until ads ship) |
| `performance_sample` | `kind`: cwv_proxy (sampled) |

**Do not emit** per-guess or per-reveal events.

### Forbidden data

Never collect: email, OAuth identity, UUID / user ids, tokens, raw guesses or search text, titles / character names, precise location, fingerprints, clipboard or share content, full URLs / query strings, or free-form app state.

## Sampling, caps, retention, cost

- **Round completions:** 100% sample initially (`ROUND_COMPLETION_SAMPLE_RATE = 1`).
- **Performance samples:** 5–10% (`PERFORMANCE_SAMPLE_RATE = 0.08`).
- **Client caps:** session-wide and per-event caps in `src/lib/telemetry.ts` (hard stop before vendor spend spikes).
- **Retention:** keep raw product events **60–90 days** in PostHog; prefer aggregates afterward.
- **Billing:** set PostHog project billing caps / alerts in the EU project; Cloudflare Web Analytics is the low-cost traffic tier.
- **Batching:** rely on the PostHog SDK queue; do not open a parallel event pipeline.

## Consent UX

- `ConsentBanner` asks only for **product analytics**.
- Settings → Privacy lets users grant or withdraw; withdrawal resets PostHog.
- `navigator.globalPrivacyControl === true` → product analytics denied; banner hidden.

## Implementation map

- `src/lib/consent.ts` — consent + GPC
- `src/lib/telemetry.ts` — allowlist, sanitize, caps, PostHog
- `src/lib/cloudflareAnalytics.ts` — dynamic beacon inject
- `src/lib/useRoundTelemetry.ts` — round lifecycle (StrictMode-safe abandon)
- `src/components/ConsentBanner.tsx` / `TelemetryBootstrap.tsx`
