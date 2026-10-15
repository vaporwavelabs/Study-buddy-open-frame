import React, { useEffect, useMemo, useState } from "react";
import TOOLS from "../data/toolsontab.json";

export type CartId = "studybuddy-math" | "studybuddy-science" | "kawaii" | "draftboard" | "godseye" | "tools" | "imagegen" | "customization" | "ecommerce";
type Cart = { id: CartId; title: string; img: string; ready: boolean; intro: string };

export const CARTS: Cart[] = [
  { id: "studybuddy-math", title: "Study Buddy Math", img: "/carts/studybuddy-math.webp", ready: true,
    intro: "Hey, I'm Study Buddy Math! I work through problems with you step by step, from times tables to algebra and geometry. Snap one or more pages, or type a problem, and after each answer I'll give you a few practice questions just like it." },
  { id: "studybuddy-science", title: "Study Buddy Science", img: "/carts/studybuddy-science.webp", ready: true,
    intro: "Hi, I'm Study Buddy Science! Biology, chemistry, physics, earth science: ask me why things work and I'll explain it simply with real-world examples. Snap a diagram or worksheet, or just ask." },
  { id: "kawaii", title: "Kawaii Me", img: "/carts/kawaii.webp", ready: true,
    intro: "Kawaii Me turns a photo of an adult into a cute chibi 3D figure, made on your own GPU with no cloud. Photos are never stored: they're used once and thrown away." },
  { id: "draftboard", title: "Draftboard", img: "/carts/draftboard.webp", ready: true,
    intro: "Draftboard is my design studio. Sketch, lay out and edit vector art and graphics right here in your browser. Your work stays on your device until you export it." },
  { id: "godseye", title: "God's Eye", img: "/carts/godseye.webp", ready: true,
    intro: "God's Eye is the watchtower. It's where you monitor the whole system and see how each local model is performing: speed, load and health at a glance." },
  { id: "tools", title: "Tools", img: "/carts/tools.webp", ready: true,
    intro: "Tools is my utility belt: over a hundred quick tools for images, PDFs, calculators, developer jobs and more. Tap one and it opens ready to go." },
  { id: "imagegen", title: "Image Generator", img: "/carts/imagegen.webp", ready: false,
    intro: "Image Generator is still in the workshop. Soon you'll describe a picture and I'll paint it with a local model on your own GPU. Stay tuned!" },
  { id: "customization", title: "Customization", img: "/carts/customization.webp", ready: false,
    intro: "Customization is coming soon. You'll be able to change my look, my voice and how I teach, so I feel like your buddy. Check back soon!" },
  { id: "ecommerce", title: "E-commerce", img: "/carts/ecommerce.webp", ready: false,
    intro: "E-commerce is on its way. I'm learning to help you set up a shop, write product listings and track orders. Not quite ready yet, though!" },
];

