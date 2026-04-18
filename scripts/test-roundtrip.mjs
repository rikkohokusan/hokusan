#!/usr/bin/env node
// One-shot roundtrip: insert a test row, read it back, delete it.
// Verifies the Supabase schema is live + the service role key is valid.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/test-roundtrip.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const testDate = "1970-01-05"; // fixed sentinel, well before real data

console.log("→ insert test row");
const { error: insErr } = await supabase
  .from("weekly_snapshots")
  .upsert(
    {
      week_start: testDate,
      revenue_cad: 123.45,
      orders_count: 3,
      new_leads_count: 1,
      leads_activated_count: 0,
      trials_graduated_count: 0,
      dormant_reactivated_count: 0,
      basket_eroding_count: 0,
      raw_data: { source: "test-roundtrip.mjs" },
    },
    { onConflict: "week_start" }
  );
if (insErr) throw new Error(`insert failed: ${insErr.message}`);
console.log("  ok");

console.log("→ read it back");
const { data, error: readErr } = await supabase
  .from("weekly_snapshots")
  .select("*")
  .eq("week_start", testDate)
  .single();
if (readErr) throw new Error(`read failed: ${readErr.message}`);
console.log("  got:", data);

console.log("→ delete test row");
const { error: delErr } = await supabase
  .from("weekly_snapshots")
  .delete()
  .eq("week_start", testDate);
if (delErr) throw new Error(`delete failed: ${delErr.message}`);
console.log("  ok");

console.log("\n✓ Supabase roundtrip healthy.");
