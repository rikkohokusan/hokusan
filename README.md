# Hokusan Insights Dashboard

Login-protected web dashboard for three audiences:

- **`/pulse`** — weekly X-ray for Rikko: big numbers, WoW trends, anomalies.
- **`/queue`** *(Phase 2)* — live outreach queue for the sales team.
- **`/campaigns`** *(Phase 2)* — segment briefs for marketing.

**Live URL:** <https://hokusan-dashboard.pages.dev>

## Stack

- Next.js 15 (App Router, edge runtime) + TypeScript + Tailwind
- Supabase — Postgres for weekly snapshots, Supabase Auth for login
- Cloudflare Pages for hosting (`@cloudflare/next-on-pages` adapter)
- GitHub Actions for weekly sync (Monday 07:00 America/Toronto → `weekly_snapshots`)
- Pipedrive + Shopify read from live APIs at request time

## Architecture

Three layers:

1. **Data layer** — Supabase Postgres. `weekly_snapshots` stores aggregate metrics for trend analysis. `outcomes_log` (Phase 2) stores reorder/graduation/reactivation events.
2. **Sync layer** — `scripts/sync-weekly.mjs`, run weekly by GitHub Actions. Pulls Shopify + Pipedrive, upserts one row into `weekly_snapshots`.
3. **Frontend** — Next.js on Cloudflare Pages. Reads `weekly_snapshots` via Supabase (authenticated, RLS-gated). Reads Pipedrive live for current-state views.

## One-time setup Rikko must do

The CI/CD is wired, but three things require Rikko's hand because they can only be done with UI auth or DB-owner privileges:

### 1. Apply the schema

Open the Supabase SQL editor:
<https://supabase.com/dashboard/project/rnvmswyzimbjfuynoyen/sql/new>

Paste the contents of [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql), run.

**Verify** by running from this directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://rnvmswyzimbjfuynoyen.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d= -f2) \
node scripts/test-roundtrip.mjs
```

Expect `✓ Supabase roundtrip healthy.`

### 2. Paste the real anon key into Cloudflare Pages env

Open Supabase → Project Settings → API:
<https://supabase.com/dashboard/project/rnvmswyzimbjfuynoyen/settings/api>

Copy the **anon / public** key (starts with `eyJ…` legacy JWT, or `sb_publishable_…` new format).

Set it in Cloudflare Pages:

```bash
CLOUDFLARE_API_TOKEN=... wrangler pages secret put NEXT_PUBLIC_SUPABASE_ANON_KEY --project-name=hokusan-dashboard
# paste the key when prompted
```

Or via the Cloudflare dashboard:
<https://dash.cloudflare.com/8a4a78874402825862cc9feee7f2e143/pages/view/hokusan-dashboard/settings/environment-variables>

Currently the value is the placeholder `PLACEHOLDER_REPLACE_WITH_ANON_KEY` — login will fail until this is real.

### 3. (Optional) Enable Google OAuth in Supabase

<https://supabase.com/dashboard/project/rnvmswyzimbjfuynoyen/auth/providers> → Google → Enable → paste client ID + secret from Google Cloud Console.

Until this is enabled, the "Continue with Google" button errors. The email magic-link flow works with just Supabase's built-in email sender and is enough for MVP sign-in.

Add redirect URL in Google + Supabase auth settings:

- `https://hokusan-dashboard.pages.dev/auth/callback`
- `http://localhost:3000/auth/callback` (for dev)

## Run locally

```bash
cp .env.example .env.local    # paste the real NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev                   # http://localhost:3000
```

## Deploy

```bash
# From dashboard/
npm run pages:build
CLOUDFLARE_API_TOKEN=... wrangler pages deploy .vercel/output/static --project-name=hokusan-dashboard --branch=main
```

Or shortcut: `npm run pages:deploy` (wraps the above).

Compatibility flag `nodejs_compat` is required and already set on the project. Compatibility date: `2025-01-15`.

## Weekly sync job

The GitHub Actions workflow at `.github/workflows/sync-weekly.yml` runs every Monday 11:00 UTC (= 07:00 EDT summer / 06:00 EST winter).

Required secrets in the repo settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PIPEDRIVE_API_TOKEN`, `PIPEDRIVE_DOMAIN`
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_API_VERSION`

Trigger manually from the GitHub Actions UI or:

```bash
gh workflow run "Weekly insights sync"
```

Dry-run locally:

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
PIPEDRIVE_API_TOKEN=... SHOPIFY_ACCESS_TOKEN=... \
npm run sync:weekly:dry
```

## File layout

```
dashboard/
  src/
    app/
      layout.tsx                  Root layout, global CSS
      page.tsx                    / → redirect to /pulse or /login
      login/page.tsx              Magic-link + Google OAuth form
      login/LoginForm.tsx         Client component (uses useSearchParams)
      auth/callback/route.ts      OAuth code + magic-link verification
      auth/signout/route.ts       POST /auth/signout
      pulse/page.tsx              Weekly pulse — MVP complete
      queue/page.tsx              Stub — Phase 2
      campaigns/page.tsx          Stub — Phase 2
    components/
      Nav.tsx                     Top bar
      BigNumber.tsx               KPI card with WoW delta
      TrendChart.tsx              Inline SVG sparkline
    lib/
      supabase/server.ts          Server + service-role client
      supabase/client.ts          Browser client
      supabase/middleware.ts      Session refresh + email allowlist
      pipedrive.ts                Org enrichment + open deal reads
      shopify.ts                  Orders rollup
  middleware.ts                   Next.js middleware entry
  supabase/migrations/0001_init.sql
  scripts/
    sync-weekly.mjs               Weekly snapshot writer
    test-roundtrip.mjs            One-shot Supabase write→read→delete
  .github/workflows/sync-weekly.yml
  wrangler.toml                   Cloudflare Pages config (nodejs_compat)
  next.config.mjs
  tailwind.config.ts
  tsconfig.json
  .env.example
```

## Where the keys live

- Dev: `.env.local` (gitignored)
- Production: Cloudflare Pages → Settings → Environment Variables. Type `secret_text` for anything sensitive (already set for Supabase service role, Pipedrive, Shopify).
- CI (sync job): GitHub Actions secrets. See list above.

Canonical source: `/Users/rikkoosaki/.claude/settings.json` (local-only) — do not commit.

## Further reading

- `DECISIONS.md` — why we deviated from the brief where we did
- `/Users/rikkoosaki/Documents/Hokusan_AI/CLAUDE.md` — operator context
- `/Users/rikkoosaki/Documents/Hokusan_AI/.claude/context/data-model.md` — lifecycle vocabulary, custom-field definitions
- `/Users/rikkoosaki/Documents/Hokusan_AI/.claude/context/playbooks.md` — account-health math and anomaly thresholds
