// Real browser flow from the bug report: chat about the sky, then upload passage.txt via the chat's file button.
import { chromium } from "playwright";
const base = process.argv[2] || "http://127.0.0.1:3102";
const b = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const sent = [];
p.on("request", (r) => { if (r.url().endsWith("/api/chat")) sent.push(JSON.parse(r.postData() || "{}")); });
await p.goto(base); await p.waitForTimeout(800);
await p.getByText("Skip", { exact: true }).click();
const box = p.getByPlaceholder("Ask anything, introduce yourself, or analyze text...");
await box.fill("Why is the sky blue?"); await box.press("Enter");
await p.waitForResponse((r) => r.url().endsWith("/api/chat"), { timeout: 120000 });
await p.waitForTimeout(1000);
const fileInput = p.locator('input[type=file][accept="image/*,.txt,.pdf"]');
const n = await fileInput.count();
// pick the chat view's input (the one whose parent form contains the chat placeholder)
const chatInput = p.locator('input[type=file]').filter({ has: p.locator("xpath=.") });
const resp = p.waitForResponse((r) => r.url().endsWith("/api/chat"), { timeout: 180000 });
let used = false;
for (let i = 0; i < n && !used; i++) {
  const before = sent.length;
  await fileInput.nth(i).setInputFiles(new URL("./fixtures/passage.txt", import.meta.url).pathname);
  await p.waitForTimeout(500);
  used = sent.length > before;
}
const r = await resp; const j = await r.json();
await p.waitForTimeout(1500);
const last = sent[sent.length - 1];
const card = JSON.stringify(j.chatReply?.readingAnalysis || {});
const onScreen = await p.evaluate(() => document.body.innerText);
const ok = /water|evaporat|condens|precipit/i.test(card + j.chatReply?.replyText) && !/rayleigh|scatter/i.test(card);
console.log(`${ok ? "PASS" : "FAIL"} UI chat-then-upload`);
console.log("  request: imageBase64 starts", String(last.imageBase64).slice(0, 30), "| history sender/text only:", last.history?.every((h) => Object.keys(h).sort().join() === "sender,text"));
console.log("  reply:", j.chatReply?.replyText?.slice(0, 200));
console.log("  card:", card.slice(0, 300));
console.log("  water-cycle text on screen:", /water cycle/i.test(onScreen));
await p.screenshot({ path: (process.env.SHOT_DIR || ".") + "/ui-upload.png" }); await b.close(); process.exit(ok ? 0 : 1);
