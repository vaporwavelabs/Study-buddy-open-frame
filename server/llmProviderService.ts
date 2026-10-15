import { LlmProviderConfig, LlmTestResult } from "../src/types/llmAndGrok.js";

// Read lazily: dotenv.config() in server.ts runs after ES module imports are evaluated.
export function defaultOllamaModel(): string {
  return process.env.OLLAMA_MODEL || "gemma3:4b";
}

const envInt = (name: string, def: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
};

/**
 * In-process FIFO queue: only one Ollama request runs at a time (CPU-only VPS can't handle parallel inference).
 */
let ollamaChain: Promise<unknown> = Promise.resolve();
let ollamaInFlight = 0;
let ollamaMaxObserved = 0;
export function ollamaQueueStats() {
  return { inFlight: ollamaInFlight, pending: ollamaPending, maxConcurrentObserved: ollamaMaxObserved };
}
export class OllamaQueueFullError extends Error {
  constructor(max: number) {
    super(`Study Buddy's local brain is busy helping other students (${max} requests waiting). Please try again in a minute!`);
    this.name = "OllamaQueueFullError";
  }
}
export let emptyRetryCount = 0;
let ollamaPending = 0; // running + waiting
function enqueueOllama<T>(task: () => Promise<T>): Promise<T> {
  const maxQueue = envInt("OLLAMA_MAX_QUEUE", 8);
  if (ollamaPending >= maxQueue) {
    return Promise.reject(new OllamaQueueFullError(maxQueue));
  }
  ollamaPending++;
  const run = ollamaChain.then(async () => {
    ollamaInFlight++;
    ollamaMaxObserved = Math.max(ollamaMaxObserved, ollamaInFlight);
    try {
      return await task();
    } finally {
      ollamaInFlight--;
    }
  });
  ollamaChain = run.catch(() => undefined);
  return run.finally(() => {
    ollamaPending--;
  });
}

