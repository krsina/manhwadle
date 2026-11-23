# Private files (owner-only)

Put `download.py` and `ids.txt` in this folder. Nothing else here is served.
Download them from the site: log in as the owner, then Staff → Files.

- This folder is outside `public/`, so Vite never ships it to Cloudflare Pages.
- Its contents (except this README) are gitignored: the repo is public.
- After adding or changing a file, rebuild and redeploy the function:

```
node scripts/build-private-files.mjs
npx supabase functions deploy private-files --remote=snzhnkcccbxkwerbaido --no-verify-jwt --use-api
```

The function needs the `PRIVATE_FILES_OWNER_ID` secret (the owner's user id)
and reuses `CORS_ALLOWED_ORIGINS`.
