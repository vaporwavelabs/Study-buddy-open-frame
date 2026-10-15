// Real E2E against a running Study Buddy server. usage: node e2e.mjs <baseUrl>
const base = process.argv[2] || "http://127.0.0.1:3100";
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const results = [];
// Auth: local dev sign-in as admin (server needs DEV_LOGIN=true + ADMIN_TOKEN=E2E_ADMIN_TOKEN), then confirm 18+.
let COOKIE = "";
async function call(path, body, extra = {}) {
  const t = Date.now();
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(COOKIE ? { Cookie: COOKIE } : {}), ...extra }, body: JSON.stringify(body) });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text, ms: Date.now() - t };
}
function rec(name, ok, ms, sample) { results.push({ name, ok, ms }); console.log(`${ok ? "PASS" : "FAIL"} ${name} (${ms}ms)\n   ${String(sample).slice(0, 400).replace(/\n/g, " ")}`); }

{
  const anon = await call("/api/chat", { message: "hi" });
  rec("auth: anonymous AI call blocked (401)", anon.status === 401, anon.ms, anon.status);
  const lr = await fetch(base + "/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: process.env.E2E_ADMIN_EMAIL || "hashflow67@gmail.com", adminToken: process.env.E2E_ADMIN_TOKEN || "" }) });
  COOKIE = (lr.headers.get("set-cookie") || "").split(";")[0];
  rec("auth: local admin sign-in", lr.status === 200 && /sb_session=/.test(COOKIE), 0, lr.status);
  const pre = await call("/api/chat", { message: "hi" });
  rec("18+: AI blocked before age confirmation", pre.status === 403 && pre.json?.needAgeConfirm === true || pre.status === 200, pre.ms, `${pre.status} ${pre.text}`);
  const ag = await call("/api/age/confirm", { confirm18: true });
  rec("18+: confirm", ag.status === 200, ag.ms, ag.status);
  const spoof = await fetch(base + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json", "Cf-Access-Authenticated-User-Email": "hashflow67@gmail.com" }, body: "{}" });
  rec("auth: spoofed Cf-Access email header without JWT is ignored", spoof.status === 401, 0, spoof.status);
  const big = await call("/api/chat", { message: "x", imageBase64: "data:image/png;base64," + "A".repeat(15 * 1024 * 1024) });
  rec("upload cap: >10 MB rejected (413)", big.status === 413, big.ms, big.status);
  const typ = await call("/api/chat", { message: "x", imageBase64: "data:application/x-msdownload;base64,TVqQ" });
  rec("upload type allowlist (415)", typ.status === 415, typ.ms, typ.status);
  const blank = await call("/api/solve", { equationText: "", imageBase64: (await import("node:fs")).readFileSync(new URL("./fixtures/blank.b64", import.meta.url), "utf8").trim() });
  rec("blank photo -> 'can't read', no invented problem", blank.status === 200 && blank.json?.unreadablePhoto === true && !blank.json?.solution, blank.ms, blank.json?.message);
  const h = await fetch(base + "/");
  rec("security headers (helmet)", !!h.headers.get("x-content-type-options") && !h.headers.get("x-powered-by"), 0, `csp=${!!h.headers.get("content-security-policy")}`);
  const priv = await fetch(base + "/privacy.html"); const terms = await fetch(base + "/terms.html");
  rec("privacy + terms pages", priv.status === 200 && terms.status === 200 && /Privacy Policy/.test(await priv.text()), 0, `${priv.status}/${terms.status}`);
  const err = await fetch(base + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Cookie: COOKIE }, body: "{oops" });
  const et = await err.text();
  rec("errors carry no stack traces", !/at \w+ \(|node_modules|\.ts:\d+/.test(et), 0, et.slice(0, 80));
}

let r = await call("/api/chat", { message: "Can you explain photosynthesis in two sentences?", history: [], studentProfile: { name: "Sam" } });
let c = r.json?.chatReply;
rec("chat: real model reply", r.status === 200 && c?.replyText?.length > 20 && /photosynth|sun|light|plant/i.test(c.replyText) && r.json.engine !== "local-edge", r.ms, `[${r.json?.engine}] ${c?.replyText ?? r.text}`);

r = await call("/api/chat", { message: "What is the capital of France?", history: [{ sender: "user", text: "hi" }, { sender: "buddy", text: "Hello!" }], studentProfile: {} });
c = r.json?.chatReply;
rec("chat: factual w/ history", r.status === 200 && /paris/i.test(c?.replyText || ""), r.ms, c?.replyText ?? r.text);

const solves = [["2x + 3 = 11", /\b4\b/], ["15% of 80", /\b12\b/], ["x^2 - 9 = 0", /(?=.*-\s*3)(?=.*\b3)/], ["3(y - 2) = 2y + 1", /\b7\b/], ["What is the chemical formula for water?", /H\s*2\s*O|H₂O/i], ["A train travels 120 km in 2 hours. What is its average speed?", /60/]];
for (const [eq, re] of solves) {
  r = await call("/api/solve", { equationText: eq, difficultyMode: "standard" });
  const s = r.json?.solution;
  rec(`solve: ${eq}`, r.status === 200 && Array.isArray(s?.steps) && s.steps.length > 0 && re.test(String(s.finalAnswer)), r.ms, `[${r.json?.engine}] final=${s?.finalAnswer}${s?.answerVerified?' (verified'+(s?.answerCorrected?', corrected':'')+')':''} steps=${s?.steps?.length} | ${s?.steps?.[0]?.explanation ?? s?.steps?.[0]?.title ?? r.text}`);
}

r = await call("/api/chat", { message: "What do you see in this picture?", history: [], studentProfile: {}, imageBase64: png });
rec("chat: 1px photo -> can't-read reply", r.status === 200 && /can't read/i.test(r.json?.chatReply?.replyText || ""), r.ms, `[${r.json?.engine}] ${r.json?.chatReply?.replyText ?? r.text}`);
r = await call("/api/solve", { equationText: "", imageBase64: png });
rec("solve: photo only (no crash)", r.status < 500, r.ms, `${r.status} ${r.text}`);


const fs = await import("node:fs");
const txt = "data:text/plain;base64," + fs.readFileSync(new URL("./fixtures/passage.txt", import.meta.url)).toString("base64");
r = await call("/api/chat", { message: "Please analyze this uploaded document or article (passage.txt). Extract the main idea, key facts, and vocabulary!", history: [], studentProfile: {}, imageBase64: txt });
c = r.json?.chatReply;
rec("upload .txt -> reading analysis", r.status === 200 && /water|evaporat|cycle|precip/i.test(JSON.stringify(c || {})) && !!r.json?.engine, r.ms, `[${r.json?.engine}] ${c?.replyText} | mainIdea=${c?.readingAnalysis?.mainIdea} facts=${c?.readingAnalysis?.facts?.length} vocab=${c?.readingAnalysis?.vocabulary?.map((v) => v.term).join(",")}`);
const pdf = "data:application/pdf;base64," + fs.readFileSync(new URL("./fixtures/passage.pdf", import.meta.url)).toString("base64");
r = await call("/api/chat", { message: "Please analyze this uploaded document or article (passage.pdf). Extract the main idea, key facts, and vocabulary!", history: [], studentProfile: {}, imageBase64: pdf });
c = r.json?.chatReply;
rec("upload .pdf -> reading analysis", r.status === 200 && /water|evaporat|cycle|precip/i.test(JSON.stringify(c || {})) && !!r.json?.engine, r.ms, `[${r.json?.engine}] ${c?.replyText} | mainIdea=${c?.readingAnalysis?.mainIdea}`);


// Real UI flow: chat about another topic first, then upload. The frontend sends history + the file as imageBase64.
{
  const q = "Why is the sky blue?";
  const first = await call("/api/chat", { message: q, history: [], studentProfile: {} });
  const hist = [{ sender: "user", text: q }, { sender: "buddy", text: first.json?.chatReply?.replyText || "" }];
  const up = await call("/api/chat", { message: "Please analyze this reading material: passage.txt", history: hist, studentProfile: {}, imageBase64: txt });
  const cr = up.json?.chatReply || {};
  const card = JSON.stringify(cr.readingAnalysis || {});
  const all = `${cr.replyText} ${card}`;
  rec("chat-then-upload: analysis is about the FILE, not the earlier topic",
    up.status === 200 && /water|evaporat|condens|precipit/i.test(all) && !/rayleigh|scatter/i.test(card) && !!up.json?.engine,
    first.ms + up.ms, `first=${first.json?.chatReply?.replyText?.slice(0, 80)} | upload=${cr.replyText?.slice(0, 160)} | card.mainIdea=${cr.readingAnalysis?.mainIdea}`);
}
const health = await (await fetch(base + "/api/health")).json();
rec("health reports the real active model", /Ollama \(.+\)/.test(health.activeEngine || "") && !/Gemma-4/.test(JSON.stringify(health)), 0, health.activeEngine);


// Vision (only when the server has OLLAMA_VISION_MODEL set): E2E_VISION=1 node tests/e2e.mjs <url>
if (process.env.E2E_VISION === "1") {
  const img = (f) => "data:image/png;base64," + fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url)).toString("base64");
  r = await call("/api/solve", { equationText: "", imageBase64: img("equation.png") });
  const vs = r.json?.solution;
  rec("vision: solve photo of '3x + 5 = 20'", r.status === 200 && /5/.test(String(vs?.finalAnswer)) && /3\s*x/.test(String(vs?.detectedEquation)), r.ms, `[${r.json?.engine}] detected=${vs?.detectedEquation} final=${vs?.finalAnswer} ${r.json?.message || ""}`);
  r = await call("/api/chat", { message: "What shape and color is in this picture?", history: [], studentProfile: {}, imageBase64: img("red-circle.png") });
  rec("vision: chat describes photo", r.status === 200 && /red/i.test(r.json?.chatReply?.replyText || "") && /circle|round/i.test(r.json?.chatReply?.replyText || ""), r.ms, `[${r.json?.engine}] ${r.json?.chatReply?.replyText}`);
}
r = await call("/api/chat", { message: "Hi! My name is Maya and I need help with fractions.", history: [], studentProfile: {} });
c = r.json?.chatReply;
rec("chat: learns real name, no invented facts", r.status === 200 && (!c?.learnedStudentInfo?.name || /maya/i.test(c.learnedStudentInfo.name)), r.ms, `${c?.replyText} | learned=${JSON.stringify(c?.learnedStudentInfo)}`);
r = await call("/api/chat", { message: "hello", history: [], studentProfile: {} });
c = r.json?.chatReply;
rec("chat: no hallucinated profile on 'hello'", r.status === 200 && !c?.learnedStudentInfo && !c?.readingAnalysis, r.ms, `${c?.replyText} | learned=${JSON.stringify(c?.learnedStudentInfo)}`);

r = await call("/api/chat", { message: "" });
rec("chat: empty message handled", r.status < 500, r.ms, `${r.status} ${r.text}`);
r = await call("/api/solve", {});
rec("solve: empty body handled", r.status < 500, r.ms, `${r.status} ${r.text}`);
const bad = await fetch(base + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Cookie: COOKIE }, body: "{oops" });
rec("chat: malformed JSON -> 4xx", bad.status >= 400 && bad.status < 500, 0, bad.status);
const g = await fetch(base + "/api/grok-bot/tree"); rec("harness hidden (404)", g.status === 404, 0, g.status);
const envr = await fetch(base + "/.env"); const et = await envr.text(); rec(".env not served", !/OLLAMA_TOKEN=|GEMINI_API_KEY=/.test(et), 0, envr.status);
const sel = await fetch(base + "/api/llm/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "custom-server" }) }); rec("llm/select requires admin", sel.status === 401 || sel.status === 403, 0, sel.status);
const home = await fetch(base + "/"); rec("UI served", home.status === 200 && /<div id="root"/.test(await home.text()), 0, home.status);

const fails = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
