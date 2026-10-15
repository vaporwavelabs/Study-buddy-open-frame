// Primary Ollama down (refused or hanging) + backup Ollama up: answers must come from the backup, not the offline helper.
// Start the app with OLLAMA_URL=<dead or hanging> and OLLAMA_FALLBACK_URL=<working Ollama>, then: node tests/e2e-fallback.mjs <url>
const base = process.argv[2] || "http://127.0.0.1:3100";
let fails = 0;
const rec = (ok, name, ms, sample) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${name} (${ms}ms)\n   ${String(sample).slice(0, 300).replace(/\n/g, " ")}`); };
const post = async (p, b) => { const t = Date.now(); const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json(), ms: Date.now() - t }; };

// First request may be what discovers the primary is down (timeout) — it must still be answered by the backup.
let r = await post("/api/chat", { message: "What is the capital of Japan?", history: [], studentProfile: {} });
rec(r.s === 200 && /^Ollama backup/.test(r.j.engine || "") && /tokyo/i.test(r.j.chatReply?.replyText || ""), "chat answered by backup", r.ms, `[${r.j.engine}] ${r.j.chatReply?.replyText ?? JSON.stringify(r.j)}`);

const h = await (await fetch(base + "/api/health")).json();
rec(h.ollama?.up === false && h.ollamaFallback?.up === true && /^Ollama backup \(.+\)$/.test(h.activeEngine), "health: primary down, backup up, label says backup", 0, `${h.activeEngine} | primaryErr=${h.ollama?.lastError}`);

r = await post("/api/solve", { equationText: "2x + 3 = 11" });
rec(r.s === 200 && /^Ollama backup/.test(r.j.engine || "") && /\b4\b/.test(String(r.j.solution?.finalAnswer)), "solve answered by backup", r.ms, `[${r.j.engine}] final=${r.j.solution?.finalAnswer}`);

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
r = await post("/api/chat", { message: "What is in this photo?", imageBase64: png });
rec(r.s === 200 && !/^Ollama backup/.test(r.j.engine || ""), "photo is NOT sent blind to the text-only backup", r.ms, JSON.stringify(r.j).slice(0, 200));

console.log(fails ? `\n${fails} failed` : "\nall fallback checks passed");
process.exit(fails ? 1 : 0);
