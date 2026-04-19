import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { listEnrichedOrgs } from "@/lib/pipedrive";
import { QUEUE_BUCKETS, filterByBucket, bucketCounts, suggestedHook, pipedriveOrgUrl, type QueueBucketKey } from "@/lib/queue";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type Params = Promise<{ bucket?: string; sort?: string }>;

export default async function QueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email?.toLowerCase() ?? "";
  if (!email.endsWith("@hokusan.ca")) redirect("/login?next=/queue");

  const params = await searchParams;
  const requestedBucket = (Array.isArray(params.bucket) ? params.bucket[0] : params.bucket) as QueueBucketKey | undefined;
  const activeBucket: QueueBucketKey = (QUEUE_BUCKETS.find((b) => b.key === requestedBucket)?.key) ?? "vip_dormant";

  let orgs: Awaited<ReturnType<typeof listEnrichedOrgs>> = [];
  let err: string | null = null;
  try {
    orgs = await listEnrichedOrgs(2000);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  const counts = bucketCounts(orgs);
  const filtered = filterByBucket(orgs, activeBucket);
  const meta = QUEUE_BUCKETS.find((b) => b.key === activeBucket)!;

  const cad = (n: number | null) =>
    n == null ? "—" : `$${Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;

  return (
    <>
      <Nav active="queue" />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Outreach queue</h1>
            <p className="mt-1 text-sm text-muted">
              Prioritized accounts for sales. {orgs.length} enriched orgs, sorted by LTV then days-since.
            </p>
          </div>
        </div>

        {/* Bucket tabs */}
        <div className="flex flex-wrap gap-2 border-b border-line">
          {QUEUE_BUCKETS.map((b) => (
            <Link
              key={b.key}
              href={`/queue?bucket=${b.key}`}
              className={
                "px-3 py-2 text-sm border-b-2 -mb-px " +
                (b.key === activeBucket
                  ? "border-accent text-ink font-medium"
                  : "border-transparent text-muted hover:text-ink")
              }
            >
              {b.label}
              <span className="ml-2 text-xs text-muted">({counts[b.key]})</span>
            </Link>
          ))}
        </div>

        <p className="text-xs text-muted">{meta.hint}</p>

        {err ? <p className="text-sm text-warn">Pipedrive: {err}</p> : null}

        {/* Table */}
        <div className="overflow-x-auto border border-line rounded-md bg-white">
          <table className="w-full text-sm">
            <thead className="bg-paper border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Account</th>
                <th className="text-left px-4 py-2 font-medium">Sector</th>
                <th className="text-right px-4 py-2 font-medium">LTV</th>
                <th className="text-right px-4 py-2 font-medium">Orders</th>
                <th className="text-right px-4 py-2 font-medium">AOV</th>
                <th className="text-right px-4 py-2 font-medium">Days since</th>
                <th className="text-right px-4 py-2 font-medium">Cadence (d)</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Basket</th>
                <th className="text-left px-4 py-2 font-medium">Top category</th>
                <th className="text-left px-4 py-2 font-medium">Suggested hook</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const silencex = o.personal_cadence_days && o.days_since_last_order
                  ? (o.days_since_last_order / o.personal_cadence_days).toFixed(1)
                  : null;
                const badgeTone =
                  o.cadence_status === "Likely Lost" || o.cadence_status === "Dormant"
                    ? "bg-warn/10 text-warn"
                    : o.cadence_status === "At Risk"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-good/10 text-good";
                const basketTone =
                  o.basket_trend === "Eroding"
                    ? "bg-warn/10 text-warn"
                    : o.basket_trend === "Growing"
                    ? "bg-good/10 text-good"
                    : "text-muted";
                return (
                  <tr key={o.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                    <td className="px-4 py-3">
                      <a
                        href={pipedriveOrgUrl(o.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {o.name}
                      </a>
                      {o.last_3_orders_summary ? (
                        <div className="mt-1 text-xs text-muted line-clamp-1" title={o.last_3_orders_summary}>
                          {o.last_3_orders_summary}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">{o.business_sector ?? "—"}</td>
                    <td className="px-4 py-3 text-right hk-number">{cad(o.lifetime_spend_cad)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{o.order_count ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{cad(o.avg_order_value)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {o.days_since_last_order ?? "—"}
                      {silencex ? <span className="ml-1 text-xs text-muted">({silencex}×)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{o.personal_cadence_days ?? "—"}</td>
                    <td className="px-4 py-3">
                      {o.cadence_status ? (
                        <span className={`inline-block rounded px-2 py-0.5 text-xs ${badgeTone}`}>
                          {o.cadence_status}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-xs ${basketTone}`}>{o.basket_trend ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{o.top_product_category ?? "—"}</td>
                    <td className="px-4 py-3 text-xs max-w-xs">{suggestedHook(o)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted">
                    No accounts in this bucket right now — healthy signal.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">
          Click any account name to jump into Pipedrive. Data refreshes every page load. Last 3 orders show on hover.
        </p>
      </main>
    </>
  );
}
