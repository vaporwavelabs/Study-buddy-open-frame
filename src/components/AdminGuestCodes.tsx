import React, { useCallback, useEffect, useState } from "react";

type Code = { id: string; email: string; createdAt: string; expiresAt: string | null; status: string };

/** Admin-only guest code manager. Server enforces admin on every call. */
export function AdminGuestCodes({ onClose }: { onClose: () => void }) {
  const [codes, setCodes] = useState<Code[]>([]);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("");
  const [created, setCreated] = useState<{ code: string; email: string } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    fetch("/api/admin/guest-codes").then((r) => r.json()).then((j) => setCodes(j.codes || [])).catch(() => setErr("Couldn't load codes"));
  }, []);
  useEffect(load, [load]);
  const create = async () => {
    setErr(""); setCreated(null);
    const r = await fetch("/api/admin/guest-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ...(Number(days) > 0 ? { expiresInDays: Number(days) } : {}) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error || "Failed");
    setCreated({ code: j.code, email: j.guestCode.email }); setEmail(""); load();
  };
  const revoke = async (id: string) => {
    await fetch(`/api/admin/guest-codes/${id}/revoke`, { method: "POST" }); load();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" role="dialog" aria-label="Guest codes">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#1B1D21] border border-white/10 p-4 text-slate-100">
        <div className="flex justify-between items-center"><h2 className="text-lg font-bold">Guest codes</h2><button className="px-3 py-1 rounded bg-white/10" onClick={onClose}>Close</button></div>
        <div className="mt-3 grid gap-2">
          <input className="bg-black/40 border border-white/15 rounded-lg px-3 py-2" type="email" placeholder="Guest email" aria-label="Guest email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="bg-black/40 border border-white/15 rounded-lg px-3 py-2" type="number" min="1" placeholder="Expires in days (optional)" aria-label="Expiry days" value={days} onChange={(e) => setDays(e.target.value)} />
          <button className="py-2.5 rounded-xl bg-[#EF5B14] font-semibold" onClick={create}>Create code</button>
        </div>
        {created && (
          <p className="mt-3 p-3 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-sm" data-testid="new-code">
            Code for {created.email}: <b className="font-mono text-lg">{created.code}</b><br />It is shown only once. Send it to the guest yourself.
          </p>
        )}
        {err && <p className="mt-2 text-sm text-red-400" role="alert">{err}</p>}
        <ul className="mt-4 space-y-2 text-sm">
          {codes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/30">
              <span className="truncate">{c.email} <span className="text-xs text-slate-400">· {c.status}{c.expiresAt ? ` · exp ${c.expiresAt.slice(0, 10)}` : ""}</span></span>
              {c.status !== "revoked" && <button className="px-2 py-1 rounded bg-red-500/20 text-red-300 text-xs" onClick={() => revoke(c.id)}>Revoke</button>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
