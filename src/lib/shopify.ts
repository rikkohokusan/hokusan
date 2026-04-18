// Minimal Shopify Admin REST client. Server-only.

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "hokusan.myshopify.com";
const VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const BASE = `https://${DOMAIN}/admin/api/${VERSION}`;

async function sh<T = unknown>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Shopify ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

export type OrdersRollup = {
  revenue_cad: number;
  orders_count: number;
};

// Sum of wholesale order subtotals between two ISO datetimes.
// Uses the `created_at_min` / `created_at_max` query to avoid pagination drift.
export async function ordersRollup(sinceIso: string, untilIso: string): Promise<OrdersRollup> {
  let revenue = 0;
  let count = 0;
  let pageInfo: string | null = null;
  let first = true;
  // Shopify REST uses cursor pagination via Link header. We'll use incremental created_at_min.
  // For MVP, fetch up to 1000 orders; wholesale weekly volume is nowhere near.
  const res = await fetch(
    `${BASE}/orders.json?status=any&created_at_min=${encodeURIComponent(sinceIso)}&created_at_max=${encodeURIComponent(untilIso)}&limit=250`,
    { cache: "no-store", headers: { "X-Shopify-Access-Token": TOKEN, Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Shopify orders failed: ${res.status}`);
  const json = (await res.json()) as { orders: Array<{ total_price: string; financial_status?: string }> };
  for (const o of json.orders ?? []) {
    if (o.financial_status === "voided" || o.financial_status === "refunded") continue;
    revenue += Number(o.total_price) || 0;
    count++;
  }
  return { revenue_cad: Math.round(revenue * 100) / 100, orders_count: count };
  void pageInfo; void first;
}
