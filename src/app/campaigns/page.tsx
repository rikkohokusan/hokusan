import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { listEnrichedOrgs, type EnrichedOrg } from "@/lib/pipedrive";
import { pipedriveOrgUrl } from "@/lib/queue";
import { GLOSSARY } from "@/lib/glossary";
import { buildSegmentPrompt } from "@/lib/promptTemplates";
import { DraftPromptButton } from "@/components/DraftPromptButton";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type GroupKey = "sector" | "bucket" | "category";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email?.toLowerCase() ?? "";
  if (!email.endsWith("@hokusan.ca")) redirect("/login?next=/campaigns");

  const params = await searchParams;
  const requestedGroup = Array.isArray(params.group) ? params.group[0] : params.group;
  const groupBy: GroupKey = (["sector", "bucket", "category"] as const).includes(requestedGroup as GroupKey)
    ? (requestedGroup as GroupKey)
    : "bucket";

  const focus = Array.isArray(params.focus) ? params.focus[0] : params.focus;

  let orgs: EnrichedOrg[] = [];
  let err: string | null = null;
  try {
    orgs = await listEnrichedOrgs();
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  // Separate the "unclassified" bucket/sector/category into its own data-quality warning
  const UNCLASSIFIED_LABELS = new Set(["(unassigned)", "(unknown sector)", "(unclassified)"]);
  const allGroups = groupOrgs(orgs, groupBy);
  const groups = allGroups.filter((g) => !UNCLASSIFIED_LABELS.has(g.label));
  const unclassified = allGroups.find((g) => UNCLASSIFIED_LABELS.has(g.label));
  const unclassifiedShare = orgs.length ? (unclassified?.count ?? 0) / orgs.length : 0;

  const cad = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;

  const groupLabel =
    groupBy === "bucket" ? "lifecycle bucket" : groupBy === "sector" ? "business sector" : "top product category";

  return (
    <>
      <Nav active="campaigns" />
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaign segments</h1>
          <p className="mt-1 text-sm text-muted">
            Segment briefs for marketing. Click a segment to see the account list + draft outreach.
          </p>
        </div>

        {/* Group-by tabs */}
        <div className="flex gap-2 border-b border-line">
          {(["bucket", "sector", "category"] as const).map((g) => (
            <Link
              key={g}
              href={`/campaigns?group=${g}`}
              className={
                "px-3 py-2 text-sm border-b-2 -mb-px " +
                (g === groupBy ? "border-accent text-ink font-medium" : "border-transparent text-muted hover:text-ink")
              }
            >
              {g === "bucket" ? "By lifecycle" : g === "sector" ? "By sector" : "By product"}
            </Link>
          ))}
        </div>

        {err ? <p className="text-sm text-warn">Pipedrive: {err}</p> : null}

        {/* Data-quality warning */}
        {unclassified && unclassifiedShare > 0.2 ? (
          <section className="rounded-md border border-warn/50 bg-warn/5 p-4">
            <div className="text-sm font-medium text-warn">
              {unclassified.count.toLocaleString()} accounts ({Math.round(unclassifiedShare * 100)}%) have no {groupLabel} set
            </div>
            <p className="mt-1 text-xs text-muted max-w-2xl">
              Untagged accounts are invisible to every segment below — marketing can&apos;t include them in a campaign
              until they&apos;re classified. Fix in Pipedrive by setting {groupLabel} on each org.
            </p>
          </section>
        ) : null}

        {/* Segment grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => {
            const bucketTip = groupBy === "bucket" ? GLOSSARY[g.label] : undefined;
            return (
              <Link
                key={g.label}
                href={`/campaigns?group=${groupBy}&focus=${encodeURIComponent(g.label)}`}
                className={
                  "hk-card transition hover:border-accent hover:shadow-sm " +
                  (focus === g.label ? "border-accent" : "")
                }
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-medium text-sm" title={bucketTip}>
                    {g.label}
                    {bucketTip ? <span className="ml-1 text-muted cursor-help">ⓘ</span> : null}
                  </h3>
                  <span className="hk-number text-2xl">{g.count}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
                  <span>LTV</span>
                  <span className="text-right text-ink">{cad(g.totalLtv)}</span>
                  <span>Avg AOV</span>
                  <span className="text-right text-ink">{cad(g.avgAov)}</span>
                  <span>Avg orders</span>
                  <span className="text-right text-ink">{g.avgOrders.toFixed(1)}</span>
                  {g.topSector ? (
                    <>
                      <span>Top sector</span>
                      <span className="text-right text-ink truncate">{g.topSector}</span>
                    </>
                  ) : null}
                  {g.topCategory ? (
                    <>
                      <span>Top product</span>
                      <span className="text-right text-ink truncate">{g.topCategory}</span>
                    </>
                  ) : null}
                </div>
                <p className="mt-3 text-xs">{g.angle}</p>
              </Link>
            );
          })}
        </section>

        {/* Focused segment — account list */}
        {focus ? <FocusPanel groups={groups} focus={focus} groupBy={groupBy} /> : null}
      </main>
    </>
  );
}

