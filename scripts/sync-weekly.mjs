#!/usr/bin/env node
// Hokusan Insights — weekly snapshot sync.
// Runs every Monday 07:00 America/Toronto via GitHub Actions.
//
// Computes:
//  - revenue_cad, orders_count   (Shopify orders, prior ISO week Mon→Sun)
//  - new_leads_count             (Pipedrive: deals added last 7 days, Application Form pipeline)
//  - leads_activated_count       (Pipedrive: orgs where Wholesale Status flipped to Active Customer last 7d — approx via `add_time` on first order-linked activity; MVP: count orgs with first_order in the week)
//  - trials_graduated_count      (Pipedrive orgs where order_count crossed 4 this week — approx: orgs at order_count==4 with last_order_date in the week)
//  - dormant_reactivated_count   (orgs with cadence_status currently "Warm" but days_since_last_order <= 7 AND order_count >= 4)
//  - basket_eroding_count        (orgs where basket_trend == "Eroding")
//
// Writes one row into public.weekly_snapshots via Supabase service role.
// Idempotent: uses ON CONFLICT on (week_start).
//
// Usage:
//   node scripts/sync-weekly.mjs --dry-run
//   node scripts/sync-weekly.mjs --week=2026-04-13    (override ISO week_start)
//   node scripts/sync-weekly.mjs

import { createClient } from "@supabase/supabase-js";

const args = parseArgs(process.argv.slice(2));

const CONFIG = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  pipedriveToken: process.env.PIPEDRIVE_API_TOKEN,
  pipedriveDomain: process.env.PIPEDRIVE_DOMAIN || "hokusanteacanada",
  shopifyDomain: process.env.SHOPIFY_STORE_DOMAIN || "hokusan.myshopify.com",
  shopifyToken: process.env.SHOPIFY_ACCESS_TOKEN,
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION || "2025-01",
};

for (const [k, v] of Object.entries(CONFIG)) {
  if (!v) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
}

function parseArgs(argv) {
  const out = { dryRun: false, weekStart: null };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--week=")) out.weekStart = a.slice(7);
  }
  return out;
}

// ---- Week window: prior ISO week (Monday → Sunday) in America/Toronto. ----
function computeWeekWindow(overrideIsoMonday) {
  // Use UTC math but anchor on Toronto's week boundary (Mon 00:00 ET).
  // America/Toronto is UTC-5 (EST) or UTC-4 (EDT). We compute based on wall-clock date in Toronto.
  const now = new Date();
  const torontoNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Toronto" })
  );
  // Monday of CURRENT week in Toronto:
  const day = torontoNow.getDay(); // 0 Sun - 6 Sat
  const diffToMon = (day + 6) % 7; // Mon=0
  const mondayThisWeek = new Date(torontoNow);
  mondayThisWeek.setHours(0, 0, 0, 0);
  mondayThisWeek.setDate(mondayThisWeek.getDate() - diffToMon);
  // PRIOR week's Monday = mondayThisWeek - 7d
  const priorMonday = overrideIsoMonday
    ? new Date(`${overrideIsoMonday}T00:00:00`)
    : new Date(mondayThisWeek.getTime() - 7 * 86400_000);
  const priorSundayEnd = new Date(priorMonday.getTime() + 7 * 86400_000 - 1);
  return {
    weekStart: toIsoDate(priorMonday),
    sinceIso: priorMonday.toISOString(),
    untilIso: priorSundayEnd.toISOString(),
  };
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---- Shopify orders rollup ----
async function shopifyOrdersRollup(sinceIso, untilIso) {
  let revenue = 0;
  let count = 0;
  let url =
    `https://${CONFIG.shopifyDomain}/admin/api/${CONFIG.shopifyApiVersion}/orders.json` +
    `?status=any&created_at_min=${encodeURIComponent(sinceIso)}&created_at_max=${encodeURIComponent(untilIso)}&limit=250`;

  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": CONFIG.shopifyToken, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Shopify orders failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    for (const o of body.orders ?? []) {
      if (o.financial_status === "voided" || o.financial_status === "refunded") continue;
      revenue += Number(o.total_price) || 0;
      count++;
    }
    // Pagination via Link header.
    const link = res.headers.get("link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }

  return { revenue_cad: Math.round(revenue * 100) / 100, orders_count: count };
}

// ---- Pipedrive slices ----
const PD = `https://${CONFIG.pipedriveDomain}.pipedrive.com/api/v1`;

