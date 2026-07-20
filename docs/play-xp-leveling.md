# Play XP & leveling

Lifetime shop points earned (`user_point_balances.lifetime_earned`) are the player’s XP. Level **1–99** is derived from that total (client + server helpers agree). Spending shop points does **not** reduce level.

Authoritative award rules live in migration `20260718240000_rebalance_play_xp.sql`. Client mirrors: `src/lib/playerLevel.ts`.

## Awards (per UTC day)

| Source | Amount | Notes |
|--------|--------|--------|
| Correct mode solve | **100** | Same for every mode. Losses / surrenders grant **0**. |
| First-try (`guess_count = 1`) | **+3** | Added to the solve award before streak mult. |
| Golden solve | **+3** | First-try + correct bonus character name, via `complete_bonus_name_with_reward`. |
| All-modes day | **+16** | Once when all required modes are complete (`all_modes_day` ledger). |

**Streak multiplier** on play awards: `min(1.5, 1 + 0.05 * max(0, any_current_streak - 1))` (1.0× on day 1, caps at **1.5×** by streak 11+).

**Skill stack (no streak):** four normal solves = **400**. Four first-try + golden solves + all-modes bonus = **440** (**+10%**).

Achievement / milestone shop rewards still increment `lifetime_earned` but are **not** limited by the daily play-XP cap.

## Level curve

Days to advance from level `n`:

```text
n = 1..2  → 1 day
n = 3..4  → 2 days
n = 5     → 3 days
n ≥ 6     → max(3, round(sqrt(n) * 1.15))
```

Sum for levels 1→99 ≈ **748 days (~2.05 years)**.

XP thresholds are the cumulative play XP of a consistent player who clears all four modes every day (base + all-modes bonus) with streak ramp:

```text
dayXp(streak) = floor(400 * mult) + floor(16 * mult)
threshold(L)  = total XP after sum(daysToAdvance(1..L-1)) such days
```

## Level timeline

Assumes daily all-mode clears with streak (no first-try / golden gravy).

| Level | Calendar day | Lifetime XP |
|------:|-------------:|------------:|
| 2 | 1 | 416 |
| 3 | 2 | 852 |
| 4 | 4 | 1,786 |
| 5 | 6 | 2,805 |
| 6 | 9 | 4,488 |
| 10 | 21 | 11,955 |
| 20 | 65 | 39,411 |
| 30 | 122 | 74,979 |
| 40 | 190 | 117,411 |
| 50 | 267 | 165,459 |
| 60 | 352 | 218,499 |
| 70 | 443 | 275,283 |
| 80 | 543 | 337,683 |
| 90 | 649 | 403,827 |
| 99 | 748 | 465,603 |

Early pacing: day 1 reaches level 2; day 2 reaches level 3; later levels take progressively more days.

## Daily anticheat cap

Play sources only: `daily_completion`, `bonus_name`, `all_modes_day`.

Before awarding, server reads the player’s level from current `lifetime_earned`, then:

```text
cap = clamp(ceil(xpToAdvance(level) * 1.25), 478, 759)
```

- **478** ≈ 1.15× day-1 all-mode XP  
- **759** ≈ 1.15× streak-capped max skill day (660)

If today’s play XP already spent plus the new award would exceed `cap`, only the remainder is granted (metadata includes `capped`, `daily_cap`, `daily_play_xp`).

## Glossary

- **Golden solve** — first-try series win + correct bonus character name (also called double-solve in UI).
- **All-modes day** — every required mode completed for the UTC date.
