import { useEffect, useRef, useState } from "react";
import { SignOutButton, SwitchCartButton } from "./Cartridges";
import { shrinkImageDataUrl } from "../lib/shrinkImage";
import { runAiJob } from "../lib/aiJob";

type Status = { installed: boolean; reachable: boolean; reason?: string; plan?: { sizeGB: number } };

/** Kawaii Me: adult photo -> chibi 3D figure on the local GPU. Nothing is stored; results live only in this tab. */
export function KawaiiMode({ onSwitch }: { onSwitch: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/kawaii/status").then((r) => r.json()).then(setStatus).catch(() => setStatus({ installed: false, reachable: false, reason: "Couldn't reach the server." })); }, []);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|heic|heif)$/i.test(f.type) || f.size > 25 * 1024 * 1024) { setErr("Use a photo (JPEG, PNG or WebP) under 25 MB."); return; }
    const rd = new FileReader();
    rd.onload = async () => { setErr(null); setResult(null); setPhoto(await shrinkImageDataUrl(String(rd.result), 1280, 0.9)); };
    rd.readAsDataURL(f);
  };
  const go = async () => {
    if (!photo || !consent || !adult) return;
    setBusy(true); setErr(null); setResult(null);
    const r = await runAiJob("kawaii", { imageBase64: photo, consent: true, adultConfirm: true }, { timeoutMs: 11 * 60_000 }).catch(() => ({ ok: false, status: 0, data: { error: "Connection lost. Try again." } }));
    setBusy(false);
    if (r.ok && typeof r.data?.image === "string" && r.data.image.startsWith("data:image/")) setResult(r.data.image);
    else setErr(r.status === 504 ? "Kawaii Me took too long (the GPU may still be warming up). Nothing was saved. Please try again in a minute." : String(r.data?.error || "Kawaii Me couldn't make your picture. Please try again."));
  };
  const ready = status?.installed && status.reachable;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2a1830] to-[#16171A] text-white px-4 pt-14 pb-10 flex flex-col items-center gap-4" data-testid="kawaii-mode">
      <SwitchCartButton onClick={onSwitch} />
      <SignOutButton className="fixed top-1.5 right-2 z-[60] scale-90 origin-top-right" />
      <img src="/carts/kawaii.webp" alt="Kawaii Me cartridge" className="w-48 rounded-lg" />
      <h1 className="text-2xl font-black tracking-wide text-pink-300">KAWAII ME</h1>
      {status && !ready && (
        <div className="max-w-sm w-full rounded-xl bg-amber-500/15 border border-amber-400/40 p-3 text-sm text-amber-100" data-testid="kawaii-not-installed">
          <b>Coming soon on this PC.</b> {status.reason}{status.plan ? ` It needs a one-time ~${status.plan.sizeGB} GB local model install.` : ""} You can still look around; nothing will be uploaded.
        </div>
      )}
      <div className="max-w-sm w-full grid grid-cols-2 gap-3">
        <div className="aspect-square rounded-xl bg-black/40 border border-white/15 flex items-center justify-center overflow-hidden">
          {photo ? <img src={photo} alt="Your photo" className="w-full h-full object-cover" /> : <span className="text-xs text-slate-400 p-2 text-center">Your photo</span>}
        </div>
        <div className="aspect-square rounded-xl bg-black/40 border border-pink-300/30 flex items-center justify-center overflow-hidden">
          {busy ? <span className="text-xs text-pink-200 animate-pulse p-2 text-center">Making you kawaii… (usually under a minute; the first one after a restart can take a few)</span>
            : result ? <img src={result} alt="Kawaii you" className="w-full h-full object-cover" data-testid="kawaii-result" />
            : <span className="text-xs text-slate-400 p-2 text-center">Chibi you</span>}
        </div>
      </div>
      <button onClick={() => fileRef.current?.click()} className="px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 font-bold text-sm" data-testid="kawaii-pick">{photo ? "Choose another photo" : "Choose a photo"}</button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} aria-label="Choose a photo" />
      <label className="max-w-sm w-full flex gap-2 items-start text-xs text-slate-200">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" data-testid="kawaii-consent" />
        <span>This is me, or I have this person's permission to use their photo.</span>
      </label>
      <label className="max-w-sm w-full flex gap-2 items-start text-xs text-slate-200">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5" data-testid="kawaii-adult" />
        <span>Everyone in the photo is 18 or older. (Photos of minors are refused.)</span>
      </label>
      <button onClick={go} disabled={!photo || !consent || !adult || busy || !ready} className="w-full max-w-sm py-3 rounded-2xl bg-pink-500 font-black disabled:opacity-40" data-testid="kawaii-go">✨ Make me kawaii</button>
      {err && <div className="max-w-sm w-full rounded-xl bg-amber-500/15 border border-amber-400/40 p-3 text-sm text-amber-100 text-center" role="alert" data-testid="kawaii-error">{err}<button onClick={() => { setErr(null); setResult(null); }} className="block mx-auto mt-2 px-4 py-1.5 rounded-lg bg-white/10 border border-white/20 font-bold text-xs" data-testid="kawaii-reset">Try again</button></div>}
      {result && <a href={result} download="kawaii-me.png" className="text-sm underline text-pink-200">Save image</a>}
      <p className="max-w-sm text-[11px] text-slate-400 text-center">Runs on the local GPU, never in the cloud. Your photo is used once and not saved anywhere.</p>
    </div>
  );
}