function chatTimeoutMs(): number {
  const n = Number(process.env.OLLAMA_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 45000;
}

/** Ollama rejects bare numeric strings ("-1"): send numbers as numbers (seconds; -1 = keep forever), durations ("30m") as strings. */
/** keep_alive as a number of seconds (Ollama treats numbers reliably; "30m" strings were sometimes ignored by proxies). */
export function ollamaKeepAlive(): number {
  const v = (process.env.OLLAMA_KEEP_ALIVE || "1800").trim();
  const m = /^(-?\d+(?:\.\d+)?)\s*(s|m|h)?$/i.exec(v);
  if (!m) return 1800;
  const n = Number(m[1]);
  return Math.round(n * ({ s: 1, m: 60, h: 3600 } as Record<string, number>)[(m[2] || "s").toLowerCase()]);
}

let lastOllamaActivity = 0;
/** Load `model` into VRAM without generating (empty prompt) so the next student request isn't a cold load. */
export async function warmOllama(model: string, reason: string): Promise<boolean> {
  const t = Date.now();
  try {
    const r = await enqueueOllama(async () => {
      if (lastPrimaryModel && lastPrimaryModel !== model) await unloadIfSwitching(model);
      lastPrimaryModel = model;
      return ollamaFetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt: "", keep_alive: ollamaKeepAlive() }) }, 240000);
    });
    lastOllamaActivity = Date.now();
    console.log(`Warm-up (${reason}) ${model}: ${r.ok ? "ready" : "HTTP " + r.status} in ${Date.now() - t} ms`);
    return r.ok;
  } catch (err) {
    console.warn(`Warm-up (${reason}) ${model} failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
/** Re-warm on a timer when idle, a bit before keep_alive would expire. */
export function startWarmTimer(getModel: () => string) {
  const ka = ollamaKeepAlive();
  const want = Number(process.env.OLLAMA_WARM_EVERY_S) || 600;
  const every = Math.max(60, ka < 0 ? want : Math.min(ka - 120, want)) * 1000; // keep_alive -1 = forever: just re-check every 10 min
  setInterval(() => { if (Date.now() - lastOllamaActivity > every - 5000) void warmOllama(getModel(), "timer"); }, every).unref();
}

/** OLLAMA_THINK=false turns off "thinking" on reasoning models (qwen3, gemma4...) for fast tutor replies. Unset = model default. */
function thinkOption(): { think?: boolean } {
  const v = (process.env.OLLAMA_THINK || "").trim().toLowerCase();
  return v === "false" || v === "0" ? { think: false } : v === "true" || v === "1" ? { think: true } : {};
}

/** OLLAMA_URL (preferred) or legacy OLLAMA_BASE_URL. Server-env only; never from clients. */
export function ollamaUrl(): string {
  return (process.env.OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
}

/** Bearer token for the token-auth proxy in front of Ollama on the PC. */
function ollamaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.OLLAMA_TOKEN;
  const h: Record<string, string> = { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  // Cloudflare Tunnel option: Access service-token headers (checked at Cloudflare's edge).
  if (process.env.OLLAMA_CF_ACCESS_CLIENT_ID && process.env.OLLAMA_CF_ACCESS_CLIENT_SECRET) {
    h["CF-Access-Client-Id"] = process.env.OLLAMA_CF_ACCESS_CLIENT_ID;
    h["CF-Access-Client-Secret"] = process.env.OLLAMA_CF_ACCESS_CLIENT_SECRET;
  }
  return h;
}

// ---------- Optional backup Ollama (e.g. the NUC over WireGuard) ----------
/** OLLAMA_FALLBACK_URL: second Ollama tried when the primary is unreachable or times out. Server env only. */
export function ollamaFallbackUrl(): string {
  return (process.env.OLLAMA_FALLBACK_URL || "").trim().replace(/\/+$/, "");
}
export function ollamaFallbackModel(): string {
  return (process.env.OLLAMA_FALLBACK_MODEL || "qwen2.5:1.5b").trim();
}
function ollamaFallbackHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.OLLAMA_FALLBACK_TOKEN;
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
let fallbackUp = false;
let fallbackLastCheck = 0;
let fallbackLastError = "not checked yet";
export function isOllamaFallbackUp(): boolean {
  return Boolean(ollamaFallbackUrl()) && fallbackUp;
}
export function markOllamaFallbackDown(reason: string): void {
  if (fallbackUp) console.warn(`Backup Ollama marked DOWN: ${reason}`);
  fallbackUp = false;
  fallbackLastError = reason.slice(0, 200);
}
export function ollamaFallbackHealthState() {
  if (!ollamaFallbackUrl()) return { configured: false };
  return {
    configured: true,
    up: fallbackUp,
    model: ollamaFallbackModel(),
    lastCheck: fallbackLastCheck ? new Date(fallbackLastCheck).toISOString() : null,
    lastError: fallbackUp ? null : fallbackLastError,
  };
}
export async function checkOllamaFallbackHealth(): Promise<boolean> {
  const url = ollamaFallbackUrl();
  if (!url) return false;
  try {
    const res = await fetchWithTimeout(`${url}/api/tags`, { headers: ollamaFallbackHeaders() }, envInt("OLLAMA_HEALTH_TIMEOUT_MS", 2000));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!fallbackUp) console.log(`Backup Ollama is UP (${url})`);
    fallbackUp = true;
  } catch (err) {
    markOllamaFallbackDown(err instanceof Error ? err.message : "health check failed");
  }
  fallbackLastCheck = Date.now();
  return fallbackUp;
}

export class OllamaModelMissingError extends Error {
  constructor(public model: string) {
    super(`Ollama model "${model}" is not installed on the PC. Run: ollama pull ${model}`);
    this.name = "OllamaModelMissingError";
  }
}
let ollamaModelHint: string | null = null;

// ---------- Ollama health (cached up/down) ----------
let ollamaUp = false;
let ollamaLastCheck = 0;
let ollamaLastError = "not checked yet";
let healthTimer: NodeJS.Timeout | null = null;

export function isOllamaUp(): boolean {
  return ollamaUp;
}
export function ollamaHealthState() {
  return {
    up: ollamaUp,
    lastCheck: ollamaLastCheck ? new Date(ollamaLastCheck).toISOString() : null,
    lastError: ollamaUp ? null : ollamaLastError,
    hint: ollamaModelHint,
  };
}
/** Mark down immediately after a failed request (next health tick may bring it back). */
export function markOllamaDown(reason: string): void {
  if (ollamaUp) console.warn(`Ollama marked DOWN: ${reason}`);
  ollamaUp = false;
  ollamaLastError = reason.slice(0, 200);
}

export async function checkOllamaHealth(): Promise<boolean> {
  const timeout = envInt("OLLAMA_HEALTH_TIMEOUT_MS", 2000);
  try {
    const res = await fetchWithTimeout(`${ollamaUrl()}/api/tags`, { headers: ollamaHeaders() }, timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tags = (await res.json().catch(() => ({}))) as { models?: Array<{ name?: string; model?: string }> };
    if (!ollamaUp) console.log("Ollama is UP");
    const want = defaultOllamaModel();
    const names = (tags.models || []).map((m) => m.name || m.model || "");
    const has = names.some((n) => n === want || n === `${want}:latest` || (!want.includes(":") && n.startsWith(`${want}:`)));
    if (Array.isArray(tags.models) && !has) {
      if (!ollamaModelHint) console.warn(`Ollama is up but "${want}" is missing. Run on the PC: ollama pull ${want}`);
      ollamaModelHint = `run "ollama pull ${want}" on the PC`;
    } else if (has) {
      ollamaModelHint = null;
    }
    ollamaUp = true;
  } catch (err) {
    markOllamaDown(err instanceof Error ? err.message : "health check failed");
  }
  ollamaLastCheck = Date.now();
  return ollamaUp;
}

export function startOllamaHealthChecker(): void {
  if (healthTimer) return;
  if (!process.env.OLLAMA_TOKEN) {
    console.warn(
      "WARNING: OLLAMA_TOKEN is empty. Requests to OLLAMA_URL carry no Bearer token; the PC's Caddy proxy will reject them (401). Set OLLAMA_TOKEN in .env."
    );
  }
  void checkOllamaHealth();
  void checkOllamaFallbackHealth();
  healthTimer = setInterval(() => { void checkOllamaHealth(); void checkOllamaFallbackHealth(); }, envInt("OLLAMA_HEALTH_INTERVAL_MS", 30000));
  healthTimer.unref();
}

/** Authenticated request to the primary Ollama (model listing, /api/ps, unload). */
export function ollamaFetch(p: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  return fetchWithTimeout(`${ollamaUrl()}${p}`, { ...init, headers: ollamaHeaders((init.headers as Record<string, string>) || {}) }, timeoutMs);
}

/** Last model the primary Ollama ran. Switching unloads it first (keep_alive 0) so two big models never share 24 GB. */
let lastPrimaryModel: string | null = null;
export const lastLoadedModel = () => lastPrimaryModel;
async function unloadIfSwitching(next: string) {
  if (lastPrimaryModel === next || process.env.OLLAMA_UNLOAD_ON_SWITCH === "false") return;
  // Ask Ollama what is actually resident (warmups or earlier processes may have loaded models we never tracked).
  let resident: string[] = lastPrimaryModel ? [lastPrimaryModel] : [];
  try {
    const r = await ollamaFetch("/api/ps", { method: "GET" }, 5000);
    const j = (await r.json()) as { models?: { name?: string; model?: string }[] };
    resident = (j.models || []).map((m) => m.name || m.model || "").filter(Boolean);
  } catch { /* fall back to the tracked model */ }
  for (const prev of resident.filter((m) => m !== next)) {
    try {
      await ollamaFetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: prev, keep_alive: 0 }) }, 15000);
      console.log(`Unloaded ${prev} before switching to ${next}`);
    } catch (err) {
      console.warn(`Could not unload ${prev}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/** fetch with an AbortController-based timeout */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tests connection to an LLM provider (local only: Ollama or a local OpenAI-compatible server)
 */
export async function testLlmProviderConnection(
  config: LlmProviderConfig
): Promise<LlmTestResult> {
  const startTime = Date.now();
  const { type, baseUrl, apiKey, model } = config;

  try {
    if (type === "ollama") {
      const cleanBase = ollamaUrl();
      const res = await fetch(`${cleanBase}/api/tags`, {
        headers: ollamaHeaders(),
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        throw new Error(`Ollama responded with HTTP status ${res.status}`);
      }

      const data = await res.json();
      const models = Array.isArray(data.models)
        ? data.models.map((m: { name?: string; model?: string }) => m.name || m.model || "")
        : [];

      return {
        success: true,
        provider: "ollama",
        baseUrl: cleanBase,
        model: model || defaultOllamaModel(),
        latencyMs: Date.now() - startTime,
        availableModels: models,
        message: `Connected to Ollama! Found ${models.length} installed model(s).`,
      };
    }

    if (type === "custom-server") {
      const cleanBase = (baseUrl || "http://localhost:1234/v1").replace(/\/+$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(`${cleanBase}/models`, {
        headers,
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        throw new Error(`Custom server responded with status ${res.status}`);
      }

      const data = await res.json();
      const models = Array.isArray(data.data)
        ? data.data.map((m: { id?: string }) => m.id || "")
        : [];

      return {
        success: true,
        provider: "custom-server",
        baseUrl: cleanBase,
        model: model || models[0] || "local-model",
        latencyMs: Date.now() - startTime,
        availableModels: models,
        message: `Connected to Custom OpenAI-compatible server! Found ${models.length} model(s).`,
      };
    }

    // Default: built-in offline helper (runs in-browser)
    return {
      success: true,
      provider: "local-edge",
      baseUrl: "browser://webgpu-wasm",
      model: "offline-helper",
      latencyMs: 1,
      availableModels: ["offline-helper"],
      message: "Built-in offline helper (rule-based) is active.",
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Connection failed";
    return {
      success: false,
      provider: type,
      baseUrl: baseUrl || "",
      model: model || "",
      latencyMs: Date.now() - startTime,
      availableModels: [],
      message: msg,
    };
  }
}

/**
 * Universal chat completion runner across any provider (local only: Ollama or a local OpenAI-compatible server)
 */
export async function executeUniversalChat(
  config: LlmProviderConfig,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string; images?: string[] }>,
  options: { temperature?: number; maxTokens?: number; jsonMode?: boolean; jsonSchema?: Record<string, unknown>; useFallback?: boolean; _emptyRetry?: boolean } = {}
): Promise<{ replyText: string; modelUsed: string }> {
  const { type, baseUrl, apiKey } = config;
  const model = type === "ollama" ? config.model || defaultOllamaModel() : config.model;
  const timeoutMs = chatTimeoutMs();

  if (type === "ollama" && options.useFallback) {
    // Backup Ollama: direct call (its own small queue isn't needed for a rarely used path), backup model.
    const fbModel = ollamaFallbackModel();
    const r = await fetchWithTimeout(`${ollamaFallbackUrl()}/api/chat`, {
      method: "POST",
      headers: ollamaFallbackHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model: fbModel,
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: false,
        keep_alive: ollamaKeepAlive(),
        ...thinkOption(),
        ...(options.jsonSchema ? { format: options.jsonSchema } : options.jsonMode ? { format: "json" } : {}),
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? envInt("OLLAMA_NUM_PREDICT", 512),
          num_ctx: envInt("OLLAMA_NUM_CTX", 4096),
        },
      }),
    }, envInt("OLLAMA_FALLBACK_TIMEOUT_MS", timeoutMs));
    const text = await r.text();
    if (!r.ok) throw new Error(`Backup Ollama chat failed with status ${r.status}: ${text.slice(0, 200)}`);
    const data = JSON.parse(text);
    return { replyText: data.message?.content || "", modelUsed: `Ollama backup (${fbModel})` };
  }

  if (type === "ollama") {
    const cleanBase = ollamaUrl();
    // Timeout starts when the request actually runs (not while waiting in the queue).
    const res = await enqueueOllama(async () => { lastOllamaActivity = Date.now(); const switching = lastPrimaryModel !== model; await unloadIfSwitching(model); lastPrimaryModel = model; const tmo = switching ? timeoutMs + envInt("OLLAMA_SWITCH_EXTRA_MS", 180000) : timeoutMs; return fetchWithTimeout(`${cleanBase}/api/chat`, {
      method: "POST",
      headers: ollamaHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        keep_alive: ollamaKeepAlive(),
        ...(options._emptyRetry ? { think: false } : thinkOption()),
        ...(options.jsonSchema ? { format: options.jsonSchema } : options.jsonMode ? { format: "json" } : {}),
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? envInt("OLLAMA_NUM_PREDICT", 512),
          num_ctx: envInt("OLLAMA_NUM_CTX", 4096),
        },
      }),
    }, tmo).then(async (r) => {
      // Read the body inside the queue slot so the next request starts only after this one finishes.
      const text = await r.text();
      return { ok: r.ok, status: r.status, json: async () => JSON.parse(text) };
    }); });

    if (!res.ok) {
      if (res.status === 404) {
        let body = "";
        try {
          body = JSON.stringify(await res.json());
        } catch {}
        if (/not found|pull/i.test(body)) {
          ollamaModelHint = `run "ollama pull ${model}" on the PC`;
          console.warn(`Ollama model "${model}" not found. Run on the PC: ollama pull ${model}`);
          throw new OllamaModelMissingError(model);
        }
      }
      let detail = "";
      try { detail = JSON.stringify(await res.json()).slice(0, 300); } catch {}
      throw new Error(`Ollama chat failed with status ${res.status}${detail ? `: ${detail}` : ""}`);
    }

    const data = await res.json();
    const content = String(data.message?.content || "");
    // gemma4/qwen3-style models sometimes spend the whole budget "thinking" and return an empty reply:
    // retry once with thinking off and a slightly larger budget.
    if (!content.trim() && !options._emptyRetry && envInt("OLLAMA_EMPTY_RETRY", 1) > 0) {
      console.warn(`Ollama (${model}) returned an empty reply; retrying once with think=false`);
      emptyRetryCount++;
      return executeUniversalChat(config, messages, { ...options, _emptyRetry: true, maxTokens: Math.round((options.maxTokens ?? 512) * 1.5) });
    }
    return {
      replyText: content,
      modelUsed: `Ollama (${model})`,
    };
  }

  if (type === "custom-server") {
    // Local OpenAI-compatible server only (LM Studio etc.); URL comes from server env.
    const endpoint = `${(baseUrl || "http://localhost:1234/v1").replace(/\/+$/, "")}/chat/completions`;
    const keyToUse = apiKey;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (keyToUse) headers["Authorization"] = `Bearer ${keyToUse}`;

    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model || "local-model",
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
        ...(options.jsonMode && type === "custom-server" ? { response_format: { type: "json_object" } } : {}),
      }),
    }, timeoutMs);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${type} chat failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";
    return {
      replyText: reply,
      modelUsed: `Local server (${model || "default"})`,
    };
  }

  throw new Error("No active LLM provider reachable");
}
