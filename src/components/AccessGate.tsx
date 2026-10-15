import { SignOutButton } from "./Cartridges";
import React, { useCallback, useEffect, useState } from "react";

export type Me = {
  email: string | null;
  hasAccess: boolean;
  isAdmin: boolean;
  ageConfirmed: boolean;
  devLogin: boolean;
  gevUrl?: string;
};

const card = "w-full max-w-sm rounded-2xl bg-[#1B1D21] border border-white/10 p-5 text-slate-100 shadow-xl";
const input = "w-full mt-1 bg-black/40 border border-white/15 focus:border-[#EF5B14] rounded-lg px-3 py-2.5 text-base text-white outline-none";
const btn = "w-full mt-3 py-3 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] text-white font-semibold cursor-pointer disabled:opacity-50";

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, ...j } as { ok: boolean; error?: string };
}

function LegalLinks() {
  return (
    <p className="mt-4 text-xs text-slate-400 text-center">
      <a className="underline" href="/privacy.html">Privacy</a> · <a className="underline" href="/terms.html">Terms</a>
    </p>
  );
}

/** Sign-in / guest code / 18+ gate. The server enforces all of these too; this is just the UI. */
export function AccessGate({ children }: { children: (me: Me) => React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [age, setAge] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);

  const load = useCallback(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => setErr("Can't reach Study Buddy right now."));
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setErr("");
    const r = await fn().catch(() => ({ ok: false, error: "Network error" }));
    setBusy(false);
    if (!r.ok) setErr(r.error || "Something went wrong"); else load();
  };

  if (!me) return <div className="min-h-screen bg-[#16171A] flex items-center justify-center text-slate-400">{err || "Loading…"}</div>;
  if (me.hasAccess && me.ageConfirmed) return <>{children(me)}</>;

  return (
    <div className="min-h-screen bg-[#16171A] flex flex-col items-center justify-center p-4">
      {me.email && <SignOutButton className="fixed top-3 right-3" />}
      <h1 className="text-2xl font-bold text-white mb-4">STUDY BUDDY</h1>
      {me.hasAccess ? (
        <div className={card} data-testid="age-gate">
          <h2 className="text-lg font-bold">Adults only (18+)</h2>
          <p className="mt-2 text-sm text-slate-300">Study Buddy is for people 18 and older. Signed in as {me.email}.</p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 w-5 h-5" checked={age} onChange={(e) => setAge(e.target.checked)} aria-label="I am 18 or older" />
            <span>I confirm I am 18 or older and agree to the <a className="underline" href="/terms.html">Terms</a> and <a className="underline" href="/privacy.html">Privacy Policy</a>.</span>
          </label>
          <button className={btn} disabled={!age || busy} onClick={() => run(() => post("/api/age/confirm", { confirm18: true }))}>Continue</button>
          {err && <p className="mt-2 text-sm text-red-400" role="alert">{err}</p>}
        </div>
      ) : (
        <div className={card} data-testid="login-gate">
          {me.email ? (
            <p className="text-sm text-slate-300">Signed in as {me.email}, but this email doesn't have access yet. If you were given a guest code, enter it below.</p>
          ) : (
            <p className="text-sm text-slate-300">Sign in to use Study Buddy. Guests: enter the email your code was sent to and your code.</p>
          )}
          {(!me.email || showRedeem || true) && (
            <div className="mt-3">
              {!me.email && (
                <label className="block text-sm">Email<input className={input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" /></label>
              )}
              <label className="block text-sm mt-2">Guest code<input className={input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" aria-label="Guest code" autoCapitalize="characters" /></label>
              <button className={btn} disabled={busy || !code} onClick={() => run(() => post("/api/guest/redeem", { email: me.email || email, code }))}>Redeem code</button>
            </div>
          )}
          {me.devLogin && !me.email && (
            <details className="mt-4 text-sm" onToggle={() => setShowRedeem(true)}>
              <summary className="cursor-pointer text-slate-400">Local sign-in (this computer only)</summary>
              <label className="block mt-2">Email<input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Local sign-in email" /></label>
              <label className="block mt-2">Admin token (admin only)<input className={input} type="password" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} aria-label="Admin token" /></label>
              <button className={btn} disabled={busy || !email} onClick={() => run(() => post("/api/auth/dev-login", { email, adminToken }))}>Sign in</button>
            </details>
          )}
          {err && <p className="mt-2 text-sm text-red-400" role="alert">{err}</p>}
        </div>
      )}
      <LegalLinks />
    </div>
  );
}
