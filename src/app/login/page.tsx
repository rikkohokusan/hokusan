import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="hk-card w-full max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">Hokusan Insights</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in with a <code>@hokusan.ca</code> email.
        </p>
        <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
