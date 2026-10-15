// Server running with OLLAMA_URL pointing at a dead port: everything must degrade to the offline helper, never 5xx/hang.
const base = process.argv[2]; let fails = 0;
const post = async (p, b) => { const t = Date.now(); const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json(), ms: Date.now() - t }; };
const h = await (await fetch(base + "/api/health")).json();
console.log((h.ollama?.up === false ? "PASS" : (fails++, "FAIL")) + " health reports ollama down", JSON.stringify(h.ollama));
for (const [p, b] of [["/api/chat", { message: "hello" }], ["/api/solve", { equationText: "2x+3=11" }]]) {
  const r = await post(p, b); const ok = r.s === 200 && r.j.fallbackToLocalEdge === true && r.ms < 5000;
  if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${p} falls back offline (${r.ms}ms) ${JSON.stringify(r.j)}`);
}
process.exit(fails ? 1 : 0);
