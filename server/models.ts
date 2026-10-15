/**
 * Local model picker for the PC's Ollama: lists installed models, tags vision support, hides embedding /
 * image-only / unsupported (mllama) models, flags models too big for the GPU, and keeps the admin's settings
 * (default chat model, vision model, user allow list) in DATA_DIR/models.json. Applies without a restart.
 */
import fs from "fs";
import path from "path";

export type ModelInfo = { name: string; sizeGB: number; vision: boolean; tooBig: boolean; family?: string; params?: string };
export type ModelSettings = { defaultModel: string; visionModel: string; allowed: string[] };

const MODEL_NAME = /^[\w.:\/-]{1,100}$/;
export const validModelName = (n: unknown): n is string => typeof n === "string" && MODEL_NAME.test(n);
const vramGB = () => Number(process.env.GPU_VRAM_GB) || 24;

let cache: { at: number; models: ModelInfo[] } | null = null;

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export async function listInstalledModels(ollama: Fetcher, force = false): Promise<ModelInfo[]> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.models;
  const tags = (await (await ollama("/api/tags")).json()) as { models?: Array<{ name: string; size?: number; details?: { family?: string; families?: string[]; parameter_size?: string } }> };
  const out: ModelInfo[] = [];
  for (const m of tags.models || []) {
    const fams = [m.details?.family, ...(m.details?.families || [])].filter(Boolean).map((f) => String(f).toLowerCase());
    if (/embed|bge|minilm|nomic-embed/i.test(m.name) || fams.some((f) => /bert|embed/.test(f))) continue;
    if (fams.includes("mllama") || /llama3\.2-vision/i.test(m.name)) continue; // can't load on this Ollama build
    let caps: string[] = [];
    try {
      const show = (await (await ollama("/api/show", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: m.name }) })).json()) as { capabilities?: string[] };
      caps = Array.isArray(show.capabilities) ? show.capabilities : [];
    } catch { /* older Ollama: no capabilities */ }
    if (caps.length && !caps.includes("completion")) continue; // embedding / image-generation only
    const sizeGB = +((m.size || 0) / 1e9).toFixed(1);
    out.push({
      name: m.name,
      sizeGB,
      vision: caps.includes("vision") || fams.includes("clip"),
      // Weights + KV cache + CUDA overhead: anything over ~85% of VRAM in weights spills to system RAM.
      tooBig: sizeGB > vramGB() * 0.85,
      family: m.details?.family,
      params: m.details?.parameter_size,
    });
  }
  out.sort((a, b) => a.sizeGB - b.sizeGB);
  cache = { at: Date.now(), models: out };
  return out;
}
export const clearModelCache = () => { cache = null; };

export class ModelSettingsStore {
  private s: ModelSettings;
  constructor(private file: string, defaults: ModelSettings) {
    let saved: Partial<ModelSettings> = {};
    try { saved = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first run */ }
    this.s = {
      defaultModel: validModelName(saved.defaultModel) ? saved.defaultModel : defaults.defaultModel,
      visionModel: validModelName(saved.visionModel) || saved.visionModel === "" ? (saved.visionModel as string) : defaults.visionModel,
      allowed: Array.isArray(saved.allowed) ? saved.allowed.filter(validModelName) : defaults.allowed,
    };
  }
  static fromEnv(defaults: ModelSettings) {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    return new ModelSettingsStore(path.join(dir, "models.json"), defaults);
  }
  get(): ModelSettings { return { ...this.s, allowed: [...this.s.allowed] }; }
  set(next: ModelSettings) {
    this.s = { ...next, allowed: Array.from(new Set([next.defaultModel, ...next.allowed])) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.s, null, 2));
  }
  /** Per-request model: the user's choice only if it's on the allow list, else the default. */
  resolve(requested: unknown): string {
    return validModelName(requested) && this.s.allowed.includes(requested) ? requested : this.s.defaultModel;
  }
}
