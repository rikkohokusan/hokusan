import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? "";
  if (!email.endsWith("@hokusan.ca")) redirect("/login?next=/campaigns");

  return (
    <>
      <Nav active="campaigns" />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Campaign briefs</h1>
        <p className="mt-2 text-sm text-muted">For marketing.</p>
        <section className="hk-card mt-8">
          <div className="hk-label">Phase 2</div>
          <p className="mt-2 text-sm">
            Segment briefs: size, AOV, sector mix, suggested campaign angle. &quot;Generate campaign&quot; will invoke
            the marketing skills (cold-email, email-sequence, copywriting) grounded in live Pipedrive + Shopify data.
            Stubbed for now.
          </p>
        </section>
      </main>
    </>
  );
}
