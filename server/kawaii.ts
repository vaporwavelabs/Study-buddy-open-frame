/**
 * Kawaii Me: photo of an adult -> chibi/kawaii 3D figure, rendered on the local GPU by ComfyUI.
 * No cloud. Photos are never written by this server; the copy ComfyUI needs is deleted right after the run
 * (KAWAII_COMFY_INPUT_DIR) and the result uses PreviewImage (ComfyUI temp dir), not SaveImage.
 *
 * Env (all optional; without KAWAII_COMFY_URL the feature reports "not installed"):
 *   KAWAII_COMFY_URL        e.g. http://127.0.0.1:8188  (ComfyUI bound to localhost)
 *   KAWAII_COMFY_INPUT_DIR  ComfyUI's input folder, so the uploaded photo can be deleted after the run
 *   KAWAII_COMFY_TEMP_DIR   ComfyUI's temp folder, so the preview copy of the result is deleted too
 *   KAWAII_CHECKPOINT       SDXL checkpoint file name   (default sd_xl_base_1.0.safetensors)
 *   KAWAII_LORA             chibi LoRA file name        (default chibi_sdxl.safetensors)
 *   KAWAII_IPADAPTER        IP-Adapter model            (default ip-adapter-plus-face_sdxl_vit-h.safetensors)
 *   KAWAII_CLIP_VISION      CLIP vision model           (default CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors)
 *   KAWAII_STEPS / KAWAII_IP_WEIGHT
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const KAWAII_INSTALL_PLAN = {
  sizeGB: 10.6,
  items: [
    { file: "SDXL checkpoint (sd_xl_base_1.0.safetensors or a 3D/anime SDXL fine-tune)", sizeGB: 6.9, dir: "models/checkpoints" },
    { file: "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors", sizeGB: 2.5, dir: "models/clip_vision" },
    { file: "ip-adapter-plus-face_sdxl_vit-h.safetensors", sizeGB: 0.85, dir: "models/ipadapter" },
    { file: "chibi / kawaii 3D SDXL LoRA", sizeGB: 0.2, dir: "models/loras" },
  ],
  needs: "ComfyUI + ComfyUI_IPAdapter_plus (already present in G:\\FORGED\\UNFINISHED\\ComfyGen\\ComfyUI_Server), started on 127.0.0.1:8188",
  vram: "SDXL + IP-Adapter at 1024px ~ 9-11 GB. gemma3:12b uses ~11 GB, so the LLM is unloaded before each render and re-warmed afterwards (24 GB 3090).",
};

/** Minor/age terms: any user text or model caption containing one blocks the render (server-side, fail closed). */
export const MINOR_TERMS = /\b(child|children|childlike|kid|kids|kiddo|teen|teens|teenager|teenage|tween|young|younger|youth|minor|minors|underage|under[- ]?18|loli|lolita|shota|school ?(girl|boy|uniform)?|schoolgirl|schoolboy|student|pupil|preteen|pre-teen|adolescent|juvenile|toddler|baby|babies|infant|little (girl|boy)|girl|boy|daughter|son|grade ?\d|\d{1,2}[- ]?(yo|y\/o|years?[- ]old))\b/i;
export const hasMinorTerms = (t: unknown) => typeof t === "string" && MINOR_TERMS.test(t);

const comfyUrl = () => (process.env.KAWAII_COMFY_URL || "").replace(/\/+$/, "");
export const kawaiiConfigured = () => Boolean(comfyUrl());

export async function kawaiiStatus(): Promise<{ installed: boolean; reachable: boolean; reason?: string }> {
  if (!kawaiiConfigured()) return { installed: false, reachable: false, reason: "Kawaii Me isn't installed on this PC yet." };
  try {
    const r = await fetch(`${comfyUrl()}/system_stats`, { signal: AbortSignal.timeout(3000) });
    return { installed: true, reachable: r.ok, ...(r.ok ? {} : { reason: `Image engine answered HTTP ${r.status}` }) };
  } catch {
    return { installed: true, reachable: false, reason: "The local image engine (ComfyUI) isn't running." };
  }
}

export function buildWorkflow(inputName: string, seed: number, description = "") {
  const env = (k: string, d: string) => process.env[k] || d;
  const steps = Number(process.env.KAWAII_STEPS) || 28;
  const ipWeight = Number(process.env.KAWAII_IP_WEIGHT) || 0.45;
  // Look details (hair, glasses, beard, clothes) come from the screening caption; age words are already filtered out.
  const who = description.replace(/[^\w ,.'-]/g, " ").slice(0, 200);
  const pos = `chibi, full body 3d render of a cute chibi figurine of an adult${who ? `, ${who}` : ""}, big head, small body, big glossy eyes, rosy cheeks, smiling, pixar style, soft studio lighting, clean white background, high quality`;
  // Hard negative against childlike output and anything explicit, every render.
  const neg = "child, children, kid, minor, teen, teenager, young girl, young boy, loli, shota, baby, toddler, childlike body, school uniform, nsfw, nude, nudity, cleavage, suggestive, sexual, photo, photorealistic, realistic skin, lowres, blurry, extra limbs, deformed, text, watermark";
  return {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: env("KAWAII_CHECKPOINT", "sd_xl_base_1.0.safetensors") } },
    "2": { class_type: "LoraLoader", inputs: { model: ["1", 0], clip: ["1", 1], lora_name: env("KAWAII_LORA", "chibistylexl-v1-2.safetensors"), strength_model: 1.0, strength_clip: 1.0 } },
    "3": { class_type: "LoadImage", inputs: { image: inputName } },
    "4": { class_type: "ImageScale", inputs: { image: ["3", 0], upscale_method: "lanczos", width: 1024, height: 1024, crop: "center" } },
    "5": { class_type: "IPAdapterModelLoader", inputs: { ipadapter_file: env("KAWAII_IPADAPTER", "ip-adapter-plus-face_sdxl_vit-h.safetensors") } },
    "6": { class_type: "CLIPVisionLoader", inputs: { clip_name: env("KAWAII_CLIP_VISION", "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors") } },
    "7": { class_type: "IPAdapterAdvanced", inputs: { model: ["2", 0], ipadapter: ["5", 0], clip_vision: ["6", 0], image: ["4", 0], weight: ipWeight, weight_type: "linear", combine_embeds: "concat", start_at: 0, end_at: 0.7, embeds_scaling: "V only" } },
    "8": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 1], text: pos } },
    "9": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 1], text: neg } },
    "10": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 } },
    "11": { class_type: "KSampler", inputs: { model: ["7", 0], positive: ["8", 0], negative: ["9", 0], latent_image: ["10", 0], seed, steps, cfg: 6, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1 } },
    "12": { class_type: "VAEDecode", inputs: { samples: ["11", 0], vae: ["1", 2] } },
    "13": { class_type: "PreviewImage", inputs: { images: ["12", 0] } },
  };
}

