// Benchmark one model through the running app + raw Ollama. usage: node tests/bench.mjs <appUrl> <ollamaUrl> <model> [visionModel]
// Prints one JSON line (for bench tables).
import fs from "node:fs";
const [app, ollama, model] = process.argv.slice(2);
const post = async (url, body, timeout = 300000) => {
  const t = Date.now();
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  return { j: await r.json().catch(() => ({})), ms: Date.now() - t };
};
const out = { model };
// Raw speed: streaming chat -> time to first token + generation tokens/sec (from Ollama's own counters).
{
  const t = Date.now(); let ttft = null; let last = null;
  const r = await fetch(`${ollama}/api/chat`, { method: "POST", body: JSON.stringify({ model, stream: true, keep_alive: "10m", messages: [{ role: "user", content: "Explain photosynthesis to a 10 year old in about 120 words." }], options: { num_predict: 300, num_ctx: Number(process.env.OLLAMA_NUM_CTX) || 4096 } }) });
  const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const j = JSON.parse(line);
      if (ttft === null && j.message?.content) ttft = Date.now() - t; if (j.done) last = j; } }
  out.ttftMs = ttft; out.tokPerSec = last ? +(last.eval_count / (last.eval_duration / 1e9)).toFixed(1) : null;
  out.promptTokPerSec = last?.prompt_eval_duration ? +(last.prompt_eval_count / (last.prompt_eval_duration / 1e9)).toFixed(0) : null;
}
const ps = await (await fetch(`${ollama}/api/ps`)).json().catch(() => ({}));
const me = (ps.models || []).find((m) => m.name === model || m.model === model);
out.vramGB = me ? +(me.size_vram / 1e9).toFixed(1) : null; out.sizeGB = me ? +(me.size / 1e9).toFixed(1) : null;
out.gpuPct = me && me.size ? Math.round((me.size_vram / me.size) * 100) : null;
// Quality through the app (same prompts/schema/checker students get).
const problems = [["2x + 3 = 11", /\b4\b/], ["15% of 80", /\b12\b/], ["x^2 - 9 = 0", /±\s*3|(?=.*-\s*3)(?=.*\b3\b)/], ["A train travels 120 km in 2 hours. What is its average speed?", /\b60\b/], ["3(y - 2) = 2y + 1", /\b7\b/]];
out.solve = [];
for (const [p, re] of problems) {
  const { j, ms } = await post(`${app}/api/solve`, { equationText: p });
  const s = j.solution || {};
  out.solve.push({ p, final: s.finalAnswer ?? null, ok: re.test(String(s.finalAnswer)), corrected: !!s.answerCorrected, steps: s.steps?.length ?? 0, ms, engine: j.engine ?? "offline" });
}
{
  const { j, ms } = await post(`${app}/api/chat`, { message: "Explain photosynthesis to a 10 year old.", history: [], studentProfile: {} });
  out.explain = { ms, text: j.chatReply?.replyText ?? null, engine: j.engine ?? "offline" };
}
{
  const txt = "data:text/plain;base64," + fs.readFileSync(new URL("./fixtures/passage.txt", import.meta.url)).toString("base64");
  const { j, ms } = await post(`${app}/api/chat`, { message: "Please analyze this reading material: passage.txt", history: [], studentProfile: {}, imageBase64: txt });
  const ra = j.chatReply?.readingAnalysis;
  out.passage = { ms, mainIdea: ra?.mainIdea ?? null, facts: ra?.facts?.length ?? 0, vocab: ra?.vocabulary?.map((v) => v.term) ?? [], ok: /water/i.test(JSON.stringify(j.chatReply || {})), engine: j.engine ?? "offline" };
}
if (process.env.BENCH_VISION === "1") {
  const img = "data:image/png;base64," + fs.readFileSync(new URL("./fixtures/equation.png", import.meta.url)).toString("base64");
  const { j, ms } = await post(`${app}/api/solve`, { equationText: "", imageBase64: img });
  out.vision = { ms, detected: j.solution?.detectedEquation ?? null, final: j.solution?.finalAnswer ?? null, ok: /\b5\b/.test(String(j.solution?.finalAnswer)), engine: j.engine ?? "offline" };
}
console.log(JSON.stringify(out));
