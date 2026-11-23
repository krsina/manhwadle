# Private files (owner-only)

Put `download.py` and `ids.txt` in this folder. Nothing else here is served.

- This folder is outside `public/`, so Vite never ships it to Cloudflare Pages.
- Its contents (except this README) are gitignored: the repo is public.
- After adding or changing a file, rebuild and redeploy the function:

```
node scripts/build-private-files.mjs
npx supabase functions deploy private-files --project-ref snzhnkcccbxkwerbaido --no-verify-jwt
```
