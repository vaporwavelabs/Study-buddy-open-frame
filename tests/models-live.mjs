// Live model switching on the PC: node tests/models-live.mjs http://127.0.0.1:3100   env: E2E_ADMIN_TOKEN
import fs from "node:fs";
const base = process.argv[2] || "http://127.0.0.1:3100";
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const lr = await fetch(base + "/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "hashflow67@gmail.com", adminToken: process.env.E2E_ADMIN_TOKEN }) });
const C = (lr.headers.get("set-cookie") || "").split(";")[0];
const req = async (p, body) => { const t = Date.now(); const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Cookie: C }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null), ms: Date.now() - t }; };
await req("/api/age/confirm", { confirm18: true });
const adm = await req("/api/admin/models");
const inst = adm.j?.installed || [];
console.log("installed:", inst.map((m) => `${m.name}${m.vision ? "[vision]" : ""}${m.tooBig ? "[TOO BIG]" : ""} ${m.sizeGB}GB`).join(", "));
ok(!inst.some((m) => /llama3\.2-vision|embed/.test(m.name)), "mllama/embedding models hidden");
const find = (re) => inst.find((m) => re.test(m.name))?.name;
const g12 = find(/^gemma3:12b/), q8 = find(/^qwen3:8b/), g4 = find(/^gemma4:26b/);
ok(g12 && q8 && g4, `found ${g12}, ${q8}, ${g4}`);
const save = await req("/api/admin/models", { defaultModel: g12, visionModel: g12, allowed: [g12, q8, g4] });
ok(save.s === 200, "admin saved default/vision/allow list (no restart)");
const ps = async () => (await (await fetch("http://" + (process.env.OLLAMA_HOST || "127.0.0.1:11434") + "/api/ps").catch(() => null))?.json().catch(() => null))?.models?.map((m) => m.name) ?? ["(ps n/a)"];
for (const m of [q8, g4, g12]) {
  const c = await req("/api/chat", { message: "In one sentence, why do leaves change color in autumn?", history: [], studentProfile: {}, model: m });
  ok(c.s === 200 && c.j?.engine === `Ollama (${m})` && /chlorophyll|pigment|light|cold|green/i.test(c.j?.chatReply?.replyText || ""), `chat on ${m}: ${c.ms}ms [${c.j?.engine}] ${String(c.j?.chatReply?.replyText).slice(0, 110)}`);
  const s = await req("/api/solve", { equationText: "2x + 3 = 11", model: m });
  ok(s.s === 200 && /\b4\b/.test(String(s.j?.solution?.finalAnswer)) && s.j?.engine === `Ollama (${m})`, `solve on ${m}: ${s.ms}ms final=${s.j?.solution?.finalAnswer}`);
  const loaded = await ps();
  ok(loaded.length === 1 && loaded[0] === m, `only ${m} loaded in VRAM (ps: ${loaded.join(",")})`);
}
const img = "data:image/png;base64," + fs.readFileSync(new URL("./fixtures/equation.png", import.meta.url)).toString("base64");
const v = await req("/api/solve", { equationText: "", imageBase64: img, model: q8 });
ok(v.s === 200 && v.j?.engine === `Ollama (${g12})` && /5/.test(String(v.j?.solution?.finalAnswer)), `photo with text-only ${q8} routed to vision ${g12}: [${v.j?.engine}] final=${v.j?.solution?.finalAnswer}`);
const v2 = await req("/api/chat", { message: "What shape and color is this?", imageBase64: "data:image/png;base64," + fs.readFileSync(new URL("./fixtures/red-circle.png", import.meta.url)).toString("base64"), model: g4 });
ok(v2.s === 200 && /red/i.test(v2.j?.chatReply?.replyText || ""), `photo with vision-capable ${g4} stays on it: [${v2.j?.engine}] ${String(v2.j?.chatReply?.replyText).slice(0, 80)}`);
const bad = await req("/api/chat", { message: "hi", model: "llama3.3:70b-not-allowed" });
ok(bad.j?.engine === `Ollama (${g12})`, `unlisted model name ignored -> default [${bad.j?.engine}]`);
const um = await req("/api/models");
ok(um.j?.models?.length === 3 && um.j.default === g12, `user list = allow list (${um.j?.models?.map((m) => m.name)})`);
// restore: default gemma3:12b loaded last
console.log(fails ? `${fails} failed` : "all model checks passed"); process.exit(fails ? 1 : 0);
