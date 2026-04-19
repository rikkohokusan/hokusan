# Decisions

Short-form log of non-obvious choices. For comprehensive context see
`/Users/rikkoosaki/Documents/Hokusan_AI/.claude/context/dashboard.md`.

## Auth: email + password, not magic link or Google OAuth
- Magic link: Supabase default SMTP is hard-capped at 2 emails/hour. Unusable without Resend/Postmark setup.
- Google OAuth: requires Google Cloud Console work outside the repo. Not worth the complexity for 5 users.
- Email+password via Supabase Auth: boring, works. `@hokusan.ca` allowlist enforced in middleware and per-page.

## Bucket logic centralized in `lib/queue.ts`
- Initial bug: /pulse showed 20 Graduating Trials, /campaigns showed 72. Root cause: different `listEnrichedOrgs(limit)` values + inline filter duplication.
- Now every bucket filter imports `filterByBucket` from `lib/queue.ts`. Single source of truth. Same across pages by construction.

## No runtime LLM in the dashboard
- Considered runtime Claude API for draft generation. Rejected: added a key, a cost, and a failure mode without meaningful UX gain over pasting into claude.ai.
- `lib/promptTemplates.ts` builds segment-grounded prompts at page render. `DraftPromptButton` copies to clipboard + links to claude.ai. Zero inference in-product.

## Dashboard reads Pipedrive; does not write
- `outcomes_log` table exists but unused. Reps work Pipedrive. Dashboard logging would create double-entry or split truth.
- Activity signal (`last_activity_date`, `activities_count`, `open_deals_count`) read from the Pipedrive org record — no extra API calls, no writes.

## Trend math: trailing-4w vs prior-4w, not WoW
- Wholesale order flow is lumpy. WoW swings >20% on single-order timing. Trailing-4w moving comparison smooths noise while staying fresh.

## /pulse is uncached on the edge
- `next: { revalidate }` crashes Cloudflare workers when fetch responses exceed 2MB (Pipedrive deals pages and Shopify orders JSON regularly do).
- Current cost: ~3s per /pulse load. Alternative: write weekly rollups to Supabase via the Monday cron, read from there in <100ms. Not yet built.

## GitHub Actions runs independent of any local machine
- Daily enrichment: 06:00 Toronto (10 UTC cron).
- Weekly snapshot: Monday 07:00 Toronto (11 UTC cron).
- Both run on GitHub-hosted runners. No dependency on Rikko's Mac or any other local env.

## Known data-quality gap (not this session's fix)
- 70.6% of Pipedrive orgs have empty `lifecycle_bucket`. Surfaced as a warning banner on /pulse and /campaigns. Owner: the enrichment script in `/Users/rikkoosaki/Documents/Hokusan_AI/scripts/`. Deferred per Rikko to a separate session.

## Open loops (not done)
- Weekly Supabase rollup for /pulse speed. Decision pending.
- Outcome-log writes. Deferred until team behaviour signals need.
- Repo visibility (public vs private). Rikko hasn't decided.
