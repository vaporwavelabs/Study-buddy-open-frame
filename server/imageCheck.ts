/**
 * Cheap pre-check for photos before they reach the vision model: blank/flat, too small, or too dark/bright
 * images are rejected so the model can't invent a problem. PNG and JPEG are decoded; other formats pass through.
 */
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

export type ImageCheck = { checked: boolean; readable: boolean; reason?: string; width?: number; height?: number; stdDev?: number };

export function checkImageReadable(dataUrl: unknown): ImageCheck {
  if (typeof dataUrl !== "string") return { checked: false, readable: true };
  const m = /^data:image\/(png|jpe?g)[^;]*;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!m) return { checked: false, readable: true };
  const buf = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  let w = 0, h = 0, px: Uint8Array;
  try {
    if (/png/i.test(m[1])) {
      const p = PNG.sync.read(buf);
      w = p.width; h = p.height; px = p.data;
    } else {
      const j = jpeg.decode(buf, { useTArray: true, maxResolutionInMP: 60, maxMemoryUsageInMB: 512 });
      w = j.width; h = j.height; px = j.data;
    }
  } catch {
    return { checked: true, readable: false, reason: "The photo file looks damaged and couldn't be opened." };
  }
  if (w < 24 || h < 24) return { checked: true, readable: false, reason: "The photo is too small to read.", width: w, height: h };
  // Sample up to ~40k pixels for luminance mean / std-dev.
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));
  let n = 0, sum = 0, sum2 = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const a = px[i + 3] / 255;
      const l = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * a + 255 * (1 - a);
      sum += l; sum2 += l * l; n++;
    }
  }
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const minSd = Number(process.env.PHOTO_MIN_STDDEV) || 6;
  if (sd < minSd) {
    return { checked: true, readable: false, width: w, height: h, stdDev: +sd.toFixed(2),
      reason: mean < 40 ? "The photo is too dark to read." : mean > 245 ? "The photo looks blank." : "The photo looks blank or out of focus." };
  }
  return { checked: true, readable: true, width: w, height: h, stdDev: +sd.toFixed(2) };
}

export const UNREADABLE_MARK = "UNREADABLE";
export const unreadableReply = (reason?: string) =>
  `${reason ? reason + " " : ""}I can't read that photo. Try again with good light, hold the camera steady, and fill the frame with the problem. You can also type it.`;