export function CartridgeGrid({ onPick }: { onPick: (c: Cart) => void }) {
  const [inserting, setInserting] = useState<CartId | null>(null);
  const pick = (c: Cart) => {
    if (inserting) return;
    setInserting(c.id);
    window.setTimeout(() => { setInserting(null); onPick(c); }, 650);
  };
  return (
    <div className="min-h-screen bg-[#111214] text-white px-3 pt-6 pb-10" data-testid="cart-grid">
      <div className="flex justify-end mb-2"><SignOutButton /></div>
      <h1 className="text-center text-xl sm:text-2xl font-black tracking-widest">INSERT A CARTRIDGE</h1>
      <p className="text-center text-xs text-slate-400 mt-1 mb-5">Tap a cartridge to load it</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 max-w-5xl mx-auto">
        {CARTS.map((c) => (
          <button key={c.id} onClick={() => pick(c)} data-testid={`cart-${c.id}`} aria-label={`${c.title}${c.ready ? "" : " (coming soon)"}`}
            className={`relative rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-400 transition-transform duration-150 active:scale-95 ${inserting === c.id ? "cart-insert" : inserting ? "opacity-40" : "hover:-translate-y-1"}`}>
            <img src={c.img} alt="" width={473} height={314} className="w-full h-auto aspect-[473/314] object-cover block rounded-lg bg-white/5 shadow-[0_6px_0_rgba(0,0,0,.5)]" draggable={false} />
            {!c.ready && <span className="absolute top-1.5 right-1.5 text-[10px] font-bold bg-black/80 text-amber-300 px-1.5 py-0.5 rounded">SOON</span>}
          </button>
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-slate-500"><a className="underline" href="/privacy.html">Privacy</a> · <a className="underline" href="/terms.html">Terms</a></p>
      <style>{`@keyframes cartInsert{0%{transform:translateY(0) scale(1)}35%{transform:translateY(-14px) scale(1.04)}100%{transform:translateY(70vh) scale(.85);opacity:0}}.cart-insert{animation:cartInsert .65s ease-in forwards;z-index:10}`}</style>
    </div>
  );
}

export function CartIntro({ cart, onBegin, onBack }: { cart: Cart; onBegin: () => void; onBack: () => void }) {
  const [n, setN] = useState(0);
  const done = n >= cart.intro.length;
  useEffect(() => {
    if (done) return;
    const id = window.setTimeout(() => setN((x) => Math.min(cart.intro.length, x + 2)), 18);
    return () => window.clearTimeout(id);
  }, [n, done, cart.intro.length]);
  return (
    <div className="min-h-screen bg-[#111214] text-white flex flex-col items-center justify-center p-4" data-testid="cart-intro" onClick={() => setN(cart.intro.length)}>
      <SignOutButton className="fixed top-3 right-3 z-[60]" />
      <img src={cart.img} alt={cart.title} className="w-56 sm:w-72 rounded-lg mb-5 shadow-xl" />
      <div className="w-full max-w-md bg-[#1f2126] border-2 border-sky-400/60 rounded-xl p-4 shadow-lg">
        <p className="text-[11px] font-bold tracking-widest text-sky-300 mb-2">STUDY BUDDY</p>
        <p className="text-base leading-relaxed min-h-[7.5rem] font-mono" data-testid="intro-text" aria-live="polite">
          {cart.intro.slice(0, n)}{!done && <span className="animate-pulse">▌</span>}
        </p>
        <div className="mt-4 flex gap-2">
          <button className="flex-1 py-3 rounded-lg bg-slate-700 font-semibold" onClick={(e) => { e.stopPropagation(); onBack(); }} data-testid="intro-back">Back</button>
          {cart.ready ? (
            <button className="flex-[2] py-3 rounded-lg bg-sky-500 text-black font-bold disabled:opacity-60" onClick={(e) => { e.stopPropagation(); onBegin(); }} data-testid="intro-begin">Begin</button>
          ) : (
            <button className="flex-[2] py-3 rounded-lg bg-amber-400/20 text-amber-200 font-bold cursor-not-allowed" disabled data-testid="intro-soon">Coming soon</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Real form POST: server revokes the session, clears cookies/cache, then redirects to Cloudflare Access logout. */
export function SignOutButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <form method="POST" action="/api/auth/logout" className={className} onSubmit={() => { try { sessionStorage.clear(); localStorage.removeItem("sb_last_cart"); } catch { /* ignore */ } }}>
      <button type="submit" data-testid="sign-out" aria-label="Sign out securely" title="Sign out securely" className="px-3 py-2 rounded-full bg-black/85 border border-red-400/50 text-red-200 text-xs font-bold whitespace-nowrap">🔒{compact ? <span className="hidden sm:inline"> Sign out securely</span> : " Sign out securely"}</button>
    </form>
  );
}

export function SwitchCartButton({ onClick, floating = true }: { onClick: () => void; floating?: boolean }) {
  return (
    <button onClick={onClick} data-testid="switch-cart" title="Switch cartridge"
      className={`${floating ? "fixed bottom-3 left-3 z-[60] shadow-lg" : ""} flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/85 border border-white/20 text-white text-xs font-bold`}>
      <span aria-hidden>🎮</span> Switch cartridge
    </button>
  );
}

const CAT_LABEL: Record<string, string> = { image: "Images", pdf: "PDF", calc: "Calculators", developer: "Developer", general: "General", business: "Business", security: "Security", career: "Career" };
const CAT_ICON: Record<string, string> = { image: "🖼️", pdf: "📄", calc: "🧮", developer: "💻", general: "🧰", business: "💼", security: "🔒", career: "🎓" };

export function ToolsMode({ onSwitch }: { onSwitch: () => void }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const m = new Map<string, typeof TOOLS>();
    for (const t of TOOLS) {
      if (ql && !t.title.toLowerCase().includes(ql) && !t.slug.includes(ql)) continue;
      if (!m.has(t.category)) m.set(t.category, []);
      m.get(t.category)!.push(t);
    }
    return [...m.entries()];
  }, [q]);
  return (
    <div className="min-h-screen bg-[#16171A] text-white p-3 pb-20" data-testid="tools-mode">
      <div className="flex items-center gap-2 mb-3">
        <h1 className="text-lg font-black tracking-wider flex-1">TOOLS <span className="text-xs text-slate-400 font-normal">({TOOLS.length} on toolsontab.com)</span></h1>
        <SignOutButton />
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools" aria-label="Search tools"
        className="w-full mb-4 px-3 py-2.5 rounded-lg bg-[#24262b] border border-white/10 text-base" />
      {groups.map(([cat, list]) => (
        <section key={cat} className="mb-5">
          <h2 className="text-xs font-bold tracking-widest text-slate-400 mb-2">{CAT_ICON[cat] || "🧰"} {CAT_LABEL[cat] || cat}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
            {list.map((t) => (
              <a key={t.slug} href={t.url} target="_blank" rel="noopener noreferrer" data-testid="tool-link"
                className="flex flex-col items-center justify-start text-center gap-1 p-2 rounded-xl bg-[#24262b] active:scale-95 hover:bg-[#2d3036] min-h-[86px]">
                <span className="w-10 h-10 rounded-xl bg-red-600/90 flex items-center justify-center text-xl" aria-hidden>{CAT_ICON[cat] || "🧰"}</span>
                <span className="text-[11px] leading-tight">{t.title}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
      <SwitchCartButton onClick={onSwitch} />
    </div>
  );
}

export function DraftboardMode({ onSwitch }: { onSwitch: () => void }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState<"download" | "start" | "ready" | "error">("download");
  const [showFrame, setShowFrame] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await fetch("/api/cartridges/status").then((r) => r.json());
        if (cancelled) return;
        setOk(!!st.draftboard);
        if (!st.draftboard) return;
        // Pre-download the big WASM with visible progress; the iframe then gets it from the browser cache.
        if (st.wasm?.path) {
          const r = await fetch(st.wasm.path, { credentials: "same-origin" });
          if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
          const total = Number(st.wasm.bytes) || 0;
          const reader = r.body.getReader();
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            got += value.byteLength;
            if (total && !cancelled) setPct(Math.min(99, Math.round((got / total) * 100)));
          }
        }
        if (cancelled) return;
        setPct(100); setPhase("start"); setShowFrame(true);
      } catch {
        if (!cancelled) { setPhase("start"); setShowFrame(true); } // let the iframe try on its own
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="fixed inset-0 bg-[#16171A] flex flex-col" data-testid="draftboard-mode">
      <div data-testid="draftboard-topbar" className="shrink-0 flex items-center justify-between gap-2 bg-black border-b border-white/10 z-[60]"
        style={{ paddingTop: "max(6px, env(safe-area-inset-top))", paddingLeft: "max(8px, env(safe-area-inset-left))", paddingRight: "max(8px, env(safe-area-inset-right))", paddingBottom: 6 }}>
        <SwitchCartButton onClick={onSwitch} floating={false} />
        <div className="flex items-center gap-2 min-w-0">
          <a href="/draftboard/" target="_blank" rel="noopener" aria-label="Open full screen" className="px-3 py-2 rounded-full bg-black/85 border border-white/20 text-white text-xs font-bold whitespace-nowrap">⤢<span className="hidden sm:inline"> Full screen</span></a>
          <SignOutButton compact />
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
      {ok === false ? <p className="text-slate-300 p-6 text-center">Draftboard isn't installed on this server yet.</p>
        : showFrame && <iframe title="Draftboard" src="/draftboard/" className="w-full h-full border-0" allow="clipboard-read; clipboard-write; fullscreen"
            onLoad={() => window.setTimeout(() => setPhase("ready"), 1500)} />}
      {ok !== false && phase !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#16171A] text-white px-8" data-testid="draftboard-loading" role="status" aria-live="polite">
          <img src="/carts/draftboard.webp" alt="" className="w-48 rounded-lg" />
          <div className="w-full max-w-xs h-3 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-sky-400 to-fuchsia-400 transition-[width] duration-200" style={{ width: `${phase === "download" ? pct : 100}%` }} data-testid="draftboard-progress" />
          </div>
          <p className="text-sm text-slate-300" data-testid="draftboard-loading-text">
            {phase === "download" ? `Loading the design studio… ${pct}%` : "Starting Draftboard…"}
          </p>
          <p className="text-[11px] text-slate-500 text-center max-w-xs">First load downloads about 9 MB; after that it opens from your browser's cache.</p>
        </div>
      )}
      </div>
    </div>
  );
}

export function GodsEyeMode({ url, onSwitch }: { url: string; onSwitch: () => void }) {
  return (
    <div className="min-h-screen bg-[#111214] text-white flex flex-col items-center justify-center p-6 text-center gap-4" data-testid="godseye-mode">
      <img src="/carts/godseye.webp" alt="God's Eye" className="w-60 rounded-lg" />
      <p className="text-sm text-slate-300 max-w-sm">God's Eye runs on its own secure site. It opens in a new tab and asks for the same email sign-in.</p>
      <a href={url} target="_blank" rel="noopener noreferrer" data-testid="gev-open" className="px-6 py-3 rounded-lg bg-orange-500 text-black font-bold">Open God's Eye ↗</a>
      <SwitchCartButton onClick={onSwitch} floating={false} />
      <SignOutButton />
    </div>
  );
}
