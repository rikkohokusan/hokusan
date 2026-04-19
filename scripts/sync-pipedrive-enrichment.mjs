#!/usr/bin/env node
// Enrich wholesale Pipedrive organizations with Shopify-derived commercial context.
// Idempotent: running twice produces the same result. Field discovery is cached in sync-state.json.
//
// Usage:
//   node sync-pipedrive-enrichment.mjs --dry-run         # no writes; prints 5 orgs incl. Le Bleu (559)
//   node sync-pipedrive-enrichment.mjs --limit=10        # live run, first 10 matched orgs
//   node sync-pipedrive-enrichment.mjs --test-orgs=559,1 # live run, specific org IDs
//   node sync-pipedrive-enrichment.mjs                   # full live run

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// ---------- Config ----------
const CONFIG = {
  pipedriveToken: process.env.PIPEDRIVE_API_TOKEN,
  pipedriveDomain: process.env.PIPEDRIVE_DOMAIN || 'hokusanteacanada',
  shopifyToken: process.env.SHOPIFY_ACCESS_TOKEN,
  shopifyDomain: process.env.SHOPIFY_STORE_DOMAIN || 'hokusan.myshopify.com',
  shopifyApiVersion: '2025-01',
  // Paths resolve relative to this script so it works locally AND in GitHub Actions.
  statePath: new URL('./sync-state.json', import.meta.url).pathname,
  sectorCadencePath: new URL('./sector-cadence.json', import.meta.url).pathname,
};

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { dryRun: false, limit: null, testOrgs: null };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10);
    else if (a.startsWith('--test-orgs=')) out.testOrgs = a.slice(12).split(',').map(s => parseInt(s.trim(), 10));
    else if (a === '--help' || a === '-h') {
      console.log('See header comment for usage.');
      process.exit(0);
    }
  }
  return out;
}

// ---------- Field definitions ----------
const FIELD_DEFS = [
  { slug: 'lifetime_spend_cad',     name: 'Lifetime Spend CAD',       field_type: 'monetary' },
  { slug: 'order_count',            name: 'Order Count',              field_type: 'double' },
  { slug: 'avg_order_value',        name: 'Avg Order Value',          field_type: 'monetary' },
  { slug: 'last_order_date',        name: 'Last Order Date',          field_type: 'date' },
  { slug: 'days_since_last_order',  name: 'Days Since Last Order',    field_type: 'double' },
  { slug: 'personal_cadence_days',  name: 'Personal Cadence (days)',  field_type: 'double' },
  { slug: 'cadence_status',         name: 'Cadence Status',           field_type: 'enum',
    options: ['Warm', 'At Risk', 'Dormant', 'Likely Lost'] },
  { slug: 'last_3_orders_summary',  name: 'Last 3 Orders Summary',    field_type: 'text' },
  { slug: 'top_product_category',   name: 'Top Product Category',     field_type: 'enum',
    options: ['Matcha-Ceremonial', 'Matcha-Culinary', 'Hojicha', 'Sencha', 'Mixed', 'Niju-Retail'] },
  { slug: 'basket_trend',           name: 'Basket Trend',             field_type: 'enum',
    options: ['Growing', 'Stable', 'Eroding'] },
  { slug: 'lifecycle_bucket',       name: 'Lifecycle Bucket',         field_type: 'enum',
    options: ['New-Lead', 'Unactivated-Lead', 'First-Time', 'Graduating-Trial',
              'Established-Active', 'At-Risk', 'Dormant-VIP', 'Likely-Lost'] },
];

// Pre-existing fields we only READ (never write) to inform computation.
const READ_FIELDS = ['Business Sector', 'Organization Type', 'Wholesale Status', 'Customer Stage'];

// ---------- HTTP clients ----------
const PD_BASE = `https://${CONFIG.pipedriveDomain}.pipedrive.com/api/v1`;
const SHOPIFY_BASE = `https://${CONFIG.shopifyDomain}/admin/api/${CONFIG.shopifyApiVersion}`;

