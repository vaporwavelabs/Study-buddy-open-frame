/** Start an AI job on the server and poll until it finishes, so no single HTTP request
 *  stays open long enough for Cloudflare's 100 s limit (HTTP 524). */
export type AiResult = { ok: boolean; status: number; data: any };

export async function runAiJob(kind: "chat" | "solve" | "kawaii", body: Record<string, unknown>, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<AiResult> {
  const start = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...body }), signal: opts.signal });
  const startJson = await start.json().catch(() => null);
  if (start.status !== 202 || !startJson?.jobId) {
    return { ok: false, status: start.status, data: startJson || { error: start.status === 413 ? "That file is too big." : `Study Buddy couldn't start (HTTP ${start.status}). Try again.` } };
  }
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  let wait = 800;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, wait));
    wait = Math.min(2000, wait + 300);
    let r: Response;
    try {
      r = await fetch(`/api/jobs/${encodeURIComponent(startJson.jobId)}`, { cache: "no-store", signal: opts.signal });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      continue; // brief network blip: keep polling
    }
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return { ok: false, status: r.status, data: j || { error: `Lost track of the answer (HTTP ${r.status}). Please ask again.` } };
    if (j.status === "done") return { ok: (j.httpStatus || 500) < 400, status: j.httpStatus || 500, data: j.result };
  }
  return { ok: false, status: 504, data: { error: "Study Buddy took too long. Please try again." } };
}
