# Build decisions — dashboard phase 1

Points where I deviated from the brief, or where judgment was required, with the reasoning. A review log, not a design doc.

## Auth: Google OAuth + email magic-link, not Google-only

The brief calls for Google OAuth. Supabase's Google provider is currently **disabled** on project `rnvmswyzimbjfuynoyen` (verified via `/auth/v1/settings`: `"google": false`). Enabling it requires setting up an OAuth client in Google Cloud Console and pasting credentials into the Supabase dashboard — a Rikko-only action.

Rather than block on this, the login page offers both:

1. "Continue with Google" button (wired; works the instant Rikko enables the provider)
2. Email magic-link fallback (works immediately using Supabase's built-in email sender — no additional setup)

Both flows land at `/auth/callback`, which handles both `code` (OAuth) and `token_hash` (magic link). The allowlist enforcement is identical — `@hokusan.ca` required on the email claim regardless of provider.

## Supabase schema applied by hand, not via `supabase db push`

The only Supabase token available in `settings.json` is `sb_secret_4CiG…` — the new-format **service-role / secret-key**. That token works for PostgREST data CRUD but is rejected by the Supabase Management API (`"JWT could not be decoded"`) and by the `supabase` CLI (`Invalid access token format. Must be like sbp_0102…1920`). DDL therefore can't be scripted from this session.

The migration SQL is checked in at `supabase/migrations/0001_init.sql`. Rikko applies it once via the Studio SQL editor (30 seconds of copy/paste). After that, the service-role key is sufficient for all write paths.

If Rikko creates a `sbp_…` personal access token (Supabase → Account → Access Tokens), the workflow can be moved to `supabase db push` in CI for zero-touch migrations.

## RLS model: authenticated reads; service role for sync writes

Only authenticated users with `@hokusan.ca` email can read `weekly_snapshots` or `outcomes_log`. The sync job writes via the service-role key (bypasses RLS). No anon role access anywhere.

Applied two layers of allowlist enforcement:
- `jwt() ->> 'email' ilike '%@hokusan.ca'` in the RLS policy
- Next.js middleware + per-page server redirect (defense in depth against middleware failures under Cloudflare `fail_open: true`)

The per-page guard matters: when the anon key is a placeholder (as it is right now), the middleware's Supabase call throws, and Cloudflare serves the origin response. Without the per-page guard, `/pulse` would leak Pipedrive data to unauthenticated visitors. With it, unauth'd visitors always redirect to `/login`.

## Sync cron: 11:00 UTC instead of America/Toronto wall clock

GitHub Actions cron is UTC-only. I picked `0 11 * * MON`, which is:
- **07:00 EDT** during summer (Mar – Nov) — matches the brief exactly
- **06:00 EST** during winter — one hour earlier than the brief

Acceptable drift for a weekly aggregation job. The window the script computes (`prior Mon 00:00 → Sun 23:59 America/Toronto wall clock`) is DST-aware, so the data is always correct; only the job trigger time shifts.

## Chart: inline SVG sparkline, no chart library

The brief allows Tremor, Recharts, or inline SVG. Picked inline SVG (~40 lines in `TrendChart.tsx`) because:
- Adds zero bundle weight to a worker under 1MB edge budget
- Phase 1 needs exactly one chart — not worth a dependency
- Matches the "Tufte-adjacent — big numbers, small charts" brief instruction

Phase 2 (if the queue/campaigns views need more chart types) can swap in Recharts.

## Cloudflare Pages + @cloudflare/next-on-pages, not OpenNext

The adapter printed a deprecation warning recommending OpenNext. `@cloudflare/next-on-pages` still works cleanly with Next.js 15.4.11 (the version resolved to after patching CVE-2025-66478) and produces a worker under Cloudflare's size limits. OpenNext is a migration for Phase 2 — not a Phase 1 blocker.

All routes are edge-runtime (`export const runtime = 'edge'`). `nodejs_compat` flag set; required by the Supabase client.

## `weekly_snapshots` schema: kept it simple

Took the brief's columns verbatim, added `raw_data jsonb` so the sync job can stash its computation window / source metadata for later auditability without needing a migration. No enums beyond `outcome_type` (for `outcomes_log`). Indexes only on `week_start` and `outcomes_log.created_at` — the access patterns are "read last N weeks" and "read recent outcomes."

## Did NOT build in Phase 1

Followed the brief:
- No admin panel
- No team management
- No mobile view tuning
- No outcome mutation flows (the `outcomes_log` table is created but no UI writes to it yet)
- No dark mode
- No granular role model (every `@hokusan.ca` user has equal access)

## Open questions for Rikko

1. **Dormant-reactivated definition** — the sync job currently counts orgs with `order_count >= 4` that ordered in the week AND are currently cadence-status `Warm`. This is an approximation (true "reactivation" needs a prior snapshot to diff against). Acceptable for MVP, or do you want a stricter definition (e.g., orgs whose cadence flipped `Dormant` → `Warm`)?

2. **Niju DTC vs wholesale in Shopify rollup** — the `ordersRollup` currently counts every order. Wholesale-only would require filtering by `customer.tags contains "Wholesale"`. Brief says the pulse is B2B, so this should probably filter. Easy change once confirmed.

3. **Google OAuth priority** — magic-link works today. Is enabling Google OAuth this week's priority, or next? Instructions are in `README.md`.

4. **Custom domain** — the live URL is `hokusan-dashboard.pages.dev`. Want to bind it to something like `insights.hokusan.ca`? One `wrangler pages domain add` away.
