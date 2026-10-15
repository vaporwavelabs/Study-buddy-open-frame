import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import {
  testLlmProviderConnection,
  executeUniversalChat,
  defaultOllamaModel,
  OllamaQueueFullError,
  OllamaModelMissingError,
  isOllamaUp,
  isOllamaFallbackUp,
  markOllamaFallbackDown,
  ollamaFallbackHealthState,
  ollamaFallbackModel,
  markOllamaDown,
  ollamaHealthState,
  startOllamaHealthChecker,
  ollamaUrl,
  ollamaFetch,
  lastLoadedModel,
  warmOllama,
  startWarmTimer,
} from "./server/llmProviderService.js";
import { ModelSettingsStore, listInstalledModels, clearModelCache, validModelName } from "./server/models.js";
import { AccessStore } from "./server/accessStore.js";
import { registerAuth, accessConfigSummary, backfillAccessPolicies, initLogoutStore, isAdminEmail } from "./server/auth.js";
import { suggestTools, toolsPromptNote, wantsGev, readGevSnapshot } from "./server/llmTools.js";
import { checkImageReadable, unreadableReply, UNREADABLE_MARK } from "./server/imageCheck.js";
import { LlmProviderConfig, LlmProviderType } from "./src/types/llmAndGrok.js";
import { checkEquationAnswer, formatRoots } from "./server/mathCheck.js";
import { adminTokenMatches } from "./server/adminToken.js";
import { practiceFor } from "./server/practice.js";
import { comfyVram, hasMinorTerms, kawaiiStatus, renderKawaii, unloadOllama, KAWAII_INSTALL_PLAN } from "./server/kawaii.js";
import { dataUrlToText } from "./server/documentText.js";
import fs from "fs";
import crypto from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** x-admin-token header check (shared helper; unset ADMIN_TOKEN => always denied). */
function isAdmin(req: express.Request): boolean {
  return adminTokenMatches(req.get("x-admin-token") || "");
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Admin token required" });
  next();
}

/** Simple in-memory fixed-window per-IP rate limiter. */
function createRateLimiter(maxPerWindow: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs).unref();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Per signed-in user when known (everyone shares 127.0.0.1 behind the tunnel), else per client IP.
    const key = (req as express.Request & { identity?: { email: string } | null }).identity?.email || req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > maxPerWindow) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests, slow down a little!" });
    }
    next();
  };
}

