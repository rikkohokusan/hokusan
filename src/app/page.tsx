import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Supabase magic-link emails sometimes strip the path from redirect_to and land the
  // user at /?code=… or /?token_hash=…. Forward those to the dedicated callback.
  const params = await searchParams;
  if (params.code || params.token_hash) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string") qs.set(k, v);
    }
    redirect(`/auth/callback?${qs.toString()}`);
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/pulse");
  redirect("/login");
}
