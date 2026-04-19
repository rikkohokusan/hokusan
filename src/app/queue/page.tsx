import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { listEnrichedOrgs, listPipedriveUsers } from "@/lib/pipedrive";
import { QUEUE_BUCKETS, filterByBucket, bucketCounts, suggestedHook, pipedriveOrgUrl, type QueueBucketKey } from "@/lib/queue";
import { GLOSSARY } from "@/lib/glossary";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HOKUSAN_TEAM_OWNER_ID = 24063619;

function daysBetween(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 9999;
  return Math.floor((Date.now() - then) / 86400000);
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email?.toLowerCase() ?? "";
  if (!email.endsWith("@hokusan.ca")) redirect("/login?next=/queue");

  const params = await searchParams;
  const requestedBucket = (Array.isArray(params.bucket) ? params.bucket[0] : params.bucket) as QueueBucketKey | undefined;
  const activeBucket: QueueBucketKey = QUEUE_BUCKETS.find((b) => b.key === requestedBucket)?.key ?? "vip_dormant";

  const requestedOwner = Array.isArray(params.owner) ? params.owner[0] : params.owner;

  // Pull live team from Pipedrive, exclude the hokusan_team service account.
  let orgs: Awaited<ReturnType<typeof listEnrichedOrgs>> = [];
  let users: Awaited<ReturnType<typeof listPipedriveUsers>> = [];
  let err: string | null = null;
  try {
    [orgs, users] = await Promise.all([listEnrichedOrgs(), listPipedriveUsers()]);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  const salesTeam = users
    .filter((u) => u.id !== HOKUSAN_TEAM_OWNER_ID)
    .sort((a, b) => {
      // Rikko first, then alphabetical
      if (/rikko/i.test(a.name)) return -1;
      if (/rikko/i.test(b.name)) return 1;
      return a.name.localeCompare(b.name);
    });

  // Owner filter: "all" | "unassigned" | Pipedrive user id (as string)
  const validOwnerIds = new Set<string>(["all", "unassigned", ...salesTeam.map((u) => String(u.id))]);
  const activeOwner = requestedOwner && validOwnerIds.has(requestedOwner) ? requestedOwner : "all";

  const filteredByOwner = orgs.filter((o) => {
    if (activeOwner === "all") return o.owner_id !== HOKUSAN_TEAM_OWNER_ID;
    if (activeOwner === "unassigned") return !o.owner_id || o.owner_id === HOKUSAN_TEAM_OWNER_ID;
    return String(o.owner_id) === activeOwner;
  });

  const counts = bucketCounts(filteredByOwner);
  const filtered = filterByBucket(filteredByOwner, activeBucket);
  const meta = QUEUE_BUCKETS.find((b) => b.key === activeBucket)!;

  // Counts per owner pill
  const countFor = (ownerKey: string) => {
    if (ownerKey === "all") return orgs.filter((o) => o.owner_id !== HOKUSAN_TEAM_OWNER_ID).length;
    if (ownerKey === "unassigned") return orgs.filter((o) => !o.owner_id || o.owner_id === HOKUSAN_TEAM_OWNER_ID).length;
    return orgs.filter((o) => String(o.owner_id) === ownerKey).length;
  };

  const cad = (n: number | null) =>
    n == null ? "—" : `$${Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;

  const keepOwner = (bucket: string) =>
    `/queue?bucket=${bucket}${activeOwner !== "all" ? `&owner=${activeOwner}` : ""}`;
  const keepBucket = (owner: string) =>
    `/queue?bucket=${activeBucket}${owner !== "all" ? `&owner=${owner}` : ""}`;

  return (
    <>
      <Nav active="queue" />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Outreach queue</h1>
            <p className="mt-1 text-sm text-muted">
              Prioritized accounts for sales. {orgs.length} enriched orgs, sorted by LTV.
            </p>
          </div>
        </div>

        {/* Owner filter — live from Pipedrive */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted mr-2">Owner</span>
          {[
            { id: "all", label: "All" },
            ...salesTeam.map((u) => ({ id: String(u.id), label: u.name.split(" ")[0] })),
            { id: "unassigned", label: "Unassigned" },
          ].map((o) => (
            <Link
              key={o.id}
              href={keepBucket(o.id)}
              className={
                "rounded-full px-3 py-1 text-xs border " +
                (o.id === activeOwner
                  ? "bg-accent text-white border-accent"
                  : "border-line text-muted hover:text-ink hover:border-ink")
              }
            >
              {o.label}
              <span className="ml-1.5 opacity-60">{countFor(o.id)}</span>
            </Link>
          ))}
        </div>

        {/* Bucket tabs */}
        <div className="flex flex-wrap gap-2 border-b border-line">
          {QUEUE_BUCKETS.map((b) => {
            const tooltipKey =
              b.key === "vip_dormant" ? "Dormant-VIP"
              : b.key === "basket_eroding" ? "Eroding"
              : b.key === "at_risk" ? "At-Risk"
              : b.key === "graduating_trial" ? "Graduating-Trial"
              : b.key === "first_to_second" ? "First-Time"
              : b.key === "likely_lost" ? "Likely-Lost"
              : null;
            const tip = tooltipKey ? GLOSSARY[tooltipKey] : undefined;
            return (
              <Link
                key={b.key}
                href={keepOwner(b.key)}
                title={tip}
                className={
                  "px-3 py-2 text-sm border-b-2 -mb-px " +
                  (b.key === activeBucket
                    ? "border-accent text-ink font-medium"
                    : "border-transparent text-muted hover:text-ink")
                }
              >
                {b.label}
                <span className="ml-2 text-xs text-muted">({counts[b.key]})</span>
                {tip ? <span className="ml-1 text-muted cursor-help">ⓘ</span> : null}
              </Link>
            );
          })}
        </div>

        <p className="text-xs text-muted">{meta.hint}</p>

        {err ? <p className="text-sm text-warn">Pipedrive: {err}</p> : null}

        {/* Table */}
        <div className="overflow-x-auto border border-line rounded-md bg-white">
          <table className="w-full text-sm">
            <thead className="bg-paper border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Account</th>
                <th className="text-left px-4 py-2 font-medium">Owner</th>
                <th className="text-left px-4 py-2 font-medium">Sector</th>
                <th className="text-right px-4 py-2 font-medium">LTV</th>
                <th className="text-right px-4 py-2 font-medium">Orders</th>
                <th className="text-right px-4 py-2 font-medium">AOV</th>
                <th className="text-right px-4 py-2 font-medium" title="Days since last order">Silence</th>
                <th className="text-left px-4 py-2 font-medium" title="Days since last Pipedrive activity (email, call, meeting) on this org">Last touch</th>
                <th className="text-center px-4 py-2 font-medium" title="Account already has an open deal being worked — skip to avoid double-touching">Open deal</th>
                <th className="text-right px-4 py-2 font-medium" title={GLOSSARY["Personal Cadence"]}>
                  Cadence <span className="text-muted cursor-help">ⓘ</span>
                </th>
                <th className="text-left px-4 py-2 font-medium" title={GLOSSARY["Cadence Status"]}>
                  Status <span className="text-muted cursor-help">ⓘ</span>
                </th>
                <th className="text-left px-4 py-2 font-medium" title={GLOSSARY["Basket Trend"]}>
                  Basket <span className="text-muted cursor-help">ⓘ</span>
                </th>
                <th className="text-left px-4 py-2 font-medium">Top category</th>
                <th className="text-left px-4 py-2 font-medium">Suggested hook</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const silencex = o.personal_cadence_days && o.days_since_last_order
                  ? (o.days_since_last_order / o.personal_cadence_days).toFixed(1)
                  : null;
                const statusTip = o.cadence_status ? GLOSSARY[o.cadence_status] : undefined;
                const basketTip = o.basket_trend ? GLOSSARY[o.basket_trend] : undefined;
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
                      <a href={pipedriveOrgUrl(o.id)} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                        {o.name}
                      </a>
                      {o.last_3_orders_summary ? (
                        <div className="mt-1 text-xs text-muted line-clamp-1" title={o.last_3_orders_summary}>
                          {o.last_3_orders_summary}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{o.owner_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{o.business_sector ?? "—"}</td>
                    <td className="px-4 py-3 text-right hk-number">{cad(o.lifetime_spend_cad)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{o.order_count ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{cad(o.avg_order_value)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {o.days_since_last_order ?? "—"}
                      {silencex ? <span className="ml-1 text-xs text-muted">({silencex}×)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {o.last_activity_date
                        ? <span className={
                            daysBetween(o.last_activity_date) > 30 ? "text-warn" :
                            daysBetween(o.last_activity_date) > 14 ? "text-amber-700" : "text-muted"
                          }>{daysBetween(o.last_activity_date)}d ago</span>
                        : <span className="text-muted">never</span>}
                      {(o.activities_count ?? 0) > 0 ? (
                        <span className="ml-1 text-muted">· {o.activities_count}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {(o.open_deals_count ?? 0) > 0
                        ? <span className="text-good" title={`${o.open_deals_count} open deal(s)`}>● {o.open_deals_count}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{o.personal_cadence_days ?? "—"}</td>
                    <td className="px-4 py-3">
                      {o.cadence_status ? (
                        <span className={`inline-block rounded px-2 py-0.5 text-xs ${badgeTone}`} title={statusTip}>
                          {o.cadence_status}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-xs ${basketTone}`} title={basketTip}>{o.basket_trend ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{o.top_product_category ?? "—"}</td>
                    <td className="px-4 py-3 text-xs max-w-xs">{suggestedHook(o)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-sm text-muted">
                    No accounts in this bucket for {
                      activeOwner === "all" ? "the team"
                      : activeOwner === "unassigned" ? "unassigned accounts"
                      : salesTeam.find((u) => String(u.id) === activeOwner)?.name?.split(" ")[0] ?? "this owner"
                    } — healthy signal.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">
          Click any account name to jump to Pipedrive. Hover on jargon (ⓘ) for plain-English definitions.
        </p>
      </main>
    </>
  );
}
