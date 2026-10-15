// Headless UI test: sign-in, 18+ gate, empty start screen (4 actions), admin GEV/guest codes, guest redemption, 390px width.
// usage: NODE_PATH=... node tests/ui-start.mjs <baseUrl>   env: UI_ADMIN_TOKEN, CHROME_PATH, SHOT_DIR
let pw; try { pw = await import("playwright"); } catch { pw = await import("playwright-core"); }
const { chromium } = pw;
const base = process.argv[2] || "http://127.0.0.1:3102";
const shot = (n) => (process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/${n}` : n);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"} ${m}`); };
const noOverflow = async (p, label) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); ok(w <= 390, `${label}: no horizontal overflow at 390px (scrollWidth ${w})`); };

async function enterCart(pg, id, introRe, shotName) {
  await pg.getByTestId("cart-grid").waitFor({ timeout: 15000 });
  await pg.getByTestId(`cart-${id}`).click();
  await pg.getByTestId("cart-intro").waitFor({ timeout: 5000 });
  await pg.waitForTimeout(400);
  const partial = await pg.getByTestId("intro-text").innerText();
  await pg.getByTestId("intro-begin").waitFor();
  await pg.waitForFunction(() => !document.querySelector("[data-testid=intro-text] .animate-pulse"), null, { timeout: 15000 });
  const full = await pg.getByTestId("intro-text").innerText();
  ok(introRe.test(full) && full.length > partial.length, `${id} intro types out (${full.split(/[.!?]/).filter((x) => x.trim()).length} sentences): "${full.slice(0, 70)}…"`);
  ok(await pg.getByTestId("sign-out").isVisible(), `Sign out securely on the ${id} intro`);
  if (shotName) await pg.screenshot({ path: shot(shotName) });
  await pg.getByTestId("intro-begin").click();
}
const admin = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await admin.newPage();
await p.goto(base, { waitUntil: "load" });
await p.getByTestId("login-gate").waitFor({ timeout: 10000 });
ok(true, "signed-out visitor sees the sign-in / guest code gate");
await noOverflow(p, "login gate");
await p.screenshot({ path: shot("ui-login-390.png") });
await p.getByText("Local sign-in (this computer only)").click();
await p.getByLabel("Local sign-in email").fill("hashflow67@gmail.com");
await p.getByLabel("Admin token").fill(process.env.UI_ADMIN_TOKEN || "");
await p.getByRole("button", { name: "Sign in" }).click();
await p.getByTestId("age-gate").or(p.getByTestId("cart-grid")).waitFor({ timeout: 10000 });
if (await p.getByTestId("age-gate").isVisible()) {
  ok(true, "18+ gate shown after sign-in");
  const cont = p.getByRole("button", { name: "Continue" });
  ok(await cont.isDisabled(), "Continue disabled until 18+ box is ticked");
  await p.screenshot({ path: shot("ui-age-390.png") });
  await p.getByLabel("I am 18 or older").check();
  await cont.click();
} else console.log("NOTE admin already confirmed 18+ earlier (server-side record); gate correctly skipped");
await p.getByTestId("cart-grid").waitFor({ timeout: 15000 });
ok(true, "cartridge grid is the first screen after sign-in + 18+");
ok(await p.getByTestId("sign-out").isVisible(), "Sign out securely on the cartridge screen");
ok((await p.locator("[data-testid^=cart-]:not([data-testid=cart-grid])").count()) === 7, "7 cartridges shown");
await noOverflow(p, "cartridge grid");
await p.screenshot({ path: shot("ui-carts-390.png"), fullPage: true });
await enterCart(p, "studybuddy-math", /tutor/i, "ui-intro-studybuddy-390.png");
const start = p.getByRole("dialog", { name: "What do you need help with?" });
await start.waitFor({ timeout: 15000 });
ok(true, "start screen: 'What do you need help with?'");
for (const name of ["Type a question", "Scan", "Upload file", "Take photo"]) ok(await start.getByRole("button", { name: new RegExp(`^${name}`) }).isVisible(), `start action visible: ${name}`);
const bodyText = await p.evaluate(() => document.body.innerText);
ok(!/2x\s*\+\s*y\s*=\s*10|2x² − 8x|x\^2|Photosynthesis|Printing Press|NOTEBOOK MATH SCAN|Math HW/i.test(bodyText), "no preloaded equations / demo passages anywhere on the page");
ok(!/Gemini|Grok|Gemma Edge|Neural Assist|Voice Tutor/i.test(bodyText), "no stale Gemini/Grok/Gemma Edge labels");
const cap = await p.locator('input[type=file][capture]').getAttribute("capture");
ok(cap === "environment", "Take photo uses camera capture (capture=environment)");
await noOverflow(p, "start screen");
await p.screenshot({ path: shot("ui-start-390.png") });
await start.getByRole("button", { name: /^Type a question/ }).click();
await p.waitForTimeout(500);
ok(!(await start.isVisible()), "start screen closes after choosing an action");
ok(await p.getByLabel("Chat with Study Buddy").isVisible(), "Type a question opens the chat input");
ok(await p.getByTestId("gev-button").isVisible(), "admin sees God's Eye View button");
ok((await p.getByTestId("gev-button").getAttribute("href")) === "https://gev.vicenvalor.com", "GEV link -> https://gev.vicenvalor.com");
await noOverflow(p, "main app");
await p.screenshot({ path: shot("ui-main-390.png") });
// create a guest code
await p.getByTestId("guest-codes-button").click();
await p.getByLabel("Guest email").fill("guest.ui@example.com");
await p.getByLabel("Expiry days").fill("3");
await p.getByRole("button", { name: "Create code" }).click();
const codeText = await p.getByTestId("new-code").locator("b").innerText({ timeout: 5000 });
ok(/^[2-9A-Z]{5}-[2-9A-Z]{5}$/.test(codeText), `admin created a guest code (${codeText.slice(0, 2)}…)`);
await p.screenshot({ path: shot("ui-guestcodes-390.png") });