async function pdRequest(method, path, { params = {}, body } = {}) {
  const url = new URL(PD_BASE + path);
  url.searchParams.set('api_token', CONFIG.pipedriveToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(`Pipedrive ${method} ${path} failed: ${res.status} ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

async function pdPaginate(path, params = {}) {
  const all = [];
  let start = 0;
  const limit = 500;
  while (true) {
    const body = await pdRequest('GET', path, { params: { ...params, start, limit } });
    const items = body.data || [];
    all.push(...items);
    const pag = body.additional_data?.pagination;
    if (!pag?.more_items_in_collection) break;
    start = pag.next_start;
    await sleep(100);
  }
  return all;
}

async function shopifyGet(urlOrPath, params = {}) {
  let url = urlOrPath.startsWith('http') ? urlOrPath : SHOPIFY_BASE + urlOrPath;
  if (!urlOrPath.startsWith('http')) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    url = u.toString();
  }
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': CONFIG.shopifyToken } });
  if (res.status === 429) {
    await sleep(2000);
    return shopifyGet(urlOrPath, params);
  }
  if (!res.ok) throw new Error(`Shopify GET ${url} failed: ${res.status} ${await res.text()}`);
  const nextLink = parseNextLink(res.headers.get('Link'));
  const data = await res.json();
  return { data, nextLink };
}

function parseNextLink(header) {
  if (!header) return null;
  for (const part of header.split(',')) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

// ---------- State cache ----------
async function loadState() {
  try {
    return JSON.parse(await readFile(CONFIG.statePath, 'utf-8'));
  } catch {
    return { fields: {}, read_fields: {} };
  }
}
async function saveState(state) {
  await mkdir(dirname(CONFIG.statePath), { recursive: true });
  await writeFile(CONFIG.statePath, JSON.stringify(state, null, 2));
}

// ---------- Utilities ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const normEmail = e => (typeof e === 'string' ? e : '').trim().toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);
const round2 = n => Math.round(n * 100) / 100;

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysBetween(fromDate, toDate) {
  return Math.floor((new Date(toDate) - new Date(fromDate)) / 86400000);
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ---------- Field bootstrap ----------
async function ensureFields(state, { dryRun = false } = {}) {
  console.log('[fields] discovering organization fields...');
  const existing = await pdPaginate('/organizationFields');
  const byName = new Map(existing.map(f => [f.name, f]));

  for (const name of READ_FIELDS) {
    const f = byName.get(name);
    if (!f) continue;
    const rec = { key: f.key, field_type: f.field_type };
    if (f.options) rec.options = Object.fromEntries(f.options.map(o => [o.label, o.id]));
    state.read_fields[slugify(name)] = rec;
  }

  const missing = [];
  for (const def of FIELD_DEFS) {
    const current = byName.get(def.name);
    if (current) {
      const rec = { key: current.key, field_type: current.field_type };
      if (current.options) rec.options = Object.fromEntries(current.options.map(o => [o.label, o.id]));
      if (def.options) {
        for (const label of def.options) {
          if (!(label in (rec.options || {}))) {
            console.warn(`[fields] warning: enum option missing on existing field "${def.name}": "${label}"`);
          }
        }
      }
      state.fields[def.slug] = rec;
      console.log(`[fields] exists: ${def.name} (${current.key})`);
    } else if (dryRun) {
      missing.push(def.name);
    } else {
      console.log(`[fields] creating: ${def.name}`);
      const body = { name: def.name, field_type: def.field_type };
      if (def.options) body.options = def.options.map(label => ({ label }));
      const res = await pdRequest('POST', '/organizationFields', { body });
      const f = res.data;
      const rec = { key: f.key, field_type: f.field_type };
      if (f.options) rec.options = Object.fromEntries(f.options.map(o => [o.label, o.id]));
      state.fields[def.slug] = rec;
      await sleep(200);
    }
  }
  if (dryRun && missing.length) {
    console.log(`[fields] dry-run: ${missing.length} field(s) not yet created (would create on live run): ${missing.join(', ')}`);
  }
  await saveState(state);
}

// ---------- Product classification ----------
function categorize(lineItem) {
  const blob = `${lineItem.title || ''} ${lineItem.sku || ''} ${lineItem.vendor || ''}`.toLowerCase();
  if (blob.includes('niju') || blob.includes('40g')) return 'Niju-Retail';
  if (blob.includes('hojicha') || blob.includes('houjicha') || blob.includes('roasted')) return 'Hojicha';
  if (blob.includes('sencha')) return 'Sencha';
  if (blob.includes('ceremonial') || blob.includes('cem1kg') || blob.includes('_cem') || /\bcem\b/.test(blob)) {
    return 'Matcha-Ceremonial';
  }
  if (blob.includes('culinary') || blob.includes('baking') || blob.includes('hm2') || blob.includes('h-m2') || blob.includes('h_m2')) {
    return 'Matcha-Culinary';
  }
  if (blob.includes('matcha')) return 'Matcha-Culinary';
  return null;
}

// ---------- Enrichment computation ----------
function computeEnrichment(org, customers, orders, sectorCadence, state) {
  if (!customers.length) return null;

  const sorted = orders
    .filter(o => o.financial_status !== 'voided')
    .map(o => ({
      id: o.id,
      date: (o.processed_at || o.created_at || '').slice(0, 10),
      total: parseFloat(o.total_price || 0),
      line_items: o.line_items || [],
    }))
    .filter(o => o.date && o.total > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  const orderCount = sorted.length;
  if (orderCount === 0) return null;

  const lifetime = sorted.reduce((s, o) => s + o.total, 0);
  const aov = lifetime / orderCount;
  const last = sorted[0];
  const daysSince = daysBetween(last.date, today());

  // Personal cadence — median gap of last 3-5 orders; blank if <4 orders.
  let personalCadence = null;
  if (orderCount >= 4) {
    const recent = sorted.slice(0, 5);
    const gaps = [];
    for (let i = 0; i < recent.length - 1; i++) {
      gaps.push(daysBetween(recent[i + 1].date, recent[i].date));
    }
    personalCadence = Math.round(median(gaps));
  }

  const sectorName = getOrgSector(org, state);
  const sectorNorm = normalizeSector(sectorName);
  const sectorFallback = sectorCadence.sectors[sectorNorm]?.median_days
    ?? sectorCadence.sectors._overall_fallback.median_days;

  // Small-sample guard: 2 orders → sector fallback (one gap isn't a cadence).
  const cadence = orderCount >= 4 ? personalCadence : sectorFallback;
  const ratio = cadence > 0 ? daysSince / cadence : 0;

  let cadenceStatus;
  if (ratio >= 4 && daysSince > 270) cadenceStatus = 'Likely Lost';
  else if (ratio >= 2.5) cadenceStatus = 'Dormant';
  else if (ratio >= 1.5) cadenceStatus = 'At Risk';
  else cadenceStatus = 'Warm';

  const last3Summary = sorted.slice(0, 3).map(o => {
    return `${o.date} $${o.total.toFixed(2)} — ${topSkuOfOrder(o)}`;
  }).join('; ');

  // Top product category across last 10 orders by unit volume.
  const recentForCat = sorted.slice(0, 10);
  const catCount = {};
  for (const o of recentForCat) {
    for (const li of o.line_items) {
      const cat = categorize(li);
      if (!cat) continue;
      catCount[cat] = (catCount[cat] || 0) + (li.quantity || 1);
    }
  }
  const catTotal = Object.values(catCount).reduce((s, n) => s + n, 0);
  let topCategory = null;
  if (catTotal > 0) {
    const [name, cnt] = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
    topCategory = cnt / catTotal >= 0.5 ? name : 'Mixed';
  }

  // Basket trend: recent 3 AOV vs median of trailing 6. Needs 9+ orders.
  let basketTrend = null;
  if (orderCount >= 9) {
    const recent3 = sorted.slice(0, 3);
    const trailing6 = sorted.slice(3, 9);
    const recentAOV = recent3.reduce((s, o) => s + o.total, 0) / 3;
    const baselineAOV = median(trailing6.map(o => o.total));
    if (baselineAOV > 0) {
      const r = recentAOV / baselineAOV;
      if (r < 0.75) basketTrend = 'Eroding';
      else if (r > 1.25) basketTrend = 'Growing';
      else basketTrend = 'Stable';
    }
  }

  // Lifecycle bucket — data-driven view only (orgs with Shopify orders).
  // New-Lead / Unactivated-Lead aren't reachable here (those have 0 orders).
  let lifecycleBucket = null;
  if (orderCount === 1) {
    lifecycleBucket = 'First-Time';
  } else if (orderCount <= 3) {
    if (ratio <= 1.5) lifecycleBucket = 'Graduating-Trial';
    else if (ratio >= 4 && daysSince > 270) lifecycleBucket = 'Likely-Lost';
    else lifecycleBucket = 'At-Risk';
  } else {
    if (ratio >= 4 && daysSince > 270) {
      lifecycleBucket = orderCount >= 6 ? 'Dormant-VIP' : 'Likely-Lost';
    } else if (ratio >= 2.5 && orderCount >= 6) {
      lifecycleBucket = 'Dormant-VIP';
    } else if (ratio >= 1.5) {
      lifecycleBucket = 'At-Risk';
    } else {
      lifecycleBucket = 'Established-Active';
    }
  }

  return {
    lifetime_spend_cad: round2(lifetime),
    order_count: orderCount,
    avg_order_value: round2(aov),
    last_order_date: last.date,
    days_since_last_order: daysSince,
    personal_cadence_days: personalCadence,
    cadence_status: cadenceStatus,
    last_3_orders_summary: last3Summary,
    top_product_category: topCategory,
    basket_trend: basketTrend,
    lifecycle_bucket: lifecycleBucket,
    _debug: { sector: sectorName, sector_fallback: sectorFallback, cadence_used: cadence, ratio: ratio.toFixed(2) },
  };
}

function topSkuOfOrder(order) {
  if (!order.line_items?.length) return '—';
  const top = [...order.line_items].sort((a, b) => (b.quantity || 0) - (a.quantity || 0))[0];
  return (top.title || top.sku || '—').slice(0, 40);
}

function getOrgSector(org, state) {
  const ref = state.read_fields.business_sector;
  if (!ref) return null;
  const raw = org[ref.key];
  if (raw == null || raw === '') return null;
  const byId = Object.fromEntries(Object.entries(ref.options || {}).map(([label, id]) => [String(id), label]));
  return byId[String(raw)] || null;
}

function normalizeSector(name) {
  if (!name) return null;
  const map = {
    'Café': 'Cafe',
    'Pop-up/Event Catering/Mobile Cart': 'Pop-up / Event Catering / Mobile Cart',
  };
  return map[name] || name;
}

// ---------- PATCH builder ----------
function buildPatch(enrich, state) {
  const body = {};
  const f = state.fields;

  const setIf = (slug, val) => {
    if (val === null || val === undefined || val === '') return;
    body[f[slug].key] = val;
  };
  const setEnum = (slug, label) => {
    if (!label) return;
    const optId = f[slug].options?.[label];
    if (optId == null) {
      console.warn(`[patch] missing enum option ${slug}="${label}" — leaving unset`);
      return;
    }
    body[f[slug].key] = optId;
  };

  setIf('lifetime_spend_cad', enrich.lifetime_spend_cad);
  setIf('order_count', enrich.order_count);
  setIf('avg_order_value', enrich.avg_order_value);
  setIf('last_order_date', enrich.last_order_date);
  setIf('days_since_last_order', enrich.days_since_last_order);
  setIf('personal_cadence_days', enrich.personal_cadence_days);
  setEnum('cadence_status', enrich.cadence_status);
  setIf('last_3_orders_summary', enrich.last_3_orders_summary);
  setEnum('top_product_category', enrich.top_product_category);
  setEnum('basket_trend', enrich.basket_trend);
  setEnum('lifecycle_bucket', enrich.lifecycle_bucket);

  return body;
}

// ---------- Main ----------
async function main() {
  const state = await loadState();
  await ensureFields(state, { dryRun: args.dryRun });

  const sectorCadence = JSON.parse(await readFile(CONFIG.sectorCadencePath, 'utf-8'));

  console.log('[fetch] Pipedrive organizations...');
  const orgs = await pdPaginate('/organizations');
  console.log(`[fetch] ${orgs.length} orgs`);

  console.log('[fetch] Pipedrive persons...');
  const persons = await pdPaginate('/persons');
  console.log(`[fetch] ${persons.length} persons`);

  // Map org_id -> set of normalized emails (via persons)
  const orgEmails = new Map();
  for (const p of persons) {
    const orgId = p.org_id?.value || p.org_id;
    if (!orgId) continue;
    const emails = (p.email || [])
      .map(e => normEmail(e.value || e))
      .filter(Boolean);
    if (!emails.length) continue;
    if (!orgEmails.has(orgId)) orgEmails.set(orgId, new Set());
    const set = orgEmails.get(orgId);
    for (const e of emails) set.add(e);
  }

  console.log('[fetch] Shopify customers...');
  const shopCustomers = await fetchAllShopify('/customers.json', 'customers',
    { limit: 250, fields: 'id,email,total_spent,orders_count,tags,first_name,last_name' });
  console.log(`[fetch] ${shopCustomers.length} customers`);

  // Aggregate Shopify customers by email (duplicates: multiple records per email).
  const customersByEmail = new Map();
  for (const c of shopCustomers) {
    const e = normEmail(c.email);
    if (!e) continue;
    if (!customersByEmail.has(e)) customersByEmail.set(e, []);
    customersByEmail.get(e).push(c);
  }

  console.log('[fetch] Shopify orders...');
  const shopOrders = await fetchAllShopify('/orders.json', 'orders', {
    status: 'any',
    limit: 250,
    fields: 'id,name,created_at,processed_at,total_price,currency,customer,line_items,financial_status',
  });
  console.log(`[fetch] ${shopOrders.length} orders`);

  const ordersByCustomerId = new Map();
  for (const o of shopOrders) {
    const cid = o.customer?.id;
    if (!cid) continue;
    if (!ordersByCustomerId.has(cid)) ordersByCustomerId.set(cid, []);
    ordersByCustomerId.get(cid).push(o);
  }

  // Reverse map: email -> set of org_ids. Detects shared/ambiguous attribution.
  const emailToOrgs = new Map();
  for (const [orgId, emails] of orgEmails) {
    for (const e of emails) {
      if (!emailToOrgs.has(e)) emailToOrgs.set(e, new Set());
      emailToOrgs.get(e).add(orgId);
    }
  }

  // Audit: data-integrity counts before writing.
  const dupCustomerEmails = [...customersByEmail.values()].filter(a => a.length > 1).length;
  const sharedEmails = [...emailToOrgs.values()].filter(s => s.size > 1).length;
  const orgsWithParent = orgs.filter(o => o.related_objects?.organization || o.parent_org_id || o.parent_id).length;
  const orgsWithMatch = orgs.filter(o => hasExclusiveMatch(o, orgEmails, emailToOrgs, customersByEmail)).length;
  console.log(`[audit] shopify customers with duplicate email records: ${dupCustomerEmails}`);
  console.log(`[audit] emails attached to 2+ Pipedrive orgs (will be skipped for attribution): ${sharedEmails}`);
  console.log(`[audit] orgs with parent_org_id set: ${orgsWithParent} (treated independently, no roll-up)`);
  console.log(`[audit] orgs with at least one exclusive email match: ${orgsWithMatch}`);

  // Build target set.
  let targetOrgs = orgs;
  if (args.testOrgs) targetOrgs = orgs.filter(o => args.testOrgs.includes(o.id));

  if (args.dryRun && !args.testOrgs) {
    const leBleu = orgs.find(o => o.id === 559);
    const matched = orgs.filter(o => o.id !== 559 && hasExclusiveMatch(o, orgEmails, emailToOrgs, customersByEmail)).slice(0, 4);
    targetOrgs = [leBleu, ...matched].filter(Boolean);
  }
  if (args.limit && !args.dryRun) targetOrgs = targetOrgs.slice(0, args.limit);

  console.log(`[process] target=${targetOrgs.length} orgs  dryRun=${args.dryRun}`);

  let updated = 0, skippedNoMatch = 0, skippedNoData = 0, errors = 0;
  let totalSharedSkipped = 0;

  for (const org of targetOrgs) {
    try {
      const { customers, sharedSkipped } = collectCustomersForOrg(org.id, orgEmails, emailToOrgs, customersByEmail);
      totalSharedSkipped += sharedSkipped;
      if (!customers.length) {
        skippedNoMatch++;
        if (args.dryRun) console.log(`[dry] org ${org.id} "${org.name}": no Shopify match, skip (shared-email skips=${sharedSkipped})`);
        continue;
      }

      // Dedupe orders across customers by order.id.
      const seenOrderIds = new Set();
      const allOrders = [];
      for (const c of customers) {
        for (const o of (ordersByCustomerId.get(c.id) || [])) {
          if (seenOrderIds.has(o.id)) continue;
          seenOrderIds.add(o.id);
          allOrders.push(o);
        }
      }
      const enrich = computeEnrichment(org, customers, allOrders, sectorCadence, state);
      if (!enrich) {
        skippedNoData++;
        if (args.dryRun) console.log(`[dry] org ${org.id} "${org.name}": match but no valid orders, skip`);
        continue;
      }

      if (args.dryRun) {
        const { _debug, ...display } = enrich;
        console.log(`\n[dry] org ${org.id} — ${org.name}`);
        console.log(`  matched customers: ${customers.map(c => c.email).join(', ')}`);
        console.log(`  debug: sector=${_debug.sector || 'none'} fallback=${_debug.sector_fallback}d cadence_used=${_debug.cadence_used}d ratio=${_debug.ratio}`);
        for (const [k, v] of Object.entries(display)) console.log(`  ${k}: ${v}`);
        continue;
      }

      const body = buildPatch(enrich, state);
      if (Object.keys(body).length === 0) {
        skippedNoData++;
        continue;
      }
      await pdRequest('PUT', `/organizations/${org.id}`, { body });
      updated++;
      if (updated % 25 === 0) console.log(`[progress] updated=${updated}`);
      await sleep(80);
    } catch (err) {
      errors++;
      console.error(`[error] org ${org.id} "${org.name}": ${err.message}`);
    }
  }

  console.log(`\n[summary] updated=${updated} skipped_no_match=${skippedNoMatch} skipped_no_data=${skippedNoData} shared_email_skips=${totalSharedSkipped} errors=${errors}`);
}

function hasWholesaleTag(c) {
  return (c.tags || '').toLowerCase().split(',').map(s => s.trim()).includes('wholesale');
}

function collectCustomersForOrg(orgId, orgEmails, emailToOrgs, customersByEmail) {
  const emails = orgEmails.get(orgId) || new Set();
  const customers = [];
  const seenCustId = new Set();
  let sharedSkipped = 0;
  for (const e of emails) {
    const owners = emailToOrgs.get(e);
    if (!owners || owners.size !== 1) { sharedSkipped++; continue; }
    const records = customersByEmail.get(e) || [];
    for (const c of records) {
      if (!hasWholesaleTag(c)) continue;
      if (seenCustId.has(c.id)) continue;
      seenCustId.add(c.id);
      customers.push(c);
    }
  }
  return { customers, sharedSkipped };
}

function hasExclusiveMatch(org, orgEmails, emailToOrgs, customersByEmail) {
  const emails = orgEmails.get(org.id);
  if (!emails) return false;
  for (const e of emails) {
    const owners = emailToOrgs.get(e);
    if (owners && owners.size === 1) {
      const records = customersByEmail.get(e) || [];
      if (records.some(hasWholesaleTag)) return true;
    }
  }
  return false;
}

async function fetchAllShopify(path, key, params) {
  const all = [];
  let url = path;
  let p = params;
  while (url) {
    const { data, nextLink } = await shopifyGet(url, p);
    all.push(...(data[key] || []));
    url = nextLink;
    p = {};
    if (url) await sleep(250);
  }
  return all;
}

main().catch(err => { console.error(err); process.exit(1); });
