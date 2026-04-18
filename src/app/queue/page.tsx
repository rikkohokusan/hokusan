import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? "";
  if (!email.endsWith("@hokusan.ca")) redirect("/login?next=/queue");

  return (
    <>
      <Nav active="queue" />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Outreach queue</h1>
        <p className="mt-2 text-sm text-muted">For the sales team.</p>
        <section className="hk-card mt-8">
          <div className="hk-label">Phase 2</div>
          <p className="mt-2 text-sm">
            This will mirror Pipedrive&apos;s <em>📞 Outreach Pulse</em> filter: a live prioritized queue with
            &quot;mark outcome&quot; actions that write to <code>outcomes_log</code>. Stubbed for now.
          </p>
          <ul className="mt-3 text-sm text-muted list-disc pl-5">
            <li>Graduating Trials (bucket 3)</li>
            <li>First-to-second order (bucket 2)</li>
            <li>Dormant VIPs (bucket 4)</li>
            <li>Basket-eroding accounts</li>
          </ul>
        </section>
      </main>
    </>
  );
}
