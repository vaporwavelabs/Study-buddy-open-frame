import { useCallback, useEffect, useRef, useState } from "react";
import { X, Send, Camera, RefreshCw } from "lucide-react";

const MAX_PHOTOS = 4;

/** Live in-page camera: take several photos, review thumbnails, remove any, send all together. */
export function CameraCapture({ onSend, onClose }: { onSend: (images: string[], text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState(false);

  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      stop();
      if (!navigator.mediaDevices?.getUserMedia) { setError("This browser can't open the camera. Use the 📎 button to pick a photo instead."); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
        setError(null);
      } catch (e) {
        const n = (e as Error)?.name;
        setError(n === "NotAllowedError" ? "Camera permission was blocked. Allow the camera for this site in your browser settings, or use 📎 to pick a photo." : "No camera found. Use 📎 to pick a photo instead.");
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [facing]);

  const take = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || shots.length >= MAX_PHOTOS) return;
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    setShots((s) => [...s, c.toDataURL("image/jpeg", 0.85)]);
    setFlash(true); setTimeout(() => setFlash(false), 120);
  }, [shots.length]);

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col" data-testid="camera-capture" role="dialog" aria-label="Camera">
      <div className="flex items-center justify-between px-3 py-2 text-white">
        <button onClick={() => { stop(); onClose(); }} className="p-2 rounded-full bg-white/10" aria-label="Close camera"><X className="w-5 h-5" /></button>
        <span className="text-sm font-bold">{shots.length}/{MAX_PHOTOS} photos</span>
        <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} className="p-2 rounded-full bg-white/10" aria-label="Flip camera"><RefreshCw className="w-5 h-5" /></button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        {error ? <p className="text-white/90 text-center px-6 text-sm" data-testid="camera-error">{error}</p>
          : <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" data-testid="camera-video" />}
        {flash && <div className="absolute inset-0 bg-white/70" />}
      </div>
      {shots.length > 0 && (
        <div className="flex gap-2 px-3 py-2 overflow-x-auto" data-testid="camera-thumbs">
          {shots.map((s, i) => (
            <div key={i} className="relative shrink-0">
              <img src={s} alt={`Photo ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border-2 border-white/70" />
              <button onClick={() => setShots((arr) => arr.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center" aria-label={`Remove photo ${i + 1}`} data-testid="camera-remove"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1 flex flex-col gap-2">
        {shots.length > 0 && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a question (optional)" className="w-full rounded-xl px-3 py-2 text-sm bg-white/10 text-white placeholder:text-white/50 outline-none" data-testid="camera-note" />}
        <div className="flex items-center gap-3">
          <button onClick={take} disabled={!!error || shots.length >= MAX_PHOTOS} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-black font-black disabled:opacity-40" data-testid="camera-take"><Camera className="w-5 h-5" /> Take photo</button>
          <button onClick={() => { if (!shots.length) return; stop(); onSend(shots, note.trim()); }} disabled={!shots.length} className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-pink-500 text-white font-black disabled:opacity-40" data-testid="camera-send"><Send className="w-5 h-5" /> Send{shots.length > 1 ? ` ${shots.length}` : ""}</button>
        </div>
      </div>
    </div>
  );
}
