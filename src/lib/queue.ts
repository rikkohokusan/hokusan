import type { EnrichedOrg } from "./pipedrive";

// Queue buckets with human labels and priority order (top → bottom).
export const QUEUE_BUCKETS = [
  { key: "vip_dormant",      label: "Dormant VIPs",      tone: "warn" as const, hint: "6+ lifetime orders, past 2.5× cadence — Rikko personal call" },
  { key: "basket_eroding",   label: "Basket Eroding",    tone: "warn" as const, hint: "Recent AOV down >25% vs baseline — hidden churn signal" },
  { key: "at_risk",          label: "At Risk",           tone: "warn" as const, hint: "1.5× cadence silent — timely nudge" },
  { key: "graduating_trial", label: "Graduating Trials", tone: "good" as const, hint: "2-3 orders, still warm — highest-leverage cross-sell" },
  { key: "first_to_second",  label: "First-to-Second",   tone: "good" as const, hint: "1 order, within prime re-order window" },
  { key: "likely_lost",      label: "Likely Lost",       tone: "muted" as const, hint: "4×+ cadence silent — low yield, last chance" },
  { key: "all",              label: "All Accounts",      tone: "muted" as const, hint: "Every enriched org" },
] as const;

export type QueueBucketKey = (typeof QUEUE_BUCKETS)[number]["key"];

export function filterByBucket(orgs: EnrichedOrg[], bucket: QueueBucketKey): EnrichedOrg[] {
  const out = orgs.filter((o) => {
    const lc = (o.lifecycle_bucket || "").toLowerCase();
    const cs = (o.cadence_status || "").toLowerCase();
    const bt = (o.basket_trend || "").toLowerCase();
    const oc = o.order_count ?? 0;
    switch (bucket) {
      case "vip_dormant":
        return oc >= 6 && (cs === "dormant" || cs === "likely lost" || lc === "dormant-vip");
      case "basket_eroding":
        return bt === "eroding";
      case "at_risk":
        return cs === "at risk" || lc === "at-risk";
      case "graduating_trial":
        return lc === "graduating-trial" || (oc >= 2 && oc <= 3 && cs === "warm");
      case "first_to_second":
        return lc === "first-time" || oc === 1;
      case "likely_lost":
        return cs === "likely lost" || lc === "likely-lost";
      case "all":
        return true;
    }
  });
  return sortByPriority(out);
}

// Sort: highest LTV first within the bucket, then by days_since_last_order desc.
function sortByPriority(orgs: EnrichedOrg[]): EnrichedOrg[] {
  return [...orgs].sort((a, b) => {
    const ltvDiff = (b.lifetime_spend_cad ?? 0) - (a.lifetime_spend_cad ?? 0);
    if (ltvDiff !== 0) return ltvDiff;
    return (b.days_since_last_order ?? 0) - (a.days_since_last_order ?? 0);
  });
}

export function bucketCounts(orgs: EnrichedOrg[]): Record<QueueBucketKey, number> {
  const result = {} as Record<QueueBucketKey, number>;
  for (const b of QUEUE_BUCKETS) {
    result[b.key] = filterByBucket(orgs, b.key).length;
  }
  return result;
}

export function suggestedHook(org: EnrichedOrg): string {
  const cs = org.cadence_status || "";
  const bt = org.basket_trend || "";
  const oc = org.order_count ?? 0;
  const cat = org.top_product_category || "";
  const sector = org.business_sector || "";

  if (cs === "Likely Lost") return "Long silence — one honest 'is there anything we can do' email.";
  if (cs === "Dormant" && oc >= 6) return `VIP gone quiet — Rikko personal call. Last buy: ${cat || "matcha"}.`;
  if (bt === "Eroding") return `AOV slipping — likely testing a competitor on ${cat || "some SKUs"}. Anchor the pricing and ask what changed.`;
  if (cs === "At Risk") return `About to miss their usual cadence. Light nudge before they go cold.`;
  if (oc >= 2 && oc <= 3 && cs === "Warm") {
    if (/cafe|café/i.test(sector)) return "Add matcha baking/culinary grade for pastry; H-M2 protects the latte margin.";
    if (/bubble tea/i.test(sector)) return "H-M2 1kg wholesale to lock in volume pricing on matcha.";
    if (/ice cream/i.test(sector)) return "Culinary grade for base — matches matcha profile without ceremonial price.";
    return "Still warm — pitch a natural extension to their current mix.";
  }
  if (oc === 1) return "One and done — 'how did it perform?' email references the SKU they tried.";
  return "Routine re-engagement check-in.";
}

export function pipedriveOrgUrl(id: number): string {
  return `https://hokusanteacanada.pipedrive.com/organization/${id}`;
}
