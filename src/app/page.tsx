import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/pulse");
  redirect("/login");
}
