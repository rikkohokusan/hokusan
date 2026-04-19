// 12-week trend aggregations pulled live from Shopify + Pipedrive.
// Uses Next.js fetch cache so first load per hour pays the cost, subsequent loads are instant.

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "hokusan.myshopify.com";
const VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const SHOP_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const PD_TOKEN = process.env.PIPEDRIVE_API_TOKEN!;
const PD_DOMAIN = process.env.PIPEDRIVE_DOMAIN || "hokusanteacanada";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WeeklyPoint = {
  weekStart: string; // ISO date (Monday)
  label: string; // human-readable, e.g. "Apr 7"
};

export type TrendSeries = {
  revenue: (WeeklyPoint & { value: number })[];
  orders: (WeeklyPoint & { value: number })[];
  aov: (WeeklyPoint & { value: number })[];
  newLeads: (WeeklyPoint & { value: number })[];
};

export async function fetch12WeekTrends(): Promise<TrendSeries> {
  const weeks = buildWeekWindows(12);
  const sinceIso = weeks[0].start.toISOString();
  const untilIso = weeks[weeks.length - 1].end.toISOString();

  const [shopifyOrders, pipedriveLeads] = await Promise.all([
    fetchShopifyOrders(sinceIso, untilIso),
    fetchPipedriveAppFormLeads(sinceIso, untilIso),
  ]);

  const revenue: TrendSeries["revenue"] = [];
  const orders: TrendSeries["orders"] = [];
  const aov: TrendSeries["aov"] = [];
  const newLeads: TrendSeries["newLeads"] = [];

  for (const w of weeks) {
    const weekOrders = shopifyOrders.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= w.start.getTime() && t <= w.end.getTime();
    });
    const weekRev = weekOrders.reduce((s, o) => s + Number(o.total_price || 0), 0);
    const weekOrdCount = weekOrders.length;
    const weekAov = weekOrdCount > 0 ? weekRev / weekOrdCount : 0;

    const weekLeads = pipedriveLeads.filter((d) => {
      const t = new Date(d.add_time).getTime();
      return t >= w.start.getTime() && t <= w.end.getTime();
    }).length;

    const label = w.start.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
    const weekStart = toIsoDate(w.start);

    revenue.push({ weekStart, label, value: Math.round(weekRev * 100) / 100 });
    orders.push({ weekStart, label, value: weekOrdCount });
    aov.push({ weekStart, label, value: Math.round(weekAov * 100) / 100 });
    newLeads.push({ weekStart, label, value: weekLeads });
  }

  return { revenue, orders, aov, newLeads };
}

function buildWeekWindows(n: number) {
  const windows: Array<{ start: Date; end: Date }> = [];
  // Anchor to this Monday 00:00 America/Toronto, then step back.
  const now = new Date();
  const torontoNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Toronto" }));
  const day = torontoNow.getDay();
  const diffToMon = (day + 6) % 7;
  const thisMonday = new Date(torontoNow);
  thisMonday.setHours(0, 0, 0, 0);
  thisMonday.setDate(thisMonday.getDate() - diffToMon);

  // Go back n weeks. We want the 12 completed weeks PRIOR to this-week, so start index = 1.
  for (let i = n; i >= 1; i--) {
    const start = new Date(thisMonday.getTime() - i * WEEK_MS);
    const end = new Date(start.getTime() + WEEK_MS - 1);
    windows.push({ start, end });
  }
  return windows;
}

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ShopifyOrder = { created_at: string; total_price: string; financial_status?: string };

async function fetchShopifyOrders(sinceIso: string, untilIso: string): Promise<ShopifyOrder[]> {
  const out: ShopifyOrder[] = [];
  let url: string | null =
    `https://${DOMAIN}/admin/api/${VERSION}/orders.json` +
    `?status=any&created_at_min=${encodeURIComponent(sinceIso)}&created_at_max=${encodeURIComponent(untilIso)}&limit=250`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": SHOP_TOKEN, Accept: "application/json" },
      next: { revalidate: 3600 }, // cache 1 hour at the edge
    });
    if (!res.ok) throw new Error(`Shopify orders failed: ${res.status}`);
    const body = (await res.json()) as { orders: ShopifyOrder[] };
    for (const o of body.orders ?? []) {
      if (o.financial_status === "voided" || o.financial_status === "refunded") continue;
      out.push(o);
    }
    const link = res.headers.get("link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return out;
}

type PdDeal = { add_time: string; pipeline_id: number };

async function fetchPipedriveAppFormLeads(sinceIso: string, untilIso: string): Promise<PdDeal[]> {
  // Find the Application Form pipeline
  const pipRes = await fetch(`https://${PD_DOMAIN}.pipedrive.com/api/v1/pipelines?api_token=${PD_TOKEN}`, {
    next: { revalidate: 3600 },
  });
  const pips = (await pipRes.json()).data as Array<{ id: number; name: string }>;
  const appForm = pips.find((p) => /application form/i.test(p.name));
  if (!appForm) return [];

  const out: PdDeal[] = [];
  let start = 0;
  while (start < 10000) {
    const r: Response = await fetch(
      `https://${PD_DOMAIN}.pipedrive.com/api/v1/deals?api_token=${PD_TOKEN}&status=all_not_deleted&start=${start}&limit=500`,
      { next: { revalidate: 3600 } }
    );
    const body = (await r.json()) as { data: PdDeal[] | null };
    const batch = body.data || [];
    if (!batch.length) break;
    const since = new Date(sinceIso).getTime();
    const until = new Date(untilIso).getTime();
    for (const d of batch) {
      if (d.pipeline_id !== appForm.id) continue;
      const t = new Date(d.add_time).getTime();
      if (t >= since && t <= until) out.push(d);
    }
    if (batch.length < 500) break;
    start += 500;
  }
  return out;
}
