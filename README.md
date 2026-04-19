# Hokusan Insights Dashboard

Live at https://hokusan-dashboard.pages.dev

For architecture, file map, secrets, known gotchas, and open loops, read:
- `/Users/rikkoosaki/Documents/Hokusan_AI/.claude/context/dashboard.md` (topology for agents)
- `/Users/rikkoosaki/Documents/Hokusan_AI/.claude/context/playbooks.md` (business logic)

## Quick commands

```bash
npm install
npm run dev                                 # localhost:3000
npm run build                               # Next build
npx @cloudflare/next-on-pages               # edge build
wrangler pages deploy .vercel/output/static --project-name=hokusan-dashboard --branch=main

# Manual sync runs (needs env vars from .env.local):
npm run sync:weekly:dry                     # print would-write, don't upsert
npm run sync:weekly                         # live upsert to Supabase
node scripts/sync-pipedrive-enrichment.mjs  # refresh 11 custom fields on every wholesale org
node scripts/test-roundtrip.mjs             # Supabase sanity check
```

## Stack

Next.js 15 App Router (edge runtime) · Supabase Postgres + Auth · Cloudflare Pages (`@cloudflare/next-on-pages`) · GitHub Actions (daily enrichment + weekly snapshot) · Pipedrive + Shopify live.
