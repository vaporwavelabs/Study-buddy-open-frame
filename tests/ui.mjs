import { chromium } from "playwright";
const base = process.argv[2] || "http://127.0.0.1:3102";
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
// 390px phone
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const t = Date.now(); await page.goto(base, { waitUntil: "load", timeout: 20000 }); const loadMs = Date.now() - t;
ok(loadMs < 5000, `first load ${loadMs}ms`);
ok((await page.title()) === "Study Buddy — Step-by-Step Homework Helper", `title: ${await page.title()}`);
await page.waitForTimeout(1500);
const scan = page.getByRole("button", { name: "Scan Material" });
const box = await scan.boundingBox();
ok(box && box.x >= 0 && box.x + box.width <= 390, `Scan button inside 390px viewport: ${JSON.stringify(box)}`);
const docW = await page.evaluate(() => document.documentElement.scrollWidth);
ok(docW <= 390, `no horizontal overflow (scrollWidth ${docW})`);
await page.screenshot({ path: "ui-390.png".replace(/^/, process.env.SHOT_DIR ? process.env.SHOT_DIR + "/" : "") });
const html = await page.content();
ok(!/Gemma 4 Edge|Gemma Edge|Voice Tutor|LOCAL EDGE COMPUTE/.test(html), "no stale 'Gemma 4 Edge'/'Voice Tutor' labels in page");
await page.waitForFunction(() => document.body.innerText.includes("qwen2.5:1.5b") || document.body.innerText.includes("gemma3:1b"), null, { timeout: 5000 }).then(() => ok(true, "header shows real model"), () => ok(false, "header shows real model"));
// intro overlay: present at first, dismiss, then solve -> must not come back
ok(await page.getByText("HELLO FROM STUDY BUDDY!").isVisible(), "intro shows on first visit");
await page.getByText("Skip", { exact: true }).click();
await page.reload({ waitUntil: "load" }); await page.waitForTimeout(800);
ok(!(await page.getByText("HELLO FROM STUDY BUDDY!").isVisible()), "intro not shown again after reload");
// fresh profile: never dismissed, but solving must hide it
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p2 = await ctx2.newPage();
await p2.goto(base, { waitUntil: "load" }); await p2.waitForTimeout(800);

ok(await p2.getByText("HELLO FROM STUDY BUDDY!").isVisible(), "fresh visitor: intro still showing before solve (repro precondition)");
const solveBtn = p2.getByText("2x + y = 10", { exact: true });
if (await solveBtn.count()) {
  await solveBtn.first().click(); await p2.waitForTimeout(1500);
  ok(!(await p2.getByText("HELLO FROM STUDY BUDDY!").isVisible()), "intro hidden once solving starts");
  await p2.waitForTimeout(30000);
  const txt = await p2.evaluate(() => document.body.innerText);
  ok(!/HELLO FROM STUDY BUDDY!/.test(txt) && /step/i.test(txt), "after solve: step panel visible, intro did not return");
} else console.log("SKIP solve button not on initial screen");
await p2.screenshot({ path: "ui-desktop.png".replace(/^/, process.env.SHOT_DIR ? process.env.SHOT_DIR + "/" : "") });
await browser.close(); console.log(fails ? `${fails} failed` : "all UI checks passed"); process.exit(fails ? 1 : 0);