// ------------------------------------------------------------------
// Grouping + campaign-angle logic
// ------------------------------------------------------------------

type Segment = {
  label: string;
  count: number;
  totalLtv: number;
  avgAov: number;
  avgOrders: number;
  topSector: string | null;
  topCategory: string | null;
  angle: string;
  orgs: EnrichedOrg[];
};

function groupOrgs(orgs: EnrichedOrg[], by: "sector" | "bucket" | "category"): Segment[] {
  const keyFn = (o: EnrichedOrg) =>
    by === "sector"
      ? o.business_sector || "(unknown sector)"
      : by === "bucket"
      ? o.lifecycle_bucket || "(unassigned)"
      : o.top_product_category || "(unclassified)";

  const map = new Map<string, EnrichedOrg[]>();
  for (const o of orgs) {
    const k = keyFn(o);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(o);
  }

  const segments: Segment[] = [];
  for (const [label, list] of map.entries()) {
    const ltv = list.reduce((s, o) => s + (o.lifetime_spend_cad ?? 0), 0);
    const orders = list.reduce((s, o) => s + (o.order_count ?? 0), 0);
    const aovSum = list.reduce((s, o) => s + (o.avg_order_value ?? 0), 0);
    const avgAov = list.length ? aovSum / list.length : 0;
    const avgOrders = list.length ? orders / list.length : 0;

    const topSector = topValue(list.map((o) => o.business_sector).filter(Boolean) as string[]);
    const topCategory = topValue(list.map((o) => o.top_product_category).filter(Boolean) as string[]);

    segments.push({
      label,
      count: list.length,
      totalLtv: ltv,
      avgAov,
      avgOrders,
      topSector: by === "sector" ? null : topSector,
      topCategory: by === "category" ? null : topCategory,
      angle: suggestCampaignAngle(label, by, { topSector, topCategory, avgOrders }),
      orgs: [...list].sort((a, b) => (b.lifetime_spend_cad ?? 0) - (a.lifetime_spend_cad ?? 0)),
    });
  }

  return segments.sort((a, b) => b.totalLtv - a.totalLtv);
}

