/** Phone photos are often 3-12 MB. Downscale to <= maxEdge px JPEG before upload so they stay well under the
 *  server cap and send fast on mobile data. Non-images (PDF, text) and undecodable images (e.g. HEIC on Chrome)
 *  are returned unchanged. */
export async function shrinkImageDataUrl(dataUrl: string, maxEdge = 1600, quality = 0.85): Promise<string> {
  if (!/^data:image\/(png|jpe?g|webp|heic|heif)/i.test(dataUrl)) return dataUrl;
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = dataUrl;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return dataUrl;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    if (scale === 1 && dataUrl.length < 1_500_000) return dataUrl;
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", quality);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}
