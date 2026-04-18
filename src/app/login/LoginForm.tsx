"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const params = useSearchParams();
  const errorReason = params.get("error");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      params.get("next") || "/pulse"
    )}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSent(true);
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      params.get("next") || "/pulse"
    )}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (error) setErr(error.message);
  }

  return (
    <>
      {errorReason === "not_allowed" ? (
        <p className="mt-4 text-sm text-warn">
          That account isn&apos;t on the allowlist. Use a Hokusan email or ask Rikko to add you.
        </p>
      ) : errorReason === "auth_failed" ? (
        <p className="mt-4 text-sm text-warn">Sign-in link expired or invalid. Try again.</p>
      ) : null}

      <div className="mt-6 space-y-3">
        <button
          onClick={signInWithGoogle}
          className="w-full rounded-md border border-line py-2 text-sm hover:bg-paper"
          type="button"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex-1 border-t border-line" />
          or
          <span className="flex-1 border-t border-line" />
        </div>

        {sent ? (
          <p className="text-sm text-good">
            Check <strong>{email}</strong> for a magic link.
          </p>
        ) : (
          <form onSubmit={sendMagicLink} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hokusan.ca"
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              disabled={busy}
              className="w-full rounded-md bg-accent text-white py-2 text-sm disabled:opacity-60"
              type="submit"
            >
              {busy ? "Sending…" : "Email me a magic link"}
            </button>
            {err ? <p className="text-sm text-warn">{err}</p> : null}
          </form>
        )}
      </div>
    </>
  );
}
