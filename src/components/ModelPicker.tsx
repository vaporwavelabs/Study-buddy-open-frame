import React, { useCallback, useEffect, useState } from "react";

export type UserModels = { default: string; models: Array<{ name: string; vision: boolean }>; loaded: string[] };

/** Small per-session model dropdown limited to the admin's allow list (server validates again). */
export function ModelPicker({ value, onChange, info }: { value: string; onChange: (m: string) => void; info: UserModels | null }) {
  if (!info || info.models.length < 2) return null;
  return (
    <select aria-label="AI model" data-testid="model-picker" value={value || info.default} onChange={(e) => onChange(e.target.value)}
      className="max-w-[110px] sm:max-w-[160px] bg-black/40 border border-white/15 rounded-lg px-1.5 py-1.5 text-[11px] font-mono text-white">
      {info.models.map((m) => <option key={m.name} value={m.name}>{m.name}{m.vision ? " 👁" : ""}</option>)}
    </select>
  );
}

type Installed = { name: string; sizeGB: number; vision: boolean; tooBig: boolean; params?: string };

/** Admin-only: default chat model, vision model, and which models users may pick. Applies live. */
export function AdminModels({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [list, setList] = useState<Installed[]>([]);
  const [def, setDef] = useState(""); const [vis, setVis] = useState(""); const [allowed, setAllowed] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => {
    fetch("/api/admin/models").then((r) => r.json()).then((j) => {
      setList(j.installed || []); setDef(j.settings?.defaultModel || ""); setVis(j.settings?.visionModel || ""); setAllowed(j.settings?.allowed || []);
      if (j.error) setMsg(j.error);
    }).catch(() => setMsg("Couldn't load models"));
  }, []);
  useEffect(load, [load]);
  const save = async () => {
    const r = await fetch("/api/admin/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultModel: def, visionModel: vis, allowed }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Saved. New requests use these models now." : j.error || "Failed");
    if (r.ok) onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" role="dialog" aria-label="Models">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[#1B1D21] border border-white/10 p-4 text-slate-100 text-sm">
        <div className="flex justify-between items-center"><h2 className="text-lg font-bold">Models (RTX 3090)</h2><button className="px-3 py-1 rounded bg-white/10" onClick={onClose}>Close</button></div>
        <table className="w-full mt-3 text-xs">
          <thead><tr className="text-slate-400 text-left"><th>Model</th><th>Size</th><th>Default</th><th>Vision</th><th>Users</th></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.name} className="border-t border-white/5">
                <td className="py-1.5 font-mono">{m.name}{m.tooBig && <span className="ml-1 text-amber-400" title="Bigger than ~85% of 24 GB VRAM: will spill to system RAM and be slow">⚠ too big</span>}</td>
                <td>{m.sizeGB} GB</td>
                <td><input type="radio" name="def" aria-label={`default ${m.name}`} checked={def === m.name} onChange={() => setDef(m.name)} /></td>
                <td>{m.vision ? <input type="radio" name="vis" aria-label={`vision ${m.name}`} checked={vis === m.name} onChange={() => setVis(m.name)} /> : "–"}</td>
                <td><input type="checkbox" aria-label={`allow ${m.name}`} checked={allowed.includes(m.name) || def === m.name} disabled={def === m.name}
                  onChange={(e) => setAllowed((a) => (e.target.checked ? [...a, m.name] : a.filter((x) => x !== m.name)))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="w-full mt-3 py-2.5 rounded-xl bg-[#EF5B14] font-semibold" onClick={save}>Save</button>
        {msg && <p className="mt-2 text-slate-300" role="status">{msg}</p>}
      </div>
    </div>
  );
}
