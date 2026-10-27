import { useEffect, useState } from "react";
import type { HealthResponse } from "../shared/types.ts";

type Status = { state: "loading" } | { state: "ok"; health: HealthResponse } | { state: "offline" };

export default function App() {
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((health: HealthResponse) => setStatus({ state: "ok", health }))
      .catch(() => setStatus({ state: "offline" }));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-violet-700">Trend Scout</h1>
        <p className="mt-2 text-lg text-slate-600">
          Find trending TikToks, Reels and Shorts that fit your niche.
        </p>
      </div>

      <section aria-labelledby="status-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 id="status-heading" className="font-semibold text-slate-800">
          Setup status
        </h2>
        <ul className="mt-3 space-y-2 text-sm" aria-live="polite">
          {status.state === "loading" && <li className="text-slate-500">Checking…</li>}
          {status.state === "offline" && (
            <li className="text-amber-700">
              Backend not reachable. Run <code>npx netlify dev</code> locally, or check the Netlify deploy.
            </li>
          )}
          {status.state === "ok" && (
            <>
              <StatusRow label="Backend online" ok={status.health.ok} />
              <StatusRow label="Scrape Creators API key set" ok={status.health.apiKeyConfigured} />
              <StatusRow label="Access password set" ok={status.health.passwordConfigured} />
            </>
          )}
        </ul>
      </section>

      <p className="text-sm text-slate-500">Search is coming in the next milestones.</p>
    </main>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true">{ok ? "✅" : "⚠️"}</span>
      <span className={ok ? "text-slate-700" : "text-amber-700"}>
        {label}
        <span className="sr-only">: {ok ? "yes" : "no"}</span>
      </span>
    </li>
  );
}
