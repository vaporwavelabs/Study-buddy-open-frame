import React from "react";
import { Camera, FileUp, Keyboard } from "lucide-react";

export type StartAction = "type" | "scan" | "upload" | "photo";

/** Empty start screen: no sample problems, just the four ways to begin. Mobile-first. */
export function StartScreen({ onPick, name }: { onPick: (a: StartAction) => void; name?: string }) {
  const items: Array<{ id: StartAction; label: string; sub: string; Icon: typeof Camera }> = [
    { id: "type", label: "Type a question", sub: "Ask anything", Icon: Keyboard },
    { id: "upload", label: "Upload file", sub: "Photo, .txt or .pdf", Icon: FileUp },
    { id: "photo", label: "Take photo", sub: "Snap one or more pages", Icon: Camera },
  ];
  return (
    <div className="fixed inset-0 z-40 bg-[#16171A]/97 flex items-center justify-center p-4" role="dialog" aria-label="What do you need help with?">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold text-white text-center">What do you need help with?</h2>
        <p className="mt-1 text-sm text-slate-400 text-center">{name ? `Hi ${name}! ` : ""}Pick one to start. I'll give you a hint first so you can try it yourself.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {items.map(({ id, label, sub, Icon }) => (
            <button key={id} type="button" onClick={() => onPick(id)}
              className="min-h-[112px] rounded-2xl bg-[#1B1D21] border border-white/10 hover:border-[#EF5B14] active:scale-[0.98] p-4 flex flex-col items-center justify-center gap-2 text-white cursor-pointer transition">
              <Icon className="w-7 h-7 text-[#EF5B14]" />
              <span className="font-semibold text-base">{label}</span>
              <span className="text-xs text-slate-400">{sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
