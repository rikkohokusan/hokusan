// Minimal Pipedrive v1 client. Server-only.

const BASE = `https://${process.env.PIPEDRIVE_DOMAIN || "hokusanteacanada"}.pipedrive.com/api/v1`;
const TOKEN = process.env.PIPEDRIVE_API_TOKEN!;

async function pd<T = unknown>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(BASE + path);
  url.searchParams.set("api_token", TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Pipedrive ${path} failed: ${res.status}`);
  const json = (await res.json()) as { data: T };
  return json.data;
}

export type OrgField = {
  key: string;
  name: string;
  field_type: string;
  options?: Array<{ id: number; label: string }>;
};

let fieldCache: { at: number; fields: OrgField[] } | null = null;

export async function listOrgFields(): Promise<OrgField[]> {
  if (fieldCache && Date.now() - fieldCache.at < 15 * 60 * 1000) return fieldCache.fields;
  const fields = (await pd<OrgField[]>("/organizationFields", { limit: 500 })) || [];
  fieldCache = { at: Date.now(), fields };
  return fields;
}

// Resolve a custom field's hash key by its human name (case-insensitive).
export async function fieldKey(name: string): Promise<string | null> {
  const fields = await listOrgFields();
  const f = fields.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return f?.key ?? null;
}

// Resolve an option-label for an enum field given the stored numeric ID.
export async function fieldOptionLabel(name: string, optionId: number | string | null | undefined): Promise<string | null> {
  if (optionId == null) return null;
  const fields = await listOrgFields();
  const f = fields.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const opt = f?.options?.find((o) => String(o.id) === String(optionId));
  return opt?.label ?? null;
}

// Fetches all wholesale orgs with their enriched fields resolved into plain labels.
// Uses pagination. Filters out the hokusan_team service account's orgs on a best-effort basis
// by skipping orgs with no sensible business data — we resolve ownership via the `owner_id` field.
export type EnrichedOrg = {
  id: number;
  name: string;
  lifecycle_bucket: string | null;
  cadence_status: string | null;
  days_since_last_order: number | null;
  personal_cadence_days: number | null;
  lifetime_spend_cad: number | null;
  order_count: number | null;
  avg_order_value: number | null;
  last_order_date: string | null;
  basket_trend: string | null;
  top_product_category: string | null;
  last_3_orders_summary: string | null;
  business_sector: string | null;
  owner_id: number | null;
  owner_name: string | null;
};

type RawOrg = Record<string, unknown> & {
  id: number;
  name: string;
  owner_id?: { value: number; name: string } | number | null;
};

// Default limit set high enough to cover all wholesale orgs in one fetch.
// Pipedrive returns 500/page; this pulls up to 6 pages. Bump if the org table grows past ~3000.
export async function listEnrichedOrgs(limit = 3000): Promise<EnrichedOrg[]> {
  const fields = await listOrgFields();
  const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f]));

  const k = (name: string) => byName.get(name.toLowerCase())?.key ?? null;
  const k_lifecycle = k("Lifecycle Bucket");
  const k_cadence_status = k("Cadence Status");
  const k_days_since = k("Days Since Last Order");
  const k_personal_cadence = k("Personal Cadence (days)");
  const k_lifetime_spend = k("Lifetime Spend CAD");
  const k_order_count = k("Order Count");
  const k_aov = k("Avg Order Value");
  const k_last_order = k("Last Order Date");
  const k_basket = k("Basket Trend");
  const k_top_cat = k("Top Product Category");
  const k_last3 = k("Last 3 Orders Summary");
  const k_sector = k("Business Sector");

  const out: EnrichedOrg[] = [];
  let start = 0;
  const pageSize = 500;
  while (out.length < limit) {
    const page = (await pd<RawOrg[]>("/organizations", { start, limit: pageSize })) || [];
    if (!page.length) break;
    for (const raw of page) {
      const owner = typeof raw.owner_id === "object" && raw.owner_id
        ? (raw.owner_id as { value: number; name: string })
        : null;
      out.push({
        id: raw.id,
        name: raw.name,
        lifecycle_bucket: await labelFor(byName, k_lifecycle, raw),
        cadence_status: await labelFor(byName, k_cadence_status, raw),
        days_since_last_order: toNum(k_days_since ? raw[k_days_since] : null),
        personal_cadence_days: toNum(k_personal_cadence ? raw[k_personal_cadence] : null),
        lifetime_spend_cad: toNum(k_lifetime_spend ? raw[k_lifetime_spend] : null),
        order_count: toNum(k_order_count ? raw[k_order_count] : null),
        avg_order_value: toNum(k_aov ? raw[k_aov] : null),
        last_order_date: toStr(k_last_order ? raw[k_last_order] : null),
        basket_trend: await labelFor(byName, k_basket, raw),
        top_product_category: await labelFor(byName, k_top_cat, raw),
        last_3_orders_summary: toStr(k_last3 ? raw[k_last3] : null),
        business_sector: await labelFor(byName, k_sector, raw),
        owner_id: owner?.value ?? null,
        owner_name: owner?.name ?? null,
      });
      if (out.length >= limit) break;
    }
    if (page.length < pageSize) break;
    start += pageSize;
  }
  return out;
}

async function labelFor(
  byName: Map<string, OrgField>,
  key: string | null,
  raw: Record<string, unknown>
): Promise<string | null> {
  if (!key) return null;
  const val = raw[key];
  if (val == null || val === "") return null;
  // Find the field meta to resolve option IDs → labels.
  const field = [...byName.values()].find((f) => f.key === key);
  if (field?.field_type === "enum" && field.options) {
    const opt = field.options.find((o) => String(o.id) === String(val));
    return opt?.label ?? String(val);
  }
  return String(val);
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

// -- open deals / pipeline slice (for /pulse anomaly detection, and queue reference) --
export type OpenDealSummary = {
  id: number;
  title: string;
  value: number;
  org_id: number | null;
  org_name: string | null;
  owner_name: string | null;
  update_time: string;
};

// -- Pipedrive users (for owner filter on /queue) --
export type PdUser = {
  id: number;
  name: string;
  email: string;
  active_flag: boolean;
  is_you: boolean;
};

export async function listPipedriveUsers(): Promise<PdUser[]> {
  const users = (await pd<PdUser[]>("/users")) || [];
  return users.filter((u) => u.active_flag);
}

export async function listOpenDeals(limit = 500): Promise<OpenDealSummary[]> {
  const out: OpenDealSummary[] = [];
  let start = 0;
  while (out.length < limit) {
    const page = await pd<Array<Record<string, unknown>>>("/deals", {
      status: "open",
      start,
      limit: 500,
      sort: "update_time DESC",
    });
    if (!page?.length) break;
    for (const d of page) {
      const org = d.org_id as { value: number; name: string } | null;
      const owner = d.owner_id as { name: string } | null;
      out.push({
        id: Number(d.id),
        title: String(d.title),
        value: Number(d.value ?? 0),
        org_id: org?.value ?? null,
        org_name: org?.name ?? null,
        owner_name: owner?.name ?? null,
        update_time: String(d.update_time ?? ""),
      });
      if (out.length >= limit) break;
    }
    if (page.length < 500) break;
    start += 500;
  }
  return out;
}