async function pd(path, params = {}) {
  const url = new URL(PD + path);
  url.searchParams.set("api_token", CONFIG.pipedriveToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pipedrive ${path} failed: ${res.status}`);
  return (await res.json()).data;
}

async function pdPaginated(path, params = {}) {
  let start = 0;
  const all = [];
  while (true) {
    const page = await pd(path, { ...params, start, limit: 500 });
    if (!page?.length) break;
    all.push(...page);
    if (page.length < 500) break;
    start += 500;
  }
  return all;
}

async function resolveFieldKeys() {
  const fields = await pdPaginated("/organizationFields");
  const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f]));
  const k = (name) => byName.get(name.toLowerCase())?.key ?? null;
  return {
    cadenceStatus: k("Cadence Status"),
    lifecycleBucket: k("Lifecycle Bucket"),
    basketTrend: k("Basket Trend"),
    daysSince: k("Days Since Last Order"),
    orderCount: k("Order Count"),
    lastOrderDate: k("Last Order Date"),
    fields,
    byName,
  };
}

function optionLabel(byName, fieldName, value) {
  const f = byName.get(fieldName.toLowerCase());
  if (!f?.options) return null;
  const opt = f.options.find((o) => String(o.id) === String(value));
  return opt?.label ?? null;
}

async function pipedriveSlices(sinceIso, untilIso) {
  const keys = await resolveFieldKeys();
  const orgs = await pdPaginated("/organizations");

  // Count enriched orgs per lifecycle bucket + trend, using the since window for deltas.
  const sinceDate = new Date(sinceIso);
  const untilDate = new Date(untilIso);
  const inWindow = (isoish) => {
    if (!isoish) return false;
    const d = new Date(isoish);
    return d >= sinceDate && d <= untilDate;
  };

  let trialsGraduated = 0; // orgs at order_count ≥ 4 with last order in the window
  let dormantReactivated = 0; // orgs at order_count ≥ 4, last order in window, cadence "Warm" now
  let basketEroding = 0;
  for (const o of orgs) {
    const lastOrder = keys.lastOrderDate ? o[keys.lastOrderDate] : null;
    const orderCount = Number(keys.orderCount ? o[keys.orderCount] : 0) || 0;
    const cadence = keys.cadenceStatus
      ? optionLabel(keys.byName, "Cadence Status", o[keys.cadenceStatus])
      : null;
    const basket = keys.basketTrend
      ? optionLabel(keys.byName, "Basket Trend", o[keys.basketTrend])
      : null;

    if (basket === "Eroding") basketEroding++;
    if (orderCount === 4 && inWindow(lastOrder)) trialsGraduated++;
    if (orderCount >= 4 && inWindow(lastOrder) && cadence === "Warm") {
      // Approximation: if they ordered in the window AND cadence is Warm now AND they're not a fresh first-timer,
      // treat as reactivation. Tighter tracking comes in Phase 2 via prior-week cadence snapshot diff.
      dormantReactivated++;
    }
  }

  // New leads: deals added in the window in the "Application Form" pipeline.
  const pipelines = await pd("/pipelines");
  const appForm = pipelines?.find((p) => /application form/i.test(p.name));
  const appFormId = appForm?.id;
  let newLeads = 0;
  if (appFormId) {
    const deals = await pdPaginated("/deals", {
      status: "all_not_deleted",
      filter_id: "",
    });
    for (const d of deals) {
      if (d.pipeline_id !== appFormId) continue;
      if (inWindow(d.add_time)) newLeads++;
    }
  }

  // Leads activated: orgs whose first_purchase landed in the window.
  // first_purchase is typically a Pipedrive custom field on org; use its key if present.
  let leadsActivated = 0;
  const firstPurchaseKey = keys.byName.get("first_purchase")?.key;
  if (firstPurchaseKey) {
    for (const o of orgs) {
      const fp = o[firstPurchaseKey];
      if (inWindow(fp)) leadsActivated++;
    }
  }

  return {
    new_leads_count: newLeads,
    leads_activated_count: leadsActivated,
    trials_graduated_count: trialsGraduated,
    dormant_reactivated_count: dormantReactivated,
    basket_eroding_count: basketEroding,
  };
}

// ---- Main ----
async function main() {
  const win = computeWeekWindow(args.weekStart);
  console.log(`Week start: ${win.weekStart}  (window: ${win.sinceIso} → ${win.untilIso})`);

  console.log("Pulling Shopify orders…");
  const shopify = await shopifyOrdersRollup(win.sinceIso, win.untilIso);
  console.log("  orders:", shopify);

  console.log("Pulling Pipedrive slices…");
  const pdSlices = await pipedriveSlices(win.sinceIso, win.untilIso);
  console.log("  pipedrive:", pdSlices);

  const row = {
    week_start: win.weekStart,
    revenue_cad: shopify.revenue_cad,
    orders_count: shopify.orders_count,
    ...pdSlices,
    raw_data: { source: "sync-weekly.mjs", window: win, computed_at: new Date().toISOString() },
  };

  if (args.dryRun) {
    console.log("\nDRY RUN — would upsert:");
    console.log(JSON.stringify(row, null, 2));
    return;
  }

  const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase
    .from("weekly_snapshots")
    .upsert(row, { onConflict: "week_start" });

  if (error) {
    console.error("Supabase upsert failed:", error);
    process.exit(1);
  }

  console.log(`✓ weekly_snapshots[${row.week_start}] upserted.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
