"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const errorReason = params.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push(params.get("next") || "/pulse");
    router.refresh();
  }

  return (
    <>
      {errorReason === "not_allowed" ? (
        <p className="mt-4 text-sm text-warn">
          That account isn&apos;t on the allowlist. Use a Hokusan email.
        </p>
      ) : null}

      <form onSubmit={signIn} className="mt-6 space-y-3">
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@hokusan.ca"
          className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          disabled={busy}
          className="w-full rounded-md bg-accent text-white py-2 text-sm disabled:opacity-60"
          type="submit"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {err ? <p className="text-sm text-warn">{err}</p> : null}
      </form>
    </>
  );
}
