# Daily puzzle incidents

Production expects **4 modes × 3 tastes = 12** shared daily lanes.

## Verify today’s rows

1. Confirm `daily_puzzles` has 12 rows for today’s UTC date.
2. Check Edge Function `select-daily-puzzles` logs for fail-closed errors.
3. Confirm puzzle pools are non-empty for each lane (`sync-pools` / pool SQL).

## Common failures

| Symptom | Likely cause | Mitigation |
| --- | --- | --- |
| Mode shows empty / error | Missing lane row or pool | Re-run selection for that date after fixing pool |
| Wrong title | Bad seed / stale client cache | Confirm server row; hard-refresh; do not rewrite history casually |
| Heardle clip dead | YouTube removal / region | Leave fallback UI; schedule replacement only for future days |
| Character image missing | CDN / crop URL | Client shows fallback; fix catalog offline |

## Rules

- Do not silently rewrite past archive answers players already saw.
- Prefer forward fixes for future UTC days.
- Keep anonymous local play working even when cloud selection fails.