/** GPU memory as ComfyUI/torch sees it (MB): device free, and what ComfyUI itself already holds (SDXL resident). */
export async function comfyVram(): Promise<{ freeMB: number; heldMB: number } | null> {
  try {
    const st = (await fetch(`${comfyUrl()}/system_stats`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json())) as { devices?: Array<{ vram_free?: number; torch_vram_total?: number }> };
    const d = st.devices?.[0];
    if (!d || typeof d.vram_free !== "number") return null;
    return { freeMB: Math.round(d.vram_free / 1048576), heldMB: Math.round((d.torch_vram_total || 0) / 1048576) };
  } catch { return null; }
}

/** Free VRAM for the image model: ask Ollama to unload whatever is resident. */
export async function unloadOllama(ollamaBase: string): Promise<string[]> {
  try {
    const ps = await fetch(`${ollamaBase}/api/ps`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()) as { models?: Array<{ name: string }> };
    const names = (ps.models || []).map((m) => m.name);
    await Promise.all(names.map((model) => fetch(`${ollamaBase}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt: "", keep_alive: 0 }), signal: AbortSignal.timeout(20000) }).catch(() => null)));
    return names;
  } catch { return []; }
}

export async function renderKawaii(dataUrl: string, description = ""): Promise<{ mime: string; base64: string }> {
  const base = comfyUrl();
  const m = /^data:(image\/(png|jpe?g|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("bad image");
  const buf = Buffer.from(m[3], "base64");
  const name = `sbkawaii_${crypto.randomBytes(8).toString("hex")}.${m[2].replace("jpeg", "jpg")}`;
  const inputDir = process.env.KAWAII_COMFY_INPUT_DIR;
  const tempDir = process.env.KAWAII_COMFY_TEMP_DIR;
  let outFile: string | null = null;
  try {
    const fd = new FormData();
    fd.append("image", new Blob([buf], { type: m[1] }), name);
    fd.append("overwrite", "true");
    const up = await fetch(`${base}/upload/image`, { method: "POST", body: fd, signal: AbortSignal.timeout(20000) });
    if (!up.ok) throw new Error(`upload HTTP ${up.status}`);
    const upName = ((await up.json()) as { name?: string }).name || name;
    const q = await fetch(`${base}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: buildWorkflow(upName, crypto.randomInt(1, 2 ** 31), description) }), signal: AbortSignal.timeout(20000) });
    if (!q.ok) throw new Error(`queue HTTP ${q.status}: ${(await q.text()).slice(0, 200)}`);
    const { prompt_id } = (await q.json()) as { prompt_id: string };
    const deadline = Date.now() + (Number(process.env.KAWAII_TIMEOUT_MS) || 600000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const h = (await fetch(`${base}/history/${prompt_id}`, { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => ({}))) as Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>; status?: { status_str?: string } }>;
      const entry = h[prompt_id];
      if (!entry) continue;
      if (entry.status?.status_str === "error") throw new Error("render failed");
      const img = Object.values(entry.outputs || {}).flatMap((o) => o.images || [])[0];
      if (img) {
        outFile = img.type === "temp" && img.filename ? path.join(img.subfolder || "", img.filename) : null;
        const v = await fetch(`${base}/view?${new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type })}`, { signal: AbortSignal.timeout(30000) });
        if (!v.ok) throw new Error(`view HTTP ${v.status}`);
        return { mime: v.headers.get("content-type") || "image/png", base64: Buffer.from(await v.arrayBuffer()).toString("base64") };
      }
    }
    throw new Error("render timed out");
  } finally {
    buf.fill(0);
    if (inputDir) { try { fs.unlinkSync(path.join(inputDir, path.basename(name))); } catch { /* already gone */ } }
    // Nothing kept on disk: drop ComfyUI's preview copy of the result too.
    if (tempDir && outFile) { const f = path.resolve(tempDir, outFile); if (f.startsWith(path.resolve(tempDir))) { try { fs.unlinkSync(f); } catch { /* gone */ } } }
    // Optional: hand SDXL's VRAM back. Off by default: both fit on the 3090 (~20 GB together), and reloading
    // SDXL from disk afterwards costs minutes.
    if (process.env.KAWAII_FREE_AFTER === "true") await fetch(`${base}/free`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unload_models: true, free_memory: true }), signal: AbortSignal.timeout(10000) }).catch(() => null);
  }
}
