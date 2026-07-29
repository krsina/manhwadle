# Daily puzzle incidents

Production expects **4 modes × 3 tastes = 12** shared daily lanes.

## Edge Function auth (`select-daily-puzzles`)

- Platform `verify_jwt = false` in `supabase/config.toml` (required): callers use **custom cron auth**, not a user JWT.
- Set hosted secret `CRON_SECRET`. Invoke with `x-cron-secret: <secret>` or `Authorization: Bearer <CRON_SECRET>` (service role bearer also accepted).
- Do not call this function from the browser. See [deployment.md §6](../deployment.md#6-hosted-auth--edge-function-settings-dashboard--secrets).

## Verify today’s rows

1. Confirm `daily_puzzles` has 12 rows for today’s UTC date.
2. Check Edge Function `select-daily-puzzles` logs for fail-closed errors.
3. Confirm puzzle pools are non-empty for each lane (`sync-pools` / pool SQL).

## Common failures

| Symptom | Likely cause | Mitigation |
| --- | --- | --- |
| Mode shows empty / error | Missing lane row or pool | Re-run selection for that date after fixing pool |
| Wrong title | Bad seed / stale client cache | Confirm server row; hard-refresh; do not rewrite history casually |
| Guest sees Manhwa #0 / correct title rejected | Pre-guest-answer_id play state + ambiguous fingerprint | Confirm `get_daily_play_state` returns `answer_id` for anon; hard-refresh |
| Heardle clip dead | YouTube removal / region | Leave fallback UI; schedule replacement only for future days |
| Character image missing | CDN / crop URL | Client shows fallback; fix catalog offline |

## Rules

- Do not silently rewrite past archive answers players already saw.
- Prefer forward fixes for future UTC days.
- Keep anonymous local play working even when cloud selection fails.
