import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { BigNumber } from "@/components/BigNumber";
import { Sparkline } from "@/components/Sparkline";
import { createClient } from "@/lib/supabase/server";
import { listEnrichedOrgs, listOpenDeals, type EnrichedOrg } from "@/lib/pipedrive";
import { filterByBucket, pipedriveOrgUrl } from "@/lib/queue";
import { GlossaryPopover } from "@/components/GlossaryPopover";
import { fetch12WeekTrends } from "@/lib/trends";

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
  const supabase = await requireAllowedUser();

  // Weekly snapshots (for historical revenue baseline, still useful as a cross-check)
  const { data: snapshots } = await supabase
    .from("weekly_snapshots")
    .select("week_start,revenue_cad,orders_count")
    .order("week_start", { ascending: false })
    .limit(1);
  const latest = (snapshots ?? [])[0] as Snapshot | undefined;

  // Live pulls
  let orgs: EnrichedOrg[] = [];
  let pdErr: string | null = null;
  try {
    orgs = await listEnrichedOrgs();
  } catch (e) {
    pdErr = e instanceof Error ? e.message : String(e);
  }

  const vipDormant = filterByBucket(orgs, "vip_dormant");
  const basketEroding = filterByBucket(orgs, "basket_eroding");
  const likelyLost = filterByBucket(orgs, "likely_lost");
  const graduatingTrials = filterByBucket(orgs, "graduating_trial");

  // Lifecycle distribution for the bottom table + data-quality warning
  const bucketCounts = new Map<string, number>();
  let unclassified = 0;
  for (const o of orgs) {
    if (!o.lifecycle_bucket) {
      unclassified++;
      continue;
    }
    bucketCounts.set(o.lifecycle_bucket, (bucketCounts.get(o.lifecycle_bucket) ?? 0) + 1);
  }
  const bucketRows = Array.from(bucketCounts.entries()).sort((a, b) => b[1] - a[1]);
  const unclassifiedShare = orgs.length ? unclassified / orgs.length : 0;

  // 12-week trends (cached 1 hr)
  let trends: Awaited<ReturnType<typeof fetch12WeekTrends>> | null = null;
  let trendsErr: string | null = null;
  try {
    trends = await fetch12WeekTrends();
  } catch (e) {
    trendsErr = e instanceof Error ? e.message : String(e);
  }

  let openDealsCount = 0;
  let openDealsValue = 0;
  try {
    const deals = await listOpenDeals(1000);
    openDealsCount = deals.length;
    openDealsValue = deals.reduce((s, d) => s + (d.value || 0), 0);
  } catch { /* non-fatal */ }

  const cad = (n: number | string | null) =>
    n == null ? "—" : `$${Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;

  return (
    <>
      <Nav active="pulse" />
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly pulse</h1>
          <p className="mt-1 text-sm text-muted">
            {orgs.length ? `Live across ${orgs.length} enriched orgs` : "Loading…"}
            {latest
              ? ` · Latest snapshot: ${new Date(latest.week_start).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}`
              : ""}
          </p>
        </div>

        {/* Data-quality warning — only when meaningful */}
        {unclassifiedShare > 0.2 ? (
          <section className="rounded-md border border-warn/50 bg-warn/5 p-4">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-sm font-medium text-warn">
                  Data hygiene: {unclassified.toLocaleString()}/{orgs.length.toLocaleString()} accounts
                  ({Math.round(unclassifiedShare * 100)}%) have no Lifecycle Bucket set
                </div>
                <p className="mt-1 text-xs text-muted max-w-2xl">
                  The enrichment script only assigns lifecycle buckets to orgs it can confidently classify from
                  Shopify order history. Unclassified accounts are invisible to every bucket tab below.
                  Fix by tightening Pipedrive tagging (Business Sector, Customer Stage) or linking orgs to their Shopify customer records.
                </p>
              </div>
              <a
                href="https://hokusanteacanada.pipedrive.com/organizations/list"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-warn underline underline-offset-2 shrink-0"
              >
                Open in Pipedrive →
              </a>
            </div>
          </section>
        ) : null}

        {/* 12-week business trends */}
        {trends ? (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Sparkline
              label="Weekly revenue"
              data={trends.revenue}
              format={(v) => `$${Math.round(v).toLocaleString("en-CA")}`}
              termKey="Weekly revenue"
            />
            <Sparkline
              label="Weekly orders"
              data={trends.orders}
              termKey="Weekly orders"
            />
            <Sparkline
              label="Weekly AOV"
              data={trends.aov}
              format={(v) => `$${Math.round(v).toLocaleString("en-CA")}`}
              termKey="Weekly AOV"
            />
            <Sparkline
              label="New leads / wk"
              data={trends.newLeads}
              termKey="New leads per week"
            />
          </section>
        ) : trendsErr ? (
          <p className="text-xs text-warn">Trends fetch error: {trendsErr}</p>
        ) : null}

        {/* Action lists — clickable cards */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnomalyCard
            title="Dormant VIPs"
            tone="warn"
            hint="6+ orders + dormant/likely-lost — Rikko personal call"
            termKey="Dormant-VIP"
            orgs={vipDormant.slice(0, 5)}
            total={vipDormant.length}
            queueLink="/queue?bucket=vip_dormant"
          />
          <AnomalyCard
            title="Basket eroding"
            tone="warn"
            hint="Recent AOV down >25% vs baseline — hidden churn signal"
            termKey="Eroding"
            orgs={basketEroding.slice(0, 5)}
            total={basketEroding.length}
            queueLink="/queue?bucket=basket_eroding"
          />
          <AnomalyCard
            title="Graduating trials"
            tone="good"
            hint="2-3 orders, still warm — highest-leverage cross-sell"
            termKey="Graduating-Trial"
            orgs={graduatingTrials.slice(0, 5)}
            total={graduatingTrials.length}
            queueLink="/queue?bucket=graduating_trial"
          />
          <AnomalyCard
            title="Likely lost"
            tone="muted"
            hint="4×+ cadence silent — last-chance batch"
            termKey="Likely-Lost"
            orgs={likelyLost.slice(0, 5)}
            total={likelyLost.length}
            queueLink="/queue?bucket=likely_lost"
          />
        </section>
        {pdErr ? <p className="text-xs text-warn">Pipedrive fetch error: {pdErr}</p> : null}

        {/* Lifecycle bucket breakdown — rows are drill-throughs */}
        <section className="hk-card">
          <div className="flex items-baseline justify-between">
            <div className="hk-label flex items-center gap-1">
              Accounts by Lifecycle Bucket
              <GlossaryPopover term="Lifecycle Bucket" />
            </div>
            <div className="text-xs text-muted">
              {orgs.length} enriched · {unclassified} unclassified
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 text-sm">
            {bucketRows.map(([bucket, count]) => {
              const bucketKey = bucketToQueueKey(bucket);
              const row = (
                <div className="flex items-baseline justify-between border-b border-line pb-1">
                  <span className="text-muted">{bucket}</span>
                  <span className="hk-number">{count}</span>
                </div>
              );
              return bucketKey ? (
                <Link key={bucket} href={`/queue?bucket=${bucketKey}`} className="hover:text-ink">
                  {row}
                </Link>
              ) : (
                <div key={bucket}>{row}</div>
              );
            })}
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
              {pdErr ? <div>Pipedrive: {pdErr}</div> : null}
              {trendsErr ? <div>Trends: {trendsErr}</div> : null}
              {!pdErr && !trendsErr ? "None." : null}
            </div>
          </div>
        </section>

        {!latest ? (
          <section className="hk-card border-warn/40">
            <div className="hk-label text-warn">Setup pending</div>
            <p className="mt-2 text-sm">
              No weekly snapshots in Supabase yet. Trend charts above pull live from Shopify. Monday&apos;s sync will
              backfill the weekly_snapshots table.
            </p>
          </section>
        ) : null}
      </main>
    </>
  );
}

// Map Pipedrive lifecycle enum label → /queue bucket tab key. Only ones that map to a bucket tab.
function bucketToQueueKey(bucket: string): string | null {
  switch (bucket) {
    case "Dormant-VIP": return "vip_dormant";
    case "At-Risk": return "at_risk";
    case "Graduating-Trial": return "graduating_trial";
    case "First-Time": return "first_to_second";
    case "Likely-Lost": return "likely_lost";
    default: return null;
  }
}

function AnomalyCard({
  title,
  tone,
  hint,
  termKey,
  orgs,
  total,
  queueLink,
}: {
  title: string;
  tone: "warn" | "good" | "muted";
  hint: string;
  termKey?: string;
  orgs: EnrichedOrg[];
  total: number;
  queueLink: string;
}) {
  const toneClass = tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-muted";
  const cad = (n: number | null) =>
    n == null ? "—" : `$${Number(n).toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;

  return (
    <div className="hk-card">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className={`hk-label ${toneClass} inline-flex items-center gap-1`}>
            {title}
            {termKey ? <GlossaryPopover term={termKey} /> : null}
          </div>
          <Link href={queueLink} className="mt-1 block text-xs text-muted hover:text-ink">
            {hint}
          </Link>
        </div>
        <Link href={queueLink} className="hk-number text-2xl shrink-0 hover:underline">
          {total}
        </Link>
      </div>
      {orgs.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing urgent here.</p>
      ) : (
        <ul className="mt-4 space-y-2 text-sm">
          {orgs.map((o) => (
            <li key={o.id} className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0">
              <a
                href={pipedriveOrgUrl(o.id)}
                target="_blank"
                rel="noreferrer"
                className="truncate hover:underline"
                title={o.name}
              >
                {o.name}
              </a>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {cad(o.lifetime_spend_cad)} · {o.days_since_last_order ?? "—"}d
              </span>
            </li>
          ))}
        </ul>
      )}
      {total > orgs.length ? (
        <Link href={queueLink} className="mt-4 inline-block text-xs text-accent hover:underline">
          View all {total} in queue →
        </Link>
      ) : null}
    </div>
  );
}
