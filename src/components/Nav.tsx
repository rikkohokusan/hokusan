import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function Nav({ active }: { active: "pulse" | "queue" | "campaigns" }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  const tabs: Array<[typeof active, string, string]> = [
    ["pulse", "Pulse", "/pulse"],
    ["queue", "Queue", "/queue"],
    ["campaigns", "Campaigns", "/campaigns"],
  ];

  return (
    <header className="border-b border-line bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/pulse" className="font-semibold tracking-tight">
            Hokusan <span className="text-muted">Insights</span>
          </Link>
          <nav className="flex gap-6 text-sm">
            {tabs.map(([key, label, href]) => (
              <Link
                key={key}
                href={href}
                className={
                  key === active
                    ? "text-ink font-medium border-b-2 border-accent pb-3 -mb-4"
                    : "text-muted hover:text-ink"
                }
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted">
          {data.user?.email ? <span>{data.user.email}</span> : null}
          <form action="/auth/signout" method="post">
            <button className="hover:text-ink underline underline-offset-4" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