function envInt(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3100;
  const HOST = process.env.HOST || "127.0.0.1";
  // Behind nginx on the same box: trust the first proxy hop so req.ip is the real client IP.
  app.set("trust proxy", process.env.TRUST_PROXY ?? "loopback");
  app.disable("x-powered-by");
  const isProd = process.env.NODE_ENV === "production";
  app.use(
    helmet({
      // Vite dev mode injects inline scripts/HMR websockets, so the strict CSP applies to production builds.
      contentSecurityPolicy: isProd
        ? {
            useDefaults: true,
            directives: {
              "default-src": ["'self'"],
              "script-src": ["'self'", "https://static.cloudflareinsights.com"],
              "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
              "img-src": ["'self'", "data:", "blob:"],
              "media-src": ["'self'", "data:", "blob:"],
              "connect-src": ["'self'", "https://cloudflareinsights.com"],
              "frame-ancestors": ["'none'"],
              "frame-src": ["'self'"],
              // Sign out posts to /api/auth/logout, which redirects to the Access team domain's logout.
              "form-action": ["'self'", ...(process.env.CF_ACCESS_TEAM_DOMAIN ? [`https://${process.env.CF_ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`] : [])],
              "object-src": ["'none'"],
              "upgrade-insecure-requests": null,
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      // Camera capture uses <input capture>, which needs no Permissions-Policy grant.
      strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    })
  );

  // Frontend sends raw photos/voice as base64 data URLs (no client compression): base64 adds ~33%.
  // 10 MB photo ≈ 13.4 MB + 2-min webm voice note (~2 MB ≈ 2.7 MB) in one /api/solve call ≈ 16.1 MB → 18mb default.
  app.use(express.json({ limit: process.env.BODY_LIMIT || "18mb" }));
  // Bad JSON / oversized body: answer cleanly instead of logging a stack trace.
  app.use((err: { type?: string; status?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "Upload too large" });
    return next(err);
  });

  // Identity (Cloudflare Access / app session), 18+ gate, guest codes, admin routes.
  // Private app: never indexed.
  app.use((_req, res, next) => { res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive"); next(); });
  app.get("/robots.txt", (_req, res) => res.type("text/plain").send("User-agent: *\nDisallow: /\n"));
  const accessStore = AccessStore.fromEnv();
  initLogoutStore(process.env.DATA_DIR || path.join(process.cwd(), "data"));
  // Authenticated responses must never be cached (no back-button views after sign-out).
  // Only the public, content-hashed app bundle and cartridge art may be cached.
  app.use((req, res, next) => {
    if (!/^\/(assets|carts)\//.test(req.path) && !/^\/draftboard\/assets\//.test(req.path)) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });
  const redeemLimiter = createRateLimiter(envInt("REDEEM_RATE_LIMIT", 5), envInt("REDEEM_RATE_WINDOW_MS", 15 * 60_000));
  const { requireUserAndAge, requireAdminUser } = registerAuth(app, accessStore, redeemLimiter);
  void backfillAccessPolicies(accessStore).then((r) => { if (!r.skipped) console.log(`Access policy backfill: ${r.n} guest(s) synced`); });

  // Draftboard cartridge (Graphite fork, static WASM build) under /draftboard, behind the same sign-in + 18+ gate.
  // Its own CSP: WASM needs 'wasm-unsafe-eval'; it may only be framed by Study Buddy itself.
  // No SharedArrayBuffer use in the build, so COOP/COEP cross-origin isolation is not required.
  const draftboardDir = process.env.DRAFTBOARD_DIR || path.join(__dirname, "draftboard-dist");
  const draftboardCsp = [
    "default-src 'self'", "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self' data: blob:", "worker-src 'self' blob:",
    "media-src 'self' data: blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
  ].join("; ");
  if (fs.existsSync(path.join(draftboardDir, "index.html"))) {
    app.get("/draftboard", (req, res, next) => (req.originalUrl.split("?")[0] === "/draftboard" ? res.redirect(302, "/draftboard/") : next()));
    app.use("/draftboard", (_req, res, next) => {
      res.setHeader("Content-Security-Policy", draftboardCsp);
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      next();
    }, requireUserAndAge, (req, res, next) => {
      // Precompressed assets (the WASM is 42 MB raw, ~9 MB gzipped): serve file.gz when the browser accepts gzip.
      const m = /^\/assets\/[\w.\-]+\.(wasm|js|css)$/.exec(req.path);
      if (!m || !/\bgzip\b/.test(req.get("accept-encoding") || "")) return next();
      const gz = path.join(draftboardDir, req.path + ".gz");
      if (!gz.startsWith(draftboardDir + path.sep) || !fs.existsSync(gz)) return next();
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.type(m[1] === "wasm" ? "application/wasm" : m[1] === "js" ? "application/javascript; charset=UTF-8" : "text/css; charset=UTF-8");
      res.sendFile(gz, { headers: { "Content-Encoding": "gzip" }, cacheControl: false, lastModified: true });
    }, express.static(draftboardDir, { cacheControl: false, setHeaders: (res, f) => { if (/[\\/]assets[\\/]/.test(f)) res.setHeader("Cache-Control", "private, max-age=3600"); if (f.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm"); } }),
    (_req, res) => res.status(404).json({ error: "Not found" }));
  } else {
    console.warn(`Draftboard build not found at ${draftboardDir}; the Draftboard cartridge will show as unavailable.`);
  }
  app.get("/api/cartridges/status", requireUserAndAge, (_req, res) => {
    const ok = fs.existsSync(path.join(draftboardDir, "index.html"));
    let wasm: { path: string; bytes: number } | undefined;
    try {
      const f = ok ? fs.readdirSync(path.join(draftboardDir, "assets")).find((n) => n.endsWith(".wasm")) : undefined;
      if (f) wasm = { path: `/draftboard/assets/${f}`, bytes: fs.statSync(path.join(draftboardDir, "assets", f)).size };
    } catch { /* no assets dir */ }
    res.json({ draftboard: ok, wasm });
  });

  // Upload caps + type allowlist for photos/files sent as data URLs.
  const MAX_UPLOAD_BYTES = envInt("MAX_UPLOAD_MB", 7) * 1024 * 1024;
  const ALLOWED_UPLOAD = /^data:(image\/(png|jpe?g|webp|gif|heic|heif)|text\/plain|application\/pdf)[;,]/i;
  const uploadGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    for (const field of ["imageBase64", "audioBase64"]) {
      const v = req.body?.[field];
      if (v === undefined || v === null || v === "") continue;
      if (typeof v !== "string") return res.status(400).json({ error: "Invalid upload" });
      if (field === "imageBase64" && !ALLOWED_UPLOAD.test(v)) return res.status(415).json({ error: "Unsupported file type. Use a photo (PNG/JPEG/WebP), a .txt or a .pdf." });
      if (field === "audioBase64" && !/^data:audio\//i.test(v)) return res.status(415).json({ error: "Unsupported audio type" });
      const approxBytes = Math.floor((v.length - v.indexOf(",") - 1) * 0.75);
      if (approxBytes > MAX_UPLOAD_BYTES) return res.status(413).json({ error: `File too large (max ${envInt("MAX_UPLOAD_MB", 7)} MB)` });
    }
    const extra = req.body?.images;
    if (extra !== undefined) {
      if (!Array.isArray(extra) || extra.length > 4) return res.status(400).json({ error: "Up to 4 photos per message" });
      for (const v of extra) {
        if (typeof v !== "string" || !/^data:image\/(png|jpe?g|webp)[;,]/i.test(v)) return res.status(415).json({ error: "Photos must be PNG, JPEG or WebP" });
        if (Math.floor((v.length - v.indexOf(",") - 1) * 0.75) > MAX_UPLOAD_BYTES) return res.status(413).json({ error: `Photo too large (max ${envInt("MAX_UPLOAD_MB", 7)} MB)` });
      }
    }
    for (const field of ["message", "equationText", "voiceTranscript"]) {
      const v = req.body?.[field];
      if (typeof v === "string" && v.length > 8000) return res.status(413).json({ error: "Message too long" });
    }
    next();
  };

  const rateLimit = createRateLimiter(
    Number(process.env.RATE_LIMIT_PER_MIN) || 30,
    Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000
  );
  // Loopback calls made by the job runner below carry this per-process secret; they were already rate-limited at /api/jobs.
  const INTERNAL_JOB_KEY = crypto.randomBytes(24).toString("base64url");
  const isInternalJob = (req: express.Request) => {
    const h = req.get("x-sb-job-key") || "";
    const a = req.socket.remoteAddress || "";
    return h.length === INTERNAL_JOB_KEY.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(INTERNAL_JOB_KEY)) && (a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1");
  };
  const limitUnlessJob = (req: express.Request, res: express.Response, next: express.NextFunction) => (isInternalJob(req) ? next() : rateLimit(req, res, next));
  for (const route of ["/api/chat", "/api/solve", "/api/transcribe", "/api/tts", "/api/kawaii"]) {
    // Order: sign-in + 18+ check first (cheap rejects), then per-user rate limit, then upload caps.
    app.use(route, requireUserAndAge, limitUnlessJob, uploadGuard);
  }

  /* Async AI jobs. Cloudflare cuts a silent request at 100 s (524), and a cold model load + vision answer can take
   * longer. The browser POSTs here (202 + jobId in ~ms), then polls GET /api/jobs/:id every ~1.5 s until done. */
  type Job = { owner: string; kind: string; status: "pending" | "done"; httpStatus?: number; result?: unknown; created: number; done?: number };
  const jobs = new Map<string, Job>();
  setInterval(() => { const now = Date.now(); for (const [k, j] of jobs) if (now - j.created > 15 * 60_000) jobs.delete(k); }, 60_000).unref();
  const JOB_PATHS: Record<string, string> = { chat: "/api/chat", solve: "/api/solve", kawaii: "/api/kawaii" };
  app.post("/api/jobs", requireUserAndAge, rateLimit, uploadGuard, (req, res) => {
    const email = (req as express.Request & { identity?: { email: string } | null }).identity!.email;
    const kind = String(req.body?.kind || "");
    if (!JOB_PATHS[kind]) return res.status(400).json({ error: "Unknown job kind" });
    const open = [...jobs.values()].filter((j) => j.owner === email && j.status === "pending").length;
    if (open >= 3) return res.status(429).json({ error: "Still working on your last questions. One moment!" });
    const id = crypto.randomBytes(12).toString("base64url");
    const job: Job = { owner: email, kind, status: "pending", created: Date.now() };
    jobs.set(id, job);
    const { kind: _k, ...payload } = req.body || {};
    const fwd: Record<string, string> = { "Content-Type": "application/json", "x-sb-job-key": INTERNAL_JOB_KEY };
    for (const h of ["cookie", "cf-access-jwt-assertion", "cf-access-authenticated-user-email"]) { const v = req.get(h); if (v) fwd[h] = v; }
    void fetch(`http://127.0.0.1:${PORT}${JOB_PATHS[kind]}`, { method: "POST", headers: fwd, body: JSON.stringify(payload), signal: AbortSignal.timeout(envInt("JOB_TIMEOUT_MS", 600_000)) })
      .then(async (r) => { job.httpStatus = r.status; job.result = await r.json().catch(() => ({ error: "Bad reply from the AI" })); })
      .catch((e) => { job.httpStatus = 504; job.result = { error: e?.name === "TimeoutError" ? "The AI took too long. Please try again." : "The AI is unavailable right now." }; })
      .finally(() => { job.status = "done"; job.done = Date.now(); });
    res.status(202).json({ jobId: id, kind });
  });
  app.get("/api/jobs/:id", requireUserAndAge, (req, res) => {
    const email = (req as express.Request & { identity?: { email: string } | null }).identity!.email;
    const job = jobs.get(req.params.id);
    if (!job || job.owner !== email) return res.status(404).json({ error: "Unknown job" });
    if (job.status === "pending") return res.json({ status: "pending", elapsedMs: Date.now() - job.created });
    jobs.delete(req.params.id);
    res.json({ status: "done", httpStatus: job.httpStatus, result: job.result });
  });

  // The code-editing harness was removed from this build; keep the path a hard 404.
  app.use("/api/grok-bot", (_req, res) => res.status(404).json({ error: "Not found" }));

  // Health & Engine capability check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      // PC Ollama primary: up/down only (no URL).
      ollama: (({ up, lastCheck, hint }) => ({ up, lastCheck, ...(hint ? { hint } : {}) }))(ollamaHealthState()),
      // Local LLMs only: no cloud AI fallback of any kind.
      fallbackProvider: "none",
      cloudAssistAvailable: false,
      localEdgeEngine: "Built-in offline helper (rule-based, no AI model)",
      ollamaFallback: ollamaFallbackHealthState(),
      lastAnswer,
      answerStats,
      // Which backend will answer the next text request (shown in the UI header).
      activeEngine:
        currentActiveProvider.type !== "ollama"
          ? currentActiveProvider.type
          : isOllamaUp()
            ? `Ollama (${currentActiveProvider.model || process.env.OLLAMA_MODEL || ""})`
            : isOllamaFallbackUp()
              ? `Ollama backup (${ollamaFallbackModel()})`
              : "Offline helper",
    });
  });

  // ==========================================
  // LOCAL LLM HOOKS & PROVIDER CONTROLLER
  // ==========================================

  const DEFAULT_LLM_PROVIDERS: LlmProviderConfig[] = [
    {
      id: "local-edge",
      name: "Built-in offline helper",
      type: "local-edge",
      baseUrl: "browser://webgpu-wasm",
      model: "offline-helper",
      isEnabled: true,
      isReachable: true,
      statusMessage: "Default embedded offline symbolic & heuristic engine",
    },
    {
      id: "ollama-local",
      name: "Ollama (Local Server)",
      type: "ollama",
      baseUrl: ollamaUrl(),
      model: defaultOllamaModel(),
      isEnabled: false,
      statusMessage: "Connects to local Ollama daemon for offline open weights",
    },
    {
      id: "custom-openai",
      name: "LM Studio / Custom Local Server",
      type: "custom-server",
      baseUrl: process.env.CUSTOM_LLM_BASE_URL || "http://localhost:1234/v1",
      model: "local-model",
      isEnabled: false,
      statusMessage: "OpenAI-compatible local server (LM Studio, vLLM, LocalAI)",
    },
  ];

  // Persist provider selection across restarts (JSON file), with LLM_PROVIDER env as default.
  const PROVIDER_STATE_FILE =
    process.env.LLM_PROVIDER_STATE_FILE || path.join(process.cwd(), ".llm-provider.json");
  const VALID_TYPES: LlmProviderType[] = ["local-edge", "ollama", "custom-server"];

  /**
   * Build a provider config from server-side defaults. Only `type` and `model` are taken from the
   * client; baseUrl and apiKey always come from server env (prevents SSRF and API-key exfiltration).
   */
  function sanitizeProvider(input: unknown): LlmProviderConfig | null {
    const req = (input || {}) as Partial<LlmProviderConfig>;
    if (!req.type || !VALID_TYPES.includes(req.type)) return null;
    const base = DEFAULT_LLM_PROVIDERS.find((p) => p.type === req.type);
    if (!base) return null;
    const model =
      typeof req.model === "string" && /^[\w.:\/-]{1,100}$/.test(req.model) ? req.model : base.model;
    const out: LlmProviderConfig = { ...base, model, isEnabled: true };
    if (out.type === "custom-server") out.apiKey = process.env.CUSTOM_LLM_API_KEY || undefined;
    return out;
  }

  function loadInitialProvider(): LlmProviderConfig {
    try {
      if (fs.existsSync(PROVIDER_STATE_FILE)) {
        const saved = JSON.parse(fs.readFileSync(PROVIDER_STATE_FILE, "utf8"));
        const clean = sanitizeProvider(saved);
        if (clean) return clean;
      }
    } catch (err) {
      console.warn("Could not read provider state file:", (err as Error).message);
    }
    const envType = process.env.LLM_PROVIDER as LlmProviderType | undefined;
    const fromEnv = envType && DEFAULT_LLM_PROVIDERS.find((p) => p.type === envType);
    return sanitizeProvider(fromEnv || DEFAULT_LLM_PROVIDERS[0]) || DEFAULT_LLM_PROVIDERS[0];
  }

  function saveProvider(p: LlmProviderConfig) {
    try {
      // Only type + model are persisted; URLs and keys always come from env.
      fs.writeFileSync(PROVIDER_STATE_FILE, JSON.stringify({ type: p.type, model: p.model }, null, 2));
    } catch (err) {
      console.warn("Could not persist provider selection:", (err as Error).message);
    }
  }

  let currentActiveProvider: LlmProviderConfig = loadInitialProvider();
  // Model picker settings (admin-controlled, persisted, applied live).
  const modelStore = ModelSettingsStore.fromEnv({
    defaultModel: currentActiveProvider.model || defaultOllamaModel(),
    visionModel: (process.env.OLLAMA_VISION_MODEL || "").trim(),
    allowed: [currentActiveProvider.model || defaultOllamaModel()],
  });
  if (currentActiveProvider.type === "ollama") currentActiveProvider = { ...currentActiveProvider, model: modelStore.get().defaultModel };
  console.log(`Active LLM provider: ${currentActiveProvider.type} (${currentActiveProvider.model})`);
  const installed = () => listInstalledModels((p, init) => ollamaFetch(p, init));
  /** Model for this request: user's pick (allow-listed) or default; photos go to a vision-capable model. */
  async function pickModel(requested: unknown, hasImage: boolean): Promise<string | undefined> {
    if (currentActiveProvider.type !== "ollama") return undefined;
    const m = modelStore.resolve(requested);
    if (!hasImage) return m;
    const list = await installed().catch(() => []);
    return list.find((x) => x.name === m)?.vision ? m : modelStore.get().visionModel || m;
  }

  app.get("/api/models", requireUserAndAge, async (_req, res) => {
    const st = modelStore.get();
    const list = await installed().catch(() => []);
    const loaded = await ollamaFetch("/api/ps").then((r) => r.json()).then((j: { models?: Array<{ name: string }> }) => (j.models || []).map((m) => m.name)).catch(() => [lastLoadedModel()].filter(Boolean));
    res.json({
      default: st.defaultModel,
      models: st.allowed.filter((n) => list.some((m) => m.name === n) || !list.length).map((n) => ({ name: n, vision: Boolean(list.find((m) => m.name === n)?.vision) })),
      loaded,
    });
  });
  app.get("/api/admin/models", requireAdminUser, async (_req, res) => {
    clearModelCache();
    try {
      res.json({ installed: await installed(), settings: modelStore.get(), loaded: lastLoadedModel() });
    } catch {
      res.status(503).json({ error: "PC Ollama is offline", settings: modelStore.get() });
    }
  });
  app.post("/api/admin/models", requireAdminUser, async (req, res) => {
    const { defaultModel, visionModel, allowed } = req.body || {};
    const list = await installed().catch(() => [] as Awaited<ReturnType<typeof installed>>);
    const has = (n: string) => list.some((m) => m.name === n);
    if (!validModelName(defaultModel) || !has(defaultModel)) return res.status(400).json({ error: "Pick an installed chat model" });
    if (visionModel && (!validModelName(visionModel) || !list.find((m) => m.name === visionModel)?.vision)) return res.status(400).json({ error: "Vision model must be an installed vision-capable model" });
    const allow = Array.isArray(allowed) ? allowed.filter((n): n is string => validModelName(n) && has(n)) : [];
    modelStore.set({ defaultModel, visionModel: visionModel || "", allowed: allow });
    currentActiveProvider = { ...currentActiveProvider, model: defaultModel };
    saveProvider(currentActiveProvider);
    res.json({ ok: true, settings: modelStore.get() });
  });

  const isTextLlmProvider = (t: LlmProviderType) => t === "ollama" || t === "custom-server";

  /** Pull the first JSON object out of a model reply (handles ```json fences). */
  type ChatMsg = { role: "system" | "user" | "assistant"; content: string; images?: string[] };

  /** Optional Ollama vision model (e.g. gemma3:12b, llama3.2-vision) used for photo chat/solve. Server env only. */
  const visionModel = () => modelStore.get().visionModel;
  const visionReady = () => currentActiveProvider.type === "ollama" && Boolean(visionModel());
  /** Ollama wants raw base64 (no data: prefix). Only images are accepted. */
  const toOllamaImage = (dataUrl: unknown): string | null => {
    if (typeof dataUrl !== "string") return null;
    const m = /^data:image\/[\w.+-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
    return m ? m[1].replace(/\s+/g, "") : null;
  };
  type ChainResult =
    | { kind: "reply"; parsed: Record<string, unknown>; engine: string }
    | { kind: "local"; queueFull?: boolean; reason?: string };

  /**
   * Text routing: primary Ollama (PC 3090) -> backup Ollama (NUC) -> local rules engine. No cloud AI.
   * If Ollama is cached as DOWN we skip it without waiting. `validate` parses/validates a reply; if it throws,
   * that engine counts as failed and the next one is tried.
   */
  /** Last answered request, for monitoring (God's Eye View) via /api/health. */
  let lastAnswer: { engine: string; latencyMs: number; at: string; ok: boolean } | null = null;
  const answerStats = { total: 0, primary: 0, backup: 0, cloud: 0, offline: 0 };
  function noteAnswer(engine: string, t0: number, ok: boolean) {
    lastAnswer = { engine, latencyMs: Date.now() - t0, at: new Date().toISOString(), ok };
    answerStats.total++;
    if (/^Ollama backup/.test(engine)) answerStats.backup++;
    else if (/^Ollama/.test(engine)) answerStats.primary++;
    else if (engine === "offline-helper") answerStats.offline++;
    else answerStats.cloud++;
  }

  async function runTextChainInner(
    msgs: ChatMsg[],
    opts: { temperature: number; maxTokens?: number; jsonSchema?: Record<string, unknown>; model?: string },
    validate: (text: string) => Record<string, unknown>
  ): Promise<ChainResult> {
    let queueFull = false;
    let reason = "";
    const t = currentActiveProvider.type;
    const primaryUsable = t === "ollama" ? isOllamaUp() : t === "custom-server";
    if (isTextLlmProvider(t) && primaryUsable) {
      try {
        const provider = opts.model ? { ...currentActiveProvider, model: opts.model } : currentActiveProvider;
        const out = await executeUniversalChat(provider, msgs, { ...opts, jsonMode: true });
        return { kind: "reply", parsed: validate(out.replyText), engine: out.modelUsed };
      } catch (err) {
        reason = err instanceof Error ? err.message : "primary failed";
        if (err instanceof OllamaQueueFullError) queueFull = true;
        // Missing model = PC is reachable; fall back for this request only, keep it marked up.
        else if (err instanceof OllamaModelMissingError) { /* hint is surfaced in /api/health */ }
        // Only "can't reach the PC" errors mark Ollama down; a per-request model error (HTTP 400/500) does not.
        // A timeout means the PC answered the connection but was slow (cold load / busy): not "down", so no NUC fallback.
        else if (t === "ollama" && !/JSON|missing|Empty|timed out|status (400|404|413|422|500)\b/i.test(reason)) markOllamaDown(reason);
        console.warn(`Primary ${t} failed, using fallback:`, reason);
      }
    } else if (t === "ollama") {
      reason = "Ollama (PC) is offline";
    }
    // Primary Ollama unreachable/timed out -> backup Ollama (e.g. the NUC) before cloud/offline.
    // Text only: the backup's small model can't see photos.
    const hasImages = msgs.some((m) => m.images?.length);
    if (t === "ollama" && !queueFull && !isOllamaUp() && isOllamaFallbackUp() && !hasImages) {
      try {
        const out = await executeUniversalChat(currentActiveProvider, msgs, { ...opts, jsonMode: true, useFallback: true });
        return { kind: "reply", parsed: validate(out.replyText), engine: out.modelUsed };
      } catch (err) {
        const why = err instanceof Error ? err.message : "backup failed";
        if (!/JSON|missing|Empty|status (400|404|413|422|500)\b/i.test(why)) markOllamaFallbackDown(why);
        reason = `${reason}; backup: ${why}`;
        console.warn("Backup Ollama failed:", why);
      }
    }
    return { kind: "local", queueFull, reason };
  }

  async function runTextChain(...args: Parameters<typeof runTextChainInner>): Promise<ChainResult> {
    const t0 = Date.now();
    const r = await runTextChainInner(...args);
    noteAnswer(r.kind === "reply" ? r.engine : "offline-helper", t0, r.kind !== "local");
    return r;
  }

  /**
   * Close a JSON document that was cut off mid-way (small local models often hit the token limit).
   * Drops a dangling partial key/value, then closes any open string/array/object.
   */
  function repairTruncatedJson(src: string): string {
    const stack: string[] = [];
    let inStr = false, esc = false, lastSafe = -1;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
      else if (ch === "}" || ch === "]") { stack.pop(); lastSafe = i; }
      else if (ch === ",") lastSafe = i - 1;
    }
    if (!inStr && stack.length === 0) return src;
    // Cut back to the last complete element, then recompute the closers for that prefix.
    const cut = src.slice(0, lastSafe + 1).replace(/,\s*$/, "");
    const st: string[] = [];
    let s2 = false, e2 = false;
    for (const ch of cut) {
      if (s2) { if (e2) e2 = false; else if (ch === "\\") e2 = true; else if (ch === '"') s2 = false; continue; }
      if (ch === '"') s2 = true;
      else if (ch === "{" || ch === "[") st.push(ch === "{" ? "}" : "]");
      else if (ch === "}" || ch === "]") st.pop();
    }
    return cut.replace(/,\s*$/, "") + st.reverse().join("");
  }

  function extractJson(text: string): Record<string, unknown> {
    const cleaned = text.replace(/```(?:json)?/gi, "").trim();
    const first = cleaned.indexOf("{");
    if (first === -1) throw new Error("Model reply contained no JSON object");
    const last = cleaned.lastIndexOf("}");
    if (last > first) {
      try { return JSON.parse(cleaned.slice(first, last + 1)); } catch { /* try repair below */ }
    }
    try {
      return JSON.parse(repairTruncatedJson(cleaned.slice(first)));
    } catch {
      throw new Error("Model reply contained invalid JSON");
    }
  }

  /** Ollama structured-output schema: forces small models to always return steps + finalAnswer. */
  const SOLVE_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
      detectedEquation: { type: "string" },
      category: { type: "string" },
      steps: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            stepNumber: { type: "integer" },
            title: { type: "string" },
            mathExpression: { type: "string" },
            explanation: { type: "string" },
            spokenScript: { type: "string" },
            buddyMood: { type: "string", enum: ["thinking", "talking", "happy", "excited", "focused", "curious"] },
          },
          required: ["stepNumber", "title", "mathExpression", "explanation", "spokenScript", "buddyMood"],
        },
      },
      finalAnswer: { type: "string" },
      buddyGreeting: { type: "string" },
      audioContextInsight: { type: "string" },
      comprehensionCheck: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
          correctIndex: { type: "integer" },
          encouragementOnCorrect: { type: "string" },
          hintOnRetry: { type: "string" },
        },
        required: ["question", "options", "correctIndex", "encouragementOnCorrect", "hintOnRetry"],
      },
    },
    // steps come before finalAnswer so the model works the problem before committing to an answer.
    required: ["detectedEquation", "category", "steps", "finalAnswer", "buddyGreeting", "audioContextInsight", "comprehensionCheck"],
  };

  // Multimodal Equation & Audio Context Solver
  app.post("/api/solve", async (req, res) => {
    try {
      const {
        equationText,
        imageBase64,
        imageMimeType,
        audioBase64,
        audioMimeType,
        voiceTranscript,
        difficultyMode,
      } = req.body;

      if (imageBase64) {
        const chk = checkImageReadable(imageBase64);
        if (!chk.readable) return res.json({ unreadablePhoto: true, message: unreadableReply(chk.reason) });
      }
      const solveImage = !audioBase64 && visionReady() ? toOllamaImage(imageBase64) : null;
      if ((imageBase64 || audioBase64) && !solveImage) {
        return res.status(200).json({
          fallbackToLocalEdge: true,
          message: "Photo/voice solving needs the local vision model, which isn't available right now. Type the problem instead.",
        });
      }
      {
        const sys = [
          "You are Study Buddy, a warm, encouraging pocket math & STEM homework helper.",
          "Solve the student's problem step by step. Reply with ONLY a JSON object with keys:",
          'detectedEquation (string), category (string),',
          'steps (array of {stepNumber:int, title, mathExpression, explanation, spokenScript, buddyMood: one of thinking|talking|happy|excited|focused|curious, tip?}),',
          'finalAnswer (string, taken from your last step), audioContextInsight (string), buddyGreeting (string),',
          "comprehensionCheck ({question, options: 3 strings, correctIndex: int, encouragementOnCorrect, hintOnRetry}).",
          "In spokenScript write math in plain spoken English (e.g. 'x squared').",
          "Use 2 to 4 steps. Keep every string short (one sentence). finalAnswer must be the final result only, e.g. 'x = 4' or '12'.",
          "Double-check the arithmetic before answering.",
          "Hints before answers: make the first step a short hint that nudges the student to try the next move themselves.",
          solveImage ? `If the photo is blank, blurry, too dark, or contains no readable problem, do NOT invent one: set detectedEquation to "${UNREADABLE_MARK}", finalAnswer to "${UNREADABLE_MARK}", and use one step saying you can't read the photo.` : "",
        ].filter(Boolean).join("\n");
        const user = [
          equationText ? `Problem: ${equationText}` : "",
          voiceTranscript ? `Student's note: ${voiceTranscript}` : "",
          difficultyMode ? `Explanation style: ${difficultyMode}` : "",
        ].filter(Boolean).join("\n");
        const solveOpts: { temperature: number; maxTokens: number; jsonSchema: Record<string, unknown>; model?: string } = { temperature: 0.2, maxTokens: envInt("OLLAMA_SOLVE_NUM_PREDICT", 1536), jsonSchema: SOLVE_SCHEMA };
        const validateSolve = (text: string) => {
            const parsed = extractJson(text);
            if (!Array.isArray(parsed.steps) || parsed.steps.length === 0 || !parsed.finalAnswer) throw new Error("Model JSON missing steps/finalAnswer");
            parsed.finalAnswer = String(parsed.finalAnswer);
            parsed.steps = (parsed.steps as Array<Record<string, unknown>>)
              .filter((st) => st && typeof st === "object")
              .map((st, i) => ({
                ...st,
                stepNumber: i + 1,
                title: String(st.title ?? `Step ${i + 1}`),
                explanation: String(st.explanation ?? ""),
                spokenScript: String(st.spokenScript ?? st.explanation ?? ""),
                mathExpression: String(st.mathExpression ?? ""),
                buddyMood: typeof st.buddyMood === "string" ? st.buddyMood : "thinking",
              }));
            return parsed;
        };
        const baseMsgs: ChatMsg[] = [
          { role: "system", content: sys },
          solveImage
            ? { role: "user", content: `${user ? user + "\n" : ""}Read the problem in the attached photo (handwritten or printed), write it in detectedEquation, then solve it.`, images: [solveImage] }
            : { role: "user", content: user || "Give me a practice problem and solve it." },
        ];
        solveOpts.model = await pickModel(req.body?.model, Boolean(solveImage));
        let result = await runTextChain(baseMsgs, solveOpts, validateSolve);
        if (result.kind === "reply" && solveImage && new RegExp(UNREADABLE_MARK + "|can'?t read|cannot read|unreadable", "i").test(`${result.parsed.detectedEquation} ${result.parsed.finalAnswer}`)) {
          return res.json({ unreadablePhoto: true, engine: result.engine, message: unreadableReply() });
        }
        if (result.kind === "reply" && equationText) {
          // Verify linear/quadratic answers deterministically; small local models get these wrong sometimes.
          let check = checkEquationAnswer(String(equationText), String(result.parsed.finalAnswer));
          if (check.checkable && !check.ok) {
            const correct = formatRoots(check.expected, check.variable);
            console.warn(`Solver answer "${result.parsed.finalAnswer}" failed check (expected ${correct}); retrying once`);
            const retry = await runTextChain(
              [...baseMsgs,
                { role: "assistant", content: JSON.stringify(result.parsed) },
                { role: "user", content: `That answer is wrong. Substituting shows the correct answer is ${correct}. Redo the steps carefully so they lead to ${correct}, and set finalAnswer to "${correct}".` }],
              { ...solveOpts, temperature: 0 },
              validateSolve
            );
            if (retry.kind === "reply") result = retry;
            if (result.kind === "reply") {
              check = checkEquationAnswer(String(equationText), String(result.parsed.finalAnswer));
              if (check.checkable && !check.ok) {
                // Still wrong: never show a student a wrong final answer.
                result.parsed.finalAnswer = correct;
                result.parsed.answerCorrected = true;
              }
            }
          }
          if (result.kind === "reply" && check.checkable) result.parsed.answerVerified = true;
        }
        if (result.kind === "reply") return res.json({ engine: result.engine, solution: result.parsed, practice: practiceFor(String(equationText || "")) || practiceFor(String((result.parsed as { detectedEquation?: unknown }).detectedEquation || "")) || undefined });
        if (result.kind === "local") {
          if (result.queueFull) res.setHeader("Retry-After", "30");
          return res.status(result.queueFull ? 503 : 200).json({
            fallbackToLocalEdge: true,
            queueFull: result.queueFull || undefined,
            message: result.queueFull
              ? "Study Buddy's brain is busy helping other students. Using the offline helper for now!"
              : "Using the offline helper.",
          });
        }
      }
    } catch (error: unknown) {
      console.error("Solve API error (falling back to local edge):", error instanceof Error ? error.message : error);
      if (error instanceof OllamaQueueFullError) {
        res.setHeader("Retry-After", "30");
        return res.status(503).json({ fallbackToLocalEdge: true, queueFull: true, message: "Study Buddy is busy right now. Please try again in a minute." });
      }
      return res.status(200).json({ fallbackToLocalEdge: true, message: "The AI model is offline right now. Using the offline helper." });
    }
  });

  // Voice: no cloud speech services (local LLM only). The browser's own speech recognition / voice is used.
  app.post("/api/transcribe", (_req, res) => {
    res.json({ fallbackToLocalEdge: true, notAvailable: true, message: "Server voice transcription is off (local-only). Please type your question." });
  });
  app.post("/api/tts", (_req, res) => {
    res.json({ fallbackToOfflineTTS: true, notAvailable: true, message: "Using the device voice." });
  });

  // Conversational Chat Bot & Reading Material Analyzer
  /* Kawaii Me: local-GPU chibi renderer. Consent + adult-only checks run on the server; the photo is never stored. */
  app.get("/api/kawaii/status", requireUserAndAge, async (_req, res) => {
    const st = await kawaiiStatus();
    res.json({ ...st, ...(st.installed ? {} : { plan: KAWAII_INSTALL_PLAN }) });
  });
  let kawaiiBusy = false;
  app.post("/api/kawaii", async (req, res) => {
    const { imageBase64, consent, adultConfirm } = req.body || {};
    if (consent !== true || adultConfirm !== true) return res.status(400).json({ error: "Please confirm you have the person's consent and that everyone in the photo is 18 or older." });
    for (const k of ["prompt", "caption", "note", "style"]) if (hasMinorTerms(req.body?.[k])) { console.log(`Kawaii refused: minor/age term in ${k}`); return res.status(422).json({ error: "Kawaii Me only makes adult figures. Please remove words about age or kids." }); }
    if (typeof imageBase64 !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/i.test(imageBase64)) return res.status(415).json({ error: "Use a PNG, JPEG or WebP photo." });
    const st = await kawaiiStatus();
    if (!st.installed || !st.reachable) return res.status(503).json({ error: st.reason || "Kawaii Me isn't available right now.", installed: st.installed, ...(st.installed ? {} : { plan: KAWAII_INSTALL_PLAN }) });
    const chk = checkImageReadable(imageBase64);
    if (!chk.readable) return res.status(422).json({ error: unreadableReply(chk.reason) });
    // Adults only: the local vision model screens the photo before anything is rendered. Unsure = refuse.
    const img = toOllamaImage(imageBase64);
    const visionModel = await pickModel(undefined, true);
    if (!img || !visionModel) return res.status(503).json({ error: "The safety check model isn't available, so Kawaii Me is paused." });
    const screen = await runTextChain([
      { role: "system", content: "You screen photos for an adults-only cartoon filter. Reply ONLY with JSON {\"people\": number, \"anyoneMaybeUnder18\": \"yes\"|\"no\"|\"unsure\", \"nudity\": \"yes\"|\"no\", \"caption\": short visual description of the person: hair colour and style, facial hair, glasses, clothing and colours (no age words)}. If any person could plausibly be a child or teenager, answer yes or unsure." },
      { role: "user", content: "Screen this photo.", images: [img] },
    ], { temperature: 0, model: visionModel, maxTokens: 80 }, (t) => extractJson(t));
    const v = screen.kind === "reply" ? screen.parsed as { people?: unknown; anyoneMaybeUnder18?: unknown; nudity?: unknown } : null;
    if (!v) return res.status(503).json({ error: "The safety check couldn't run. Please try again." });
    if (Number(v.people) < 1) return res.status(422).json({ error: "I couldn't find a person in that photo. Try a clear, well-lit photo of one adult." });
    if (v.anyoneMaybeUnder18 !== "no" || v.nudity !== "no" || hasMinorTerms((v as { caption?: unknown }).caption)) {
      console.log(`Kawaii refused: minor=${String(v.anyoneMaybeUnder18)} nudity=${String(v.nudity)}`);
      return res.status(422).json({ error: "Kawaii Me only works on photos of adults (and nothing explicit). Please use a different photo." });
    }
    if (kawaiiBusy) return res.status(429).json({ error: "Another Kawaii render is running. Try again in a minute." });
    kawaiiBusy = true;
    let kawaiiUnloaded = false;
    const t0 = Date.now();
    try {
      // Unload the LLM only when the GPU is too full for SDXL (KAWAII_NEED_VRAM_MB, default 7000).
      // Unload the LLM only if SDXL (~7 GB) isn't resident yet and won't fit next to it (KAWAII_NEED_VRAM_MB).
      const vr = await comfyVram();
      const need = Math.max(0, envInt("KAWAII_NEED_VRAM_MB", 7500) - (vr?.heldMB ?? 0));
      const unloaded = !vr || vr.freeMB < need || process.env.KAWAII_UNLOAD_LLM === "always" ? await unloadOllama(ollamaUrl()) : [];
      kawaiiUnloaded = unloaded.length > 0;
      console.log(`Kawaii: GPU free ${vr?.freeMB ?? "?"} MB, ComfyUI holds ${vr?.heldMB ?? "?"} MB, need ${need} MB more -> ${unloaded.length ? `unloaded ${unloaded.join(",")}` : "LLM stays loaded"}`);
      const kcap = String((v as { caption?: unknown }).caption || "");
      const out = await renderKawaii(imageBase64, kcap);
      console.log(`Kawaii render ok in ${Date.now() - t0} ms (unloaded: ${unloaded.join(",") || "none"})`);
      res.json({ image: `data:${out.mime};base64,${out.base64}` });
    } catch (e) {
      console.warn("Kawaii render failed:", e instanceof Error ? e.message : e);
      res.status(502).json({ error: "The image engine couldn't finish that one. Please try again." });
    } finally {
      kawaiiBusy = false;
      if (kawaiiUnloaded) void warmOllama(currentActiveProvider.model || process.env.OLLAMA_MODEL || "gemma3:12b", "after-kawaii");
    }
  });

  const cap = (v: unknown, n: number) => String(v ?? "").replace(/[\r\n]+/g, " ").slice(0, n);
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history, studentProfile, imageMimeType } = req.body;
      let { imageBase64, uploadedText } = req.body;
      // .txt/.pdf uploads arrive as data URLs in imageBase64: extract their text for text-only models.
      const docText = await dataUrlToText(imageBase64);
      if (docText !== null) {
        imageBase64 = undefined;
        if (!docText) {
          return res.status(200).json({
            chatReply: {
              replyText: "I couldn't read any text in that file (it may be a scanned PDF). Try pasting the text instead!",
              spokenSummary: "I couldn't read that file. Try pasting the text instead!",
              buddyMood: "curious",
            },
          });
        }
        uploadedText = docText;
      }
      if (typeof uploadedText === "string" && uploadedText.length > 12000) uploadedText = uploadedText.slice(0, 12000);

      if (imageBase64) {
        const chk = checkImageReadable(imageBase64);
        if (!chk.readable) {
          const t = unreadableReply(chk.reason);
          return res.json({ unreadablePhoto: true, chatReply: { replyText: t, spokenSummary: "I can't read that photo. Try again with better light.", buddyMood: "curious" } });
        }
      }
      // Multi-photo capture: extra frames arrive in images[] (first one may also be in imageBase64).
      const extraImgs: string[] = Array.isArray(req.body?.images) ? (req.body.images as string[]).filter((v) => v !== imageBase64) : [];
      if (!imageBase64 && extraImgs.length) imageBase64 = extraImgs.shift();
      for (const im of extraImgs) {
        const chk = checkImageReadable(im);
        if (!chk.readable) {
          const t = unreadableReply(chk.reason);
          return res.json({ unreadablePhoto: true, chatReply: { replyText: t, spokenSummary: "I can't read one of those photos. Try again with better light.", buddyMood: "curious" } });
        }
      }
      const chatImage = visionReady() ? toOllamaImage(imageBase64) : null;
      const chatImages = chatImage ? [chatImage, ...extraImgs.map((im) => toOllamaImage(im)).filter((x): x is string => Boolean(x))].slice(0, 4) : [];
      const subject = req.body?.subject === "science" ? "science" : req.body?.subject === "math" ? "math" : null;
      if (imageBase64 && !chatImage) {
        return res.status(200).json({
          chatReply: {
            replyText: "Reading photos needs the local vision model, which isn't available right now. Type or paste the text instead and I'll help!",
            spokenSummary: "I can't see pictures right now, but you can paste the text and I'll help!",
            buddyMood: "curious",
          },
        });
      }
      if (!imageBase64 || chatImage) {
        const toolLinks = suggestTools(String(message || ""));
        // Admin-only GEV reader: the server decides from the verified identity, never from anything the client sends.
        const chatIdentity = (req as express.Request & { identity?: { email: string } | null }).identity;
        const gev = chatIdentity && isAdminEmail(chatIdentity.email) && wantsGev(String(message || "")) ? await readGevSnapshot(String(message || "")) : null;
        if (gev) console.log(`GEV tool used (admin): ${gev.endpoints.map((e) => `${e.path}=${e.status}`).join(" ")}`);
        const sysLines = [
          subject === "math"
            ? "You are Study Buddy Math, a warm, encouraging math tutor (arithmetic, fractions, algebra, geometry, word problems). Show clear numbered steps and check the final answer."
            : subject === "science"
              ? "You are Study Buddy Science, a warm, curious science tutor (biology, chemistry, physics, earth science). Explain with simple, accurate concepts and an everyday example."
              : "You are Study Buddy, a warm, charismatic, encouraging pocket homework companion and tutor across ALL subjects.",
          "Always answer the student's actual question or request directly and fully. Never reply with only a question, and don't ask for their name.",
          studentProfile?.name ? `The student's name is ${cap(studentProfile.name, 60)}.` : "",
          studentProfile?.currentNeed ? `Current study focus: ${cap(studentProfile.currentNeed, 100)}` : "",
          chatImages.length > 1 ? `The student attached ${chatImages.length} photos of the same task (e.g. pages of one worksheet): read them together, in order.` : "",
          chatImage ? "The student attached a photo: look at it carefully and answer about what it actually shows (read any text or math in it). If the photo is blank, blurry, too dark or you can't make out its content, say plainly that you can't read the photo and ask for a clearer one. Never guess or invent content." : "",
          "For homework problems, give a hint or the first step before the full answer, so the student can try it.",
          toolsPromptNote(toolLinks),
          gev?.note || "",
          uploadedText ? "The student uploaded a reading passage (it is in their latest message). Analyze ONLY that passage: fill readingAnalysis with its main idea, key facts, vocabulary and a takeaway, and ignore earlier chat topics." : "",
          "Reply with ONLY a JSON object: {\"replyText\": string, \"spokenSummary\": 1-2 short sentences without markdown, \"buddyMood\": one of happy|excited|thinking|curious|talking,",
          "\"learnedStudentInfo\"?: {name?, nickname?, currentNeed?, favoriteSubject?}, \"readingAnalysis\"?: {mainIdea, facts: string[], vocabulary: [{term, definition}], takeaway}}",
        ].filter(Boolean).join("\n");
        const msgs: ChatMsg[] = [{ role: "system", content: sysLines }];
        // For an uploaded document the passage is the whole task: earlier turns only distract small models.
        if (Array.isArray(history) && !uploadedText) {
          for (const turn of history.slice(-6) as Array<{ sender: string; text: string }>) {
            if (typeof turn?.text === "string" && turn.text) msgs.push({ role: turn.sender === "user" ? "user" : "assistant", content: turn.text.slice(0, 1500) });
          }
        }
        msgs.push({
          role: "user",
          content: uploadedText
            ? `${message || "Please analyze this reading passage."}\n\nPASSAGE:\n"""\n${uploadedText}\n"""`
            : message || "Hi!",
          ...(chatImages.length ? { images: chatImages } : {}),
        });
        const chatModel = await pickModel(req.body?.model, Boolean(chatImage));
        const result = await runTextChain(msgs, { temperature: 0.7, ...(chatModel ? { model: chatModel } : {}), maxTokens: uploadedText ? envInt("OLLAMA_DOC_NUM_PREDICT", 1280) : envInt("OLLAMA_CHAT_NUM_PREDICT", 768) }, (text) => {
          let parsed: Record<string, unknown>;
          try {
            parsed = extractJson(text);
            // Small models sometimes rename the key.
            if (typeof parsed.replyText !== "string" || !parsed.replyText) {
              const alt = ["reply", "response", "text", "message", "answer", "content"].map((k) => parsed[k]).find((v) => typeof v === "string" && v);
              if (alt) parsed.replyText = alt;
            }
          } catch {
            // Model ignored JSON instructions; wrap plain text.
            parsed = { replyText: text, spokenSummary: text.slice(0, 200), buddyMood: "talking" };
          }
          if (typeof parsed.replyText !== "string" || !parsed.replyText) throw new Error("Empty response from model");
          if (typeof parsed.spokenSummary !== "string") parsed.spokenSummary = String(parsed.replyText).slice(0, 200);
          // Small models invent profile facts ("John") and reading analyses. Keep only what the student actually said.
          const said = `${message || ""}`.toLowerCase();
          if (parsed.learnedStudentInfo && typeof parsed.learnedStudentInfo === "object") {
            const info: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed.learnedStudentInfo as Record<string, unknown>)) {
              if (typeof v === "string" && v.trim().length > 1 && !/^(unknown|null|none|n\/a|user|student)$/i.test(v.trim()) && said.includes(v.trim().toLowerCase())) info[k] = v.trim();
            }
            if (Object.keys(info).length) parsed.learnedStudentInfo = info; else delete parsed.learnedStudentInfo;
          }
          const ra = parsed.readingAnalysis as { mainIdea?: unknown } | undefined;
          if (ra && (!uploadedText && String(message || "").length < 200 || typeof ra.mainIdea !== "string" || /^unknown$/i.test(ra.mainIdea))) delete parsed.readingAnalysis;
          else if (ra) {
            // The chat view maps over facts/vocabulary: make sure they are well-formed arrays.
            const r = ra as Record<string, unknown>;
            r.facts = Array.isArray(r.facts) ? r.facts.filter((f) => typeof f === "string" && f) : [];
            r.vocabulary = Array.isArray(r.vocabulary)
              ? (r.vocabulary as Array<Record<string, unknown>>).filter((v) => v && typeof v.term === "string").map((v) => ({ term: String(v.term), definition: String(v.definition ?? "") }))
              : [];
            r.takeaway = typeof r.takeaway === "string" ? r.takeaway : "";
          }
          if (typeof parsed.buddyMood !== "string") parsed.buddyMood = "talking";
          return parsed;
        });
        if (result.kind === "reply") {
          const practice = subject !== "science" ? practiceFor(`${message || ""}`) ?? (subject === "math" ? practiceFor(String(result.parsed.replyText || "")) : null) : null;
          return res.json({ chatReply: { ...result.parsed, toolLinks: toolLinks.length ? toolLinks : undefined, practice: practice || undefined }, engine: result.engine, ...(gev ? { gevTool: { used: true, ok: gev.ok, endpoints: gev.endpoints } } : {}) }); }
        if (result.kind === "local") {
          if (result.queueFull) res.setHeader("Retry-After", "30");
          return res.status(result.queueFull ? 503 : 200).json({
            fallbackToLocalEdge: true,
            queueFull: result.queueFull || undefined,
            error: result.queueFull
              ? "Study Buddy's brain is busy helping other students. Using the offline helper for now!"
              : "Using the offline helper.",
          });
        }
      }
      return res.status(200).json({ fallbackToLocalEdge: true });
    } catch (error: unknown) {
      console.error("Chat API error:", error instanceof Error ? error.message : error);
      if (error instanceof OllamaQueueFullError) {
        res.setHeader("Retry-After", "30");
        return res.status(503).json({ fallbackToLocalEdge: true, queueFull: true, error: "Study Buddy is busy right now. Please try again in a minute." });
      }
      return res.status(200).json({ fallbackToLocalEdge: true, error: "The AI model is offline right now. Using the offline helper." });
    }
  });


  // List all available LLM providers and active hook
  app.get("/api/llm/providers", (_req, res) => {
    // Public endpoint: never expose keys or internal base URLs.
    const strip = ({ apiKey: _k, baseUrl: _u, ...rest }: LlmProviderConfig) => rest;
    res.json({
      activeProvider: strip(currentActiveProvider),
      providers: DEFAULT_LLM_PROVIDERS.map((p) =>
        strip(p.id === currentActiveProvider.id ? { ...p, isEnabled: true } : { ...p, isEnabled: false })
      ),
    });
  });

  // Set active LLM provider hook
  app.post("/api/llm/select", requireAdmin, (req, res) => {
    const provider = sanitizeProvider(req.body?.provider);
    if (provider) {
      currentActiveProvider = provider;
      saveProvider(currentActiveProvider);
      return res.json({ success: true, activeProvider: currentActiveProvider });
    }
    return res.status(400).json({ error: "Invalid provider configuration" });
  });

  // Test connection to any LLM provider (local only: Ollama or LM Studio)
  app.post("/api/llm/test", requireAdmin, async (req, res) => {
    try {
      const config = sanitizeProvider(req.body);
      if (!config) return res.status(400).json({ success: false, error: "Invalid provider type" });
      const result = await testLlmProviderConnection(config);
      return res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Test failed";
      return res.json({
        success: false,
        error: msg,
        latencyMs: 0,
      });
    }
  });

  // Unknown /api/* routes must 404 (JSON), not fall through to the SPA.
  app.all("/api/*", (_req, res) => res.status(404).json({ error: "Not found" }));

  if (process.env.NODE_ENV !== "production") {
    // Imported lazily: production never loads Vite (faster startup, less memory).
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    // Hashed build assets can be cached forever; index.html must always revalidate.
    app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }));
    app.use(express.static(distPath, { cacheControl: false, setHeaders: (res, f) => { if (/[\\/]carts[\\/]/.test(f)) res.setHeader("Cache-Control", "public, max-age=86400"); } }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Last-resort error handler: log server-side, never send stack traces to the browser.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err instanceof Error ? err.message : err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  console.log("Access config:", JSON.stringify(accessConfigSummary()));
  startOllamaHealthChecker();
  app.listen(PORT, HOST, () => {
    console.log(`Study Buddy server running on http://${HOST}:${PORT}`);
    if (process.env.OLLAMA_WARMUP !== "false") {
      void warmOllama(modelStore.get().defaultModel, "startup");
      startWarmTimer(() => modelStore.get().defaultModel);
    }
  });
}

startServer();
