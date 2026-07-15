# Catalog size

Edit [`catalog.config.json`](../catalog.config.json) to change how many titles ship in the game catalog:

```json
{ "topN": 1000, "excludeIds": [31076] }
```

`topN` is the popularity band exported from ETL. `excludeIds` are AniList ids dropped at sync (e.g. titles with no usable publisher).

Then regenerate:

```bash
npm run etl:export:top   # writes manhwadle-etl/output/top-{N}.json
npm run sync-data        # → src/data/manhwa.json (+ blurbs)
npm run sync-pools       # rebuilds Supabase puzzle_pool_entries (needs SUPABASE_SERVICE_ROLE_KEY)
```

Override for one export: `TOP_N=750 npm run etl:export:top`.

After changing pools, clear today’s `daily_puzzles` rows (or truncate that date) and run `select public.ensure_daily_puzzles();` so answers match the new pools.

Summary mode still only picks answers from titles with authored blurbs; Cover/Character use the full top-N catalog.