function topValue(arr: string[]): string | null {
  if (!arr.length) return null;
  const counts = new Map<string, number>();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function suggestCampaignAngle(
  label: string,
  by: "sector" | "bucket" | "category",
  ctx: { topSector: string | null; topCategory: string | null; avgOrders: number }
): string {
  if (by === "bucket") {
    const l = label.toLowerCase();
    if (l.includes("graduating") || l.includes("trial")) return "Cross-sell: second SKU for sector fit. Highest-leverage segment.";
    if (l.includes("dormant") || l.includes("vip")) return "Personal win-back — reference last SKU, ask what changed.";
    if (l.includes("at-risk") || l.includes("at risk")) return "Light cadence nudge — no discount, just visibility.";
    if (l.includes("likely-lost")) return "Last-chance batch — honest 'anything we can do?' or archive.";
    if (l.includes("established")) return "Cross-sell adjacent grades + product education content.";
    if (l.includes("first-time")) return "Second-order email referencing their first SKU + reorder CTA.";
    if (l.includes("unactivated")) return "Application-form revival sprint (semi-annual cadence).";
    return "Segment-specific sequence.";
  }
  if (by === "sector") {
    const s = label.toLowerCase();
    if (/cafe|café/.test(s)) return "H-M2 ceremonial + matcha baking grade = margin protection + pastry program.";
    if (/bubble tea/.test(s)) return "Volume pricing on H-M2 1kg — lock in primary matcha SKU.";
    if (/ice cream/.test(s)) return "Culinary grade for bases; ceremonial for retail scoops.";
    if (/sushi/.test(s)) return "Sencha + genmaicha service tea — loose leaf program.";
    if (/bakery|cake|donut|cookie/.test(s)) return "Matcha baking grade + hojicha powder for flavor range.";
    if (/wellness|herbal|beauty/.test(s)) return "Ceremonial grade + origin storytelling.";
    return `Sector angle: review top buyers in ${label} and replicate their product mix.`;
  }
  // category
  const c = label.toLowerCase();
  if (c.includes("ceremonial")) return "Premium tier — anchor on provenance + consistency.";
  if (c.includes("culinary")) return "Volume play — protect the latte/pastry margin.";
  if (c.includes("hojicha")) return "Seasonal / winter-forward menu positioning.";
  if (c.includes("niju")) return "Retail-facing — highlight Niju brand for shelf programs.";
  return "Product-led story — ground in actual buyers' feedback.";
}

// ------------------------------------------------------------------
// Focus panel — the expanded account list for a clicked segment
// ------------------------------------------------------------------

function FocusPanel({ groups, focus, groupBy }: { groups: Segment[]; focus: string; groupBy: GroupKey }) {
  const seg = groups.find((g) => g.label === focus);
  if (!seg) return null;
  const cad = (n: number | null) =>
    n == null ? "—" : `$${Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;

  return (
    <section className="hk-card">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="hk-label">{groupBy === "bucket" ? "Lifecycle" : groupBy === "sector" ? "Sector" : "Product"}</div>
          <h2 className="mt-1 text-lg font-semibold">{seg.label}</h2>
          <div className="mt-1 text-xs text-muted">{seg.count} accounts · {cad(seg.totalLtv)} total LTV</div>
        </div>
        <DraftPromptButton
          segmentLabel={seg.label}
          prompt={buildSegmentPrompt({
            label: seg.label,
            groupBy,
            count: seg.count,
            totalLtv: seg.totalLtv,
            avgAov: seg.avgAov,
            avgOrders: seg.avgOrders,
            topSector: seg.topSector,
            topCategory: seg.topCategory,
            orgs: seg.orgs.slice(0, 10),
          })}
        />
      </div>
      <p className="mt-2 text-sm">{seg.angle}</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted border-b border-line">
            <tr>
              <th className="text-left py-2">Account</th>
              <th className="text-right py-2">LTV</th>
              <th className="text-right py-2">Orders</th>
              <th className="text-right py-2">AOV</th>
              <th className="text-right py-2">Days since</th>
              <th className="text-left py-2 pl-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {seg.orgs.slice(0, 50).map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="py-2">
                  <a href={pipedriveOrgUrl(o.id)} target="_blank" rel="noreferrer" className="hover:underline">
                    {o.name}
                  </a>
                </td>
                <td className="py-2 text-right tabular-nums">{cad(o.lifetime_spend_cad)}</td>
                <td className="py-2 text-right tabular-nums">{o.order_count ?? "—"}</td>
                <td className="py-2 text-right tabular-nums">{cad(o.avg_order_value)}</td>
                <td className="py-2 text-right tabular-nums">{o.days_since_last_order ?? "—"}</td>
                <td className="py-2 pl-4 text-xs text-muted">{o.cadence_status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {seg.orgs.length > 50 ? (
          <p className="mt-3 text-xs text-muted">Showing top 50 by LTV of {seg.orgs.length} total.</p>
        ) : null}
      </div>
    </section>
  );
}
