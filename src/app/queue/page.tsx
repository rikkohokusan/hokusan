import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { listEnrichedOrgs } from "@/lib/pipedrive";
import { QUEUE_BUCKETS, filterByBucket, bucketCounts, suggestedHook, pipedriveOrgUrl, type QueueBucketKey } from "@/lib/queue";
import { GLOSSARY } from "@/lib/glossary";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// Known sales owners. Rikko first, then alphabetical. hokusan_team is excluded (service account).
const OWNERS = [
  { id: "all", label: "All" },
  { id: "self", label: "Rikko" },
  { id: "atsuko", label: "Atsuko" },
  { id: "erina", label: "Erina" },
  { id: "tomoe", label: "Tomoe" },
  { id: "yui", label: "Yui" },
  { id: "unassigned", label: "Unassigned" },
] as const;
type OwnerKey = (typeof OWNERS)[number]["id"];

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

  const requestedOwner = (Array.isArray(params.owner) ? params.owner[0] : params.owner) as OwnerKey | undefined;
  const activeOwner: OwnerKey = OWNERS.find((o) => o.id === requestedOwner)?.id ?? "all";

  let orgs: Awaited<ReturnType<typeof listEnrichedOrgs>> = [];
  let err: string | null = null;
  try {
    orgs = await listEnrichedOrgs();
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  // Always exclude the hokusan_team service account (user_id 24063619) from owner-filtered views,
  // per data-model.md convention. Only show these orgs under "Unassigned" if explicitly requested.
  const HOKUSAN_TEAM_OWNER_ID = 24063619;
  const filteredByOwner = orgs.filter((o) => {
    if (activeOwner === "all") return o.owner_id !== HOKUSAN_TEAM_OWNER_ID;
    if (activeOwner === "unassigned") return !o.owner_id || o.owner_id === HOKUSAN_TEAM_OWNER_ID;
    const ownerName = (o.owner_name || "").toLowerCase();
    if (activeOwner === "self") return ownerName.includes("rikko");
    return ownerName.includes(activeOwner);
  });

  const counts = bucketCounts(filteredByOwner);
  const filtered = filterByBucket(filteredByOwner, activeBucket);
  const meta = QUEUE_BUCKETS.find((b) => b.key === activeBucket)!;

  // Owner counts across ALL orgs (unfiltered by bucket) for the top segmented control
  const ownerCounts: Record<OwnerKey, number> = {
    all: orgs.filter((o) => o.owner_id !== HOKUSAN_TEAM_OWNER_ID).length,
    self: orgs.filter((o) => (o.owner_name || "").toLowerCase().includes("rikko")).length,
    atsuko: orgs.filter((o) => (o.owner_name || "").toLowerCase().includes("atsuko")).length,
    erina: orgs.filter((o) => (o.owner_name || "").toLowerCase().includes("erina")).length,
    tomoe: orgs.filter((o) => (o.owner_name || "").toLowerCase().includes("tomoe")).length,
    yui: orgs.filter((o) => (o.owner_name || "").toLowerCase().includes("yui")).length,
    unassigned: orgs.filter((o) => !o.owner_id || o.owner_id === HOKUSAN_TEAM_OWNER_ID).length,
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

        {/* Owner filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted mr-2">Owner</span>
          {OWNERS.map((o) => (
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
              <span className="ml-1.5 opacity-60">{ownerCounts[o.id] ?? 0}</span>
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
                  <td colSpan={12} className="px-4 py-10 text-center text-sm text-muted">
                    No accounts in this bucket for {activeOwner === "all" ? "the team" : OWNERS.find((o) => o.id === activeOwner)?.label} — healthy signal.
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
