import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { BigNumber } from "@/components/BigNumber";
import { TrendChart } from "@/components/TrendChart";
import { createClient } from "@/lib/supabase/server";
import { listEnrichedOrgs, listOpenDeals, type EnrichedOrg } from "@/lib/pipedrive";

// Dynamic — always fresh against Pipedrive and Supabase.
export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_DOMAIN = "hokusan.ca";

async function requireAllowedUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? "";
  if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    redirect("/login?next=/pulse");
  }
  return supabase;
}

type Snapshot = {
  week_start: string;
  revenue_cad: number;
  orders_count: number;
  new_leads_count: number;
  leads_activated_count: number;
  trials_graduated_count: number;
  dormant_reactivated_count: number;
  basket_eroding_count: number;
};

export default async function PulsePage() {
  // 1. Pull last 12 weekly snapshots from Supabase for trends.
  const supabase = await requireAllowedUser();
  const { data: snapshots, error } = await supabase
    .from("weekly_snapshots")
    .select("week_start,revenue_cad,orders_count,new_leads_count,leads_activated_count,trials_graduated_count,dormant_reactivated_count,basket_eroding_count")
    .order("week_start", { ascending: false })
    .limit(12);

  const orderedNewest: Snapshot[] = (snapshots ?? []) as Snapshot[];
  const orderedOldestToNewest = [...orderedNewest].reverse();
  const latest = orderedNewest[0];
  const prior = orderedNewest[1];

  const wowDelta = (a: number | undefined, b: number | undefined) => {
    if (a == null || b == null) return null;
    if (b === 0) return null;
    return (a - b) / b;
  };

  // 2. Pull live Pipedrive orgs for Lifecycle Bucket counts + anomalies.
  let orgs: EnrichedOrg[] = [];
  let pdErr: string | null = null;
  try {
    orgs = await listEnrichedOrgs(1000);
  } catch (e) {
    pdErr = e instanceof Error ? e.message : String(e);
  }

  const bucketCounts = new Map<string, number>();
  for (const o of orgs) {
    const b = o.lifecycle_bucket ?? "Unknown";
    bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);
  }
  const bucketRows = Array.from(bucketCounts.entries()).sort((a, b) => b[1] - a[1]);

  // 3. Anomaly detection: VIPs (6+ orders) newly dormant or basket-eroding.
  const vipDormant = orgs.filter(
    (o) => (o.order_count ?? 0) >= 6 && (o.cadence_status === "Dormant" || o.cadence_status === "Likely Lost")
  );
  const basketEroding = orgs.filter((o) => o.basket_trend === "Eroding");
  const likelyLost = orgs.filter((o) => o.cadence_status === "Likely Lost");

  let anomalies: string[] = [];
  if (vipDormant.length > 0) {
    anomalies.push(
      `${vipDormant.length} VIP${vipDormant.length === 1 ? "" : "s"} (6+ orders) past 2.5× cadence — personal call.`
    );
  }
  if (basketEroding.length > 0) {
    anomalies.push(
      `${basketEroding.length} account${basketEroding.length === 1 ? "" : "s"} basket-eroding (recent AOV ↓ >25%) — hidden-churn signal.`
    );
  }
  if (likelyLost.length > 0) {
    anomalies.push(
      `${likelyLost.length} account${likelyLost.length === 1 ? "" : "s"} in Likely-Lost tier — consider a reactivation sprint.`
    );
  }
  if (anomalies.length === 0) anomalies.push("No lifecycle anomalies this pull — queue discipline is working.");

  // 4. Pipeline reference: open deals count + total value.
  let openDealsCount = 0;
  let openDealsValue = 0;
  try {
    const deals = await listOpenDeals(1000);
    openDealsCount = deals.length;
    openDealsValue = deals.reduce((s, d) => s + (d.value || 0), 0);
  } catch {
    /* non-fatal */
  }

  const cad = (n: number | string | null) =>
    n == null ? "—" : `$${Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;

  return (
    <>
      <Nav active="pulse" />
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly pulse</h1>
          <p className="mt-1 text-sm text-muted">
            {latest
              ? `Week of ${new Date(latest.week_start).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`
              : "No weekly snapshot yet — the Monday sync will write the first one."}
          </p>
        </div>

        {/* Anomalies-first, per brief */}
        <section className="hk-card">
          <div className="hk-label">Anomalies</div>
          <ul className="mt-3 space-y-2">
            {anomalies.map((a, i) => (
              <li key={i} className="text-sm">
                <span className="mr-2 text-warn">•</span>
                {a}
              </li>
            ))}
          </ul>
          {pdErr ? <p className="mt-3 text-xs text-warn">Pipedrive fetch error: {pdErr}</p> : null}
        </section>

        {/* Big numbers row */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <BigNumber
            label="Revenue (CAD)"
            value={latest?.revenue_cad ?? null}
            format={(v) => cad(v as number)}
            delta={wowDelta(latest?.revenue_cad, prior?.revenue_cad)}
          />
          <BigNumber
            label="Orders"
            value={latest?.orders_count ?? null}
            delta={wowDelta(latest?.orders_count, prior?.orders_count)}
          />
          <BigNumber
            label="New leads"
            value={latest?.new_leads_count ?? null}
            delta={wowDelta(latest?.new_leads_count, prior?.new_leads_count)}
          />
          <BigNumber
            label="Trials graduated"
            value={latest?.trials_graduated_count ?? null}
            delta={wowDelta(latest?.trials_graduated_count, prior?.trials_graduated_count)}
            hint="2-3 → 4+"
          />
        </section>

        {/* Trend chart */}
        {orderedOldestToNewest.length > 1 ? (
          <section className="hk-card">
            <div className="flex items-baseline justify-between">
              <div className="hk-label">Orders, last 12 weeks</div>
              <div className="text-xs text-muted">{orderedOldestToNewest.length} snapshots</div>
            </div>
            <div className="mt-4">
              <TrendChart
                data={orderedOldestToNewest.map((s) => ({
                  label: new Date(s.week_start).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
                  value: s.orders_count ?? 0,
                }))}
              />
            </div>
          </section>
        ) : null}

        {/* Lifecycle bucket breakdown */}
        <section className="hk-card">
          <div className="flex items-baseline justify-between">
            <div className="hk-label">Accounts by Lifecycle Bucket</div>
            <div className="text-xs text-muted">{orgs.length} enriched orgs</div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 text-sm">
            {bucketRows.map(([bucket, count]) => (
              <div key={bucket} className="flex items-baseline justify-between border-b border-line pb-1">
                <span className="text-muted">{bucket}</span>
                <span className="hk-number">{count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Reference row */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="hk-card">
            <div className="hk-label">Open deals</div>
            <div className="mt-2 hk-number text-2xl">{openDealsCount.toLocaleString()}</div>
            <div className="mt-1 text-xs text-muted">Pipedrive, all pipelines</div>
          </div>
          <div className="hk-card">
            <div className="hk-label">Open deal value</div>
            <div className="mt-2 hk-number text-2xl">{cad(openDealsValue)}</div>
          </div>
          <div className="hk-card">
            <div className="hk-label">Errors this session</div>
            <div className="mt-2 text-xs text-muted">
              {error ? `Supabase: ${error.message}` : null}
              {pdErr ? <div>Pipedrive: {pdErr}</div> : null}
              {!error && !pdErr ? "None." : null}
            </div>
          </div>
        </section>

        {!latest ? (
          <section className="hk-card border-warn/40">
            <div className="hk-label text-warn">Setup pending</div>
            <p className="mt-2 text-sm">
              No weekly snapshots found. The sync job writes the first row on the next Monday 07:00 America/Toronto run
              — or trigger it manually with <code>npm run sync:weekly</code>.
            </p>
          </section>
        ) : null}
      </main>
    </>
  );
}