// --- cartridges (admin) ---
await p.keyboard.press("Escape").catch(() => {});
await p.goto(base, { waitUntil: "load" });
await p.getByTestId("cart-grid").waitFor({ timeout: 10000 });
ok(true, "reload returns to the cartridge grid");
await enterCart(p, "studybuddy-math", /tutor|solve/i, null);
await p.getByRole("dialog", { name: "What do you need help with?" }).getByRole("button", { name: /^Type a question/ }).click();
ok(await p.getByTestId("sign-out").isVisible(), "Sign out securely in Study Buddy header");
await p.getByTestId("switch-cart").click();
await p.getByTestId("cart-grid").waitFor({ timeout: 5000 });
ok(true, "Study Buddy 'Switch cartridge' -> grid");
await enterCart(p, "tools", /tool/i, "ui-intro-tools-390.png");
await p.getByTestId("tools-mode").waitFor();
const nTools = await p.getByTestId("tool-link").count();
const href0 = await p.getByTestId("tool-link").first().getAttribute("href");
ok(nTools >= 100 && /^https:\/\/toolsontab\.com\/tools\//.test(href0), `Tools: ${nTools} tappable tools -> ${href0}`);
await noOverflow(p, "tools mode");
await p.screenshot({ path: shot("ui-tools-390.png") });
ok(await p.getByTestId("sign-out").isVisible(), "Sign out securely in Tools");
await p.getByLabel("Search tools").fill("pdf");
ok((await p.getByTestId("tool-link").count()) < nTools, "tool search filters");
await p.getByTestId("switch-cart").click();
await enterCart(p, "godseye", /monitor/i, "ui-intro-godseye-390.png");
ok((await p.getByTestId("gev-open").getAttribute("href")) === "https://gev.vicenvalor.com", "God's Eye cart opens https://gev.vicenvalor.com");
ok(await p.getByTestId("sign-out").isVisible(), "Sign out securely in God's Eye");
await p.screenshot({ path: shot("ui-godseye-390.png") });
await p.getByTestId("switch-cart").click();
const pageErrors = [];
p.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });
p.on("pageerror", (e) => pageErrors.push(String(e)));
await enterCart(p, "draftboard", /design|edit/i, "ui-intro-draftboard-390.png");
await p.getByTestId("draftboard-mode").waitFor();
const fr = p.frameLocator("iframe[title=Draftboard]");
let dbOk = false;
for (let i = 0; i < 30 && !dbOk; i++) { await p.waitForTimeout(1000); dbOk = (await fr.locator("canvas, [data-app-container] *").count().catch(() => 0)) > 5; }
const wasmErr = pageErrors.filter((e) => /wasm|Content Security|CSP|Refused/i.test(e));
ok(dbOk && wasmErr.length === 0, `Draftboard (Graphite WASM) loads inside the app; CSP/WASM errors: ${wasmErr.length}${wasmErr[0] ? " " + wasmErr[0].slice(0, 160) : ""}`);
await p.waitForTimeout(1500);
ok(await p.getByTestId("sign-out").isVisible(), "Sign out securely over Draftboard");
await p.screenshot({ path: shot("ui-draftboard-390.png") });
await p.getByTestId("switch-cart").click();
for (const id of ["imagegen", "customization", "ecommerce"]) {
  await p.getByTestId(`cart-${id}`).click();
  await p.getByTestId("cart-intro").waitFor();
  await p.getByTestId("cart-intro").click(); // skip typing
  ok(await p.getByTestId("intro-soon").isDisabled() && /soon|coming|workshop|on its way/i.test(await p.getByTestId("intro-text").innerText()), `${id}: coming-soon teaser, no Begin`);
  if (id === "imagegen") await p.screenshot({ path: shot("ui-intro-imagegen-390.png") });
  await p.getByTestId("intro-back").click();
  await p.getByTestId("cart-grid").waitFor();
}
// --- Sign out securely ---
const hdr = await p.request.get(base + "/api/me");
ok(/no-store/.test(hdr.headers()["cache-control"] || ""), `authenticated /api/me Cache-Control: ${hdr.headers()["cache-control"]}`);
const hdr2 = await p.request.get(base + "/");
ok(/no-store/.test(hdr2.headers()["cache-control"] || ""), `app HTML Cache-Control: ${hdr2.headers()["cache-control"]}`);
await p.getByTestId("sign-out").click();
await p.getByTestId("login-gate").waitFor({ timeout: 10000 });
ok(true, "Sign out securely -> back at the sign-in gate (local: redirect to /)");
const cks = (await p.context().cookies()).map((c) => c.name);
ok(!cks.includes("sb_session") && !cks.includes("CF_Authorization"), `session cookies gone (${cks.join(",") || "none"})`);
await p.goBack().catch(() => {});
await p.waitForTimeout(1200);
const backText = await p.evaluate(() => document.body.innerText);
ok(!/INSERT A CARTRIDGE|TOOLS \(|What do you need help with/.test(backText) && (await p.getByTestId("login-gate").count()) === 1, "Back button after sign-out shows no cached authenticated content");
ok((await p.request.get(base + "/draftboard/")).status() === 401, "/draftboard/ refused after sign-out");
await p.screenshot({ path: shot("ui-signed-out-390.png") });

// /draftboard is behind the same auth
const anon = await (await browser.newContext()).newPage();
const r1 = await anon.goto(base + "/draftboard/", { waitUntil: "load" });
ok(r1.status() === 401, `/draftboard/ without sign-in -> ${r1.status()}`);
await anon.close();

// guest flow in a fresh browser
const g = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await g.goto(base, { waitUntil: "load" });
await g.getByTestId("login-gate").waitFor();
await g.getByLabel("Email", { exact: true }).fill("someone.else@example.com");
await g.getByLabel("Guest code").fill(codeText);
await g.getByRole("button", { name: "Redeem code" }).click();
await g.getByRole("alert").waitFor({ timeout: 5000 });
ok(/isn't valid/.test(await g.getByRole("alert").innerText()), "guest code rejected for the wrong email");
await g.getByLabel("Email", { exact: true }).fill("guest.ui@example.com");
await g.getByRole("button", { name: "Redeem code" }).click();
await g.getByTestId("age-gate").waitFor({ timeout: 10000 });
ok(true, "guest redeemed code -> 18+ gate");
await g.getByLabel("I am 18 or older").check();
await g.getByRole("button", { name: "Continue" }).click();
await enterCart(g, "studybuddy-math", /tutor/i, null);
await g.getByRole("dialog", { name: "What do you need help with?" }).waitFor({ timeout: 10000 });
ok(true, "guest reaches start screen");
await g.getByRole("button", { name: /^Type a question/ }).click();
ok((await g.getByTestId("gev-button").count()) === 1 && (await g.getByTestId("guest-codes-button").count()) === 0, "redeemed guest sees God's Eye View but not guest admin");
await g.reload({ waitUntil: "load" });
await enterCart(g, "studybuddy-math", /tutor/i, null);
await g.getByRole("dialog", { name: "What do you need help with?" }).waitFor({ timeout: 10000 });
ok(true, "guest keeps access after reload (session)");
// re-using the code fails
const g2 = await (await browser.newContext()).newPage();
await g2.goto(base); await g2.getByTestId("login-gate").waitFor();
await g2.getByLabel("Email", { exact: true }).fill("guest.ui@example.com");
await g2.getByLabel("Guest code").fill(codeText);
await g2.getByRole("button", { name: "Redeem code" }).click();
await g2.getByRole("alert").waitFor({ timeout: 5000 });
ok(/already been used/.test(await g2.getByRole("alert").innerText()), "guest code is single-use");
await browser.close();
console.log(fails ? `${fails} UI checks failed` : "all UI checks passed"); process.exit(fails ? 1 : 0);
