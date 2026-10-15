import { test } from "node:test";
import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import { AccessStore } from "../server/accessStore.ts";
import { registerAuth, makeSessionValue, readSessionValue, addEmailToCfAccessPolicy } from "../server/auth.ts";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sbacc-")), "access.json");

test("guest code: hash only, single use, email must match", () => {
  const f = tmp(); const s = new AccessStore(f);
  const { code, record } = s.createGuestCode("Guest@Example.com", null);
  assert.match(code, /^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
  const raw = fs.readFileSync(f, "utf8");
  assert.ok(!raw.includes(code) && !raw.includes(code.replace("-", "")), "plain code never stored");
  assert.equal(record.email, "guest@example.com");
  assert.equal(s.redeemGuestCode("other@example.com", code).ok, false, "wrong email rejected");
  assert.equal(s.isAllowed("guest@example.com"), false);
  assert.equal(s.redeemGuestCode("guest@example.com", code.toLowerCase().replace("-", " ")).ok, true, "case/format-insensitive");
  assert.equal(s.isAllowed("guest@example.com"), true, "ongoing access");
  assert.equal(s.redeemGuestCode("guest@example.com", code).ok, false, "not reusable");
  assert.ok(new AccessStore(f).isAllowed("guest@example.com"), "persisted");
});

test("guest code: expiry, revoke, list", () => {
  const s = new AccessStore(tmp());
  assert.throws(() => s.createGuestCode("x@y.com", new Date(Date.now() - 1000)));
  assert.throws(() => s.createGuestCode("not-an-email", null));
  const a = s.createGuestCode("a@y.com", new Date(Date.now() + 60_000));
  const b = s.createGuestCode("b@y.com", null);
  assert.ok(s.revokeGuestCode(b.record.id));
  assert.equal(s.redeemGuestCode("b@y.com", b.code).ok, false, "revoked");
  const list = s.listGuestCodes();
  assert.equal(list.length, 2);
  assert.ok(list.every((c) => !("hash" in c)), "list hides hashes");
  assert.equal(list.find((c) => c.id === b.record.id)!.status, "revoked");
  assert.ok(s.redeemGuestCode("a@y.com", a.code).ok);
  assert.ok(s.revokeGuestCode(a.record.id) && !s.isAllowed("a@y.com"), "revoking a redeemed code removes access");
});

test("session cookie signing", () => {
  const v = makeSessionValue("k".repeat(40), "A@b.com");
  assert.equal(readSessionValue("k".repeat(40), v), "a@b.com");
  assert.equal(readSessionValue("j".repeat(40), v), null);
  assert.equal(readSessionValue("k".repeat(40), v.slice(0, -2) + "xx"), null);
  assert.equal(readSessionValue("k".repeat(40), makeSessionValue("k".repeat(40), "a@b.com", Date.now() - 400 * 86400_000)), null, "expired");
});

test("CF Access policy update: skipped without config, appends email with config", async () => {
  for (const k of ["CF_API_TOKEN", "CF_ACCOUNT_ID", "CF_ACCESS_APP_ID", "CF_ACCESS_POLICY_ID"]) delete process.env[k];
  assert.equal((await addEmailToCfAccessPolicy("g@x.com")).skipped, true);
  Object.assign(process.env, { CF_API_TOKEN: "t", CF_ACCOUNT_ID: "a", GEV_ACCESS_APP_ID: "p", GEV_ACCESS_POLICY_ID: "q" });
  let put: any = null;
  const fake = (async (_u: string, init?: RequestInit) => {
    if (init?.method === "PUT") { put = JSON.parse(String(init.body)); return new Response(JSON.stringify({ success: true }), { status: 200 }); }
    return new Response(JSON.stringify({ success: true, result: { name: "Allow", decision: "allow", include: [{ email: { email: "hashflow67@gmail.com" } }] } }), { status: 200 });
  }) as typeof fetch;
  assert.ok((await addEmailToCfAccessPolicy("G@x.com", fake)).ok);
  assert.deepEqual(put.include, [{ email: { email: "hashflow67@gmail.com" } }, { email: { email: "g@x.com" } }]);
  const { removeEmailFromCfAccessPolicy } = await import("../server/auth.ts");
  const withG = (async (_u: string, init?: RequestInit) => {
    if (init?.method === "PUT") { put = JSON.parse(String(init.body)); return new Response(JSON.stringify({ success: true }), { status: 200 }); }
    return new Response(JSON.stringify({ success: true, result: { name: "Allow", decision: "allow", include: [{ email: { email: "hashflow67@gmail.com" } }, { email: { email: "g@x.com" } }] } }), { status: 200 });
  }) as typeof fetch;
  put = null;
  assert.ok((await removeEmailFromCfAccessPolicy("G@X.com", withG)).ok);
  assert.deepEqual(put.include, [{ email: { email: "hashflow67@gmail.com" } }], "remove keeps admin");
  put = null;
  assert.equal((await removeEmailFromCfAccessPolicy("hashflow67@gmail.com", withG)).ok, false, "never removes admin");
  assert.equal(put, null);
  for (const k of ["CF_API_TOKEN", "CF_ACCOUNT_ID", "GEV_ACCESS_APP_ID", "GEV_ACCESS_POLICY_ID"]) delete process.env[k];
});

async function startApp() {
  process.env.DEV_LOGIN = "true"; process.env.ADMIN_TOKEN = "admin-token-1234567890"; process.env.TRUST_CF_ACCESS_HEADER = "true";
  const store = new AccessStore(tmp());
  const app = express(); app.use(express.json());
  let n = 0;
  const lim = (_q: any, r: any, nx: any) => (++n > 5 ? r.status(429).json({ error: "slow" }) : nx());
  const { requireUserAndAge } = registerAuth(app, store, lim);
  app.post("/api/chat", requireUserAndAge, (_q, r) => r.json({ ok: true }));
  const srv = app.listen(0, "127.0.0.1");
  await new Promise((r) => srv.once("listening", r));
  const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const call = async (p: string, body?: unknown, h: Record<string, string> = {}) => {
    const r = await fetch(base + p, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...h }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null), cookie: r.headers.get("set-cookie") || "" };
  };
  return { srv, call };
}

test("HTTP: gate, 18+, admin-only codes, redemption, rate limit", async () => {
  const { srv, call } = await startApp();
  try {
    assert.equal((await call("/api/chat", {})).status, 401, "anonymous blocked");
    const admin = { "Cf-Access-Authenticated-User-Email": "hashflow67@gmail.com" };
    const guestH = { "Cf-Access-Authenticated-User-Email": "guest@ex.com" };
    let r = await call("/api/chat", {}, admin);
    assert.equal(r.status, 403); assert.equal(r.json.needAgeConfirm, true, "18+ enforced server-side");
    assert.equal((await call("/api/age/confirm", { confirm18: false }, admin)).status, 400);
    assert.equal((await call("/api/age/confirm", { confirm18: true }, admin)).status, 200);
    assert.equal((await call("/api/chat", {}, admin)).status, 200);
    r = await call("/api/me", undefined, admin); assert.ok(r.json.isAdmin && r.json.gevUrl, "admin sees GEV url");
    r = await call("/api/me", undefined, guestH); assert.ok(!r.json.isAdmin && !r.json.gevUrl && !r.json.hasAccess, "un-redeemed guest sees no GEV");
    assert.ok(!(await call("/api/me")).json.gevUrl, "anonymous sees no GEV");
    assert.equal((await call("/api/admin/guest-codes", { email: "guest@ex.com" }, guestH)).status, 403, "non-admin can't create");
    assert.equal((await call("/api/admin/guest-codes", undefined, guestH)).status, 403, "non-admin can't list");
    r = await call("/api/admin/guest-codes", { email: "guest@ex.com", expiresInDays: 7 }, admin);
    assert.equal(r.status, 201); const code = r.json.code;
    assert.equal((await call("/api/chat", {}, guestH)).status, 403);
    assert.equal((await call("/api/guest/redeem", { code }, { "Cf-Access-Authenticated-User-Email": "evil@ex.com" })).status, 400, "identity must match code email");
    r = await call("/api/guest/redeem", { code }, guestH); assert.equal(r.status, 200);
    assert.equal((await call("/api/guest/redeem", { code }, guestH)).status, 400, "single use");
    r = await call("/api/chat", {}, guestH); assert.equal(r.json.needAgeConfirm, true);
    await call("/api/age/confirm", { confirm18: true }, guestH);
    assert.equal((await call("/api/chat", {}, guestH)).status, 200, "guest ongoing access");
    assert.ok((await call("/api/me", undefined, guestH)).json.gevUrl, "redeemed guest gets GEV link");
    const tries = [];
    for (let i = 0; i < 4; i++) tries.push((await call("/api/guest/redeem", { code: "WRONG-GUESS", email: "a@b.com" })).status);
    assert.equal(tries.at(-1), 429, `redeem rate-limited (${tries})`);
    // dev-login: not through the tunnel, admin needs token
    assert.equal((await call("/api/auth/dev-login", { email: "hashflow67@gmail.com", adminToken: "admin-token-1234567890" }, { "Cf-Connecting-Ip": "1.2.3.4" })).status, 404);
    assert.equal((await call("/api/auth/dev-login", { email: "hashflow67@gmail.com" })).status, 401);
    r = await call("/api/auth/dev-login", { email: "hashflow67@gmail.com", adminToken: "admin-token-1234567890" });
    assert.equal(r.status, 200); assert.match(r.cookie, /sb_session=.*HttpOnly/);
    const ck = r.cookie.split(";")[0];
    process.env.TRUST_CF_ACCESS_HEADER = "false";
    assert.equal((await call("/api/chat", {}, admin)).status, 401, "spoofed header ignored when not trusted");
    assert.equal((await call("/api/chat", {}, { Cookie: ck })).status, 200, "session works");
  } finally { srv.close(); for (const k of ["DEV_LOGIN", "ADMIN_TOKEN", "TRUST_CF_ACCESS_HEADER"]) delete process.env[k]; }
});

test("Cloudflare Access JWT: valid signed token -> admin; wrong aud/expired/forged rejected; cookie fallback", async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import("jose");
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const certs = express(); certs.get("/certs", (_q, r) => r.json({ keys: [jwk] }));
  const cs = certs.listen(0, "127.0.0.1"); await new Promise((r) => cs.once("listening", r));
  const team = "team-test.cloudflareaccess.com", aud = "a".repeat(64);
  Object.assign(process.env, { CF_ACCESS_TEAM_DOMAIN: team, CF_ACCESS_AUD: aud, CF_ACCESS_CERTS_URL: `http://127.0.0.1:${(cs.address() as any).port}/certs`, TRUST_CF_ACCESS_HEADER: "false" });
  const sign = (o: { aud?: string; exp?: string; key?: any; email?: string } = {}) =>
    new SignJWT({ email: o.email || "HashFlow67@Gmail.com" }).setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(`https://${team}`).setAudience(o.aud || aud).setIssuedAt().setExpirationTime(o.exp || "10m").sign(o.key || privateKey);
  const { srv, call } = await startApp();
  process.env.TRUST_CF_ACCESS_HEADER = "false";
  try {
    let r = await call("/api/me", undefined, { "Cf-Access-Jwt-Assertion": await sign(), "Cf-Connecting-Ip": "1.2.3.4" });
    assert.equal(r.json.email, "hashflow67@gmail.com", "email normalized");
    assert.equal(r.json.isAdmin, true); assert.equal(r.json.hasAccess, true);
    assert.equal(r.json.devLogin, false, "local sign-in hidden for tunnel requests");
    r = await call("/api/me", undefined, { Cookie: `CF_Authorization=${await sign()}` });
    assert.equal(r.json.isAdmin, true, "CF_Authorization cookie fallback");
    for (const [label, tok] of [["wrong aud", await sign({ aud: "b".repeat(64) })], ["expired", await sign({ exp: "-1m" })], ["forged key", await sign({ key: other.privateKey })]] as const) {
      r = await call("/api/me", undefined, { "Cf-Access-Jwt-Assertion": tok, "Cf-Access-Authenticated-User-Email": "hashflow67@gmail.com" });
      assert.equal(r.json.email, null, label);
    }
    r = await call("/api/me", undefined, { "Cf-Access-Jwt-Assertion": await sign({ email: "stranger@x.com" }) });
    assert.ok(r.json.email === "stranger@x.com" && !r.json.hasAccess && !r.json.isAdmin, "unknown email -> needs invite code");
    r = await call("/api/me");
    assert.equal(r.json.devLogin, true, "local sign-in still offered on direct localhost");
  } finally {
    srv.close(); cs.close();
    for (const k of ["CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD", "CF_ACCESS_CERTS_URL", "DEV_LOGIN", "ADMIN_TOKEN", "TRUST_CF_ACCESS_HEADER"]) delete process.env[k];
  }
});

test("Sign out securely: 303 to Access logout via tunnel, clears cookies + site data, revokes session and older JWTs", async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import("jose");
  const { initLogoutStore } = await import("../server/auth.ts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sblo-")); initLogoutStore(dir);
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  const certs = express(); certs.get("/certs", (_q, r) => r.json({ keys: [jwk] }));
  const cs = certs.listen(0, "127.0.0.1"); await new Promise((r) => cs.once("listening", r));
  const team = "team-logout.cloudflareaccess.com", aud = "c".repeat(64);
  Object.assign(process.env, { CF_ACCESS_TEAM_DOMAIN: team, CF_ACCESS_AUD: aud, CF_ACCESS_CERTS_URL: `http://127.0.0.1:${(cs.address() as any).port}/certs` });
  const jwt = (iatSec: number) => new SignJWT({ email: "hashflow67@gmail.com" }).setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(`https://${team}`).setAudience(aud).setIssuedAt(iatSec).setExpirationTime(iatSec + 600).sign(privateKey);
  const { srv } = await startApp();
  process.env.TRUST_CF_ACCESS_HEADER = "false";
  const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  try {
    const now = Math.floor(Date.now() / 1000);
    const old = await jwt(now - 5);
    const tunnel = { "Cf-Access-Jwt-Assertion": old, "Cf-Connecting-Ip": "1.2.3.4", "X-Forwarded-Proto": "https" };
    let r = await fetch(base + "/api/me", { headers: tunnel });
    assert.equal((await r.json()).isAdmin, true, "signed in via Access before logout");
    // local dev session too
    const dl = await fetch(base + "/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "hashflow67@gmail.com", adminToken: "admin-token-1234567890" }) });
    const sess = (dl.headers.get("set-cookie") || "").split(";")[0];
    r = await fetch(base + "/api/auth/logout", { method: "POST", headers: tunnel, redirect: "manual" });
    assert.equal(r.status, 303); assert.equal(r.headers.get("location"), `https://${team}/cdn-cgi/access/logout`, "hands off to Cloudflare Access team logout");
    const sc = r.headers.getSetCookie();
    assert.ok(sc.some((c) => /^sb_session=;.*Max-Age=0.*Secure/.test(c)), "app session cookie cleared");
    assert.ok(!sc.some((c) => /^CF_Authorization=/.test(c)), "CF_Authorization left for Access logout to consume");
    assert.match(r.headers.get("clear-site-data") || "", /"cache".*"storage"/);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal((await (await fetch(base + "/api/me", { headers: tunnel })).json()).email, null, "pre-logout Access JWT replay refused");
    assert.equal((await (await fetch(base + "/api/me", { headers: { Cookie: sess } })).json()).email, null, "pre-logout app session replay refused");
    assert.equal((await fetch(base + "/api/chat", { method: "POST", headers: { Cookie: sess, "Content-Type": "application/json" }, body: "{}" })).status, 401);
    const fresh = await jwt(now + 2);
    assert.equal((await (await fetch(base + "/api/me", { headers: { "Cf-Access-Jwt-Assertion": fresh } })).json()).isAdmin, true, "new sign-in after logout works");
    initLogoutStore(dir);
    assert.equal((await (await fetch(base + "/api/me", { headers: tunnel })).json()).email, null, "revocation survives restart");
    // direct localhost (no proxy, no CF config) goes back to the app's sign-in gate
    for (const k of ["CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD"]) delete process.env[k];
    r = await fetch(base + "/api/auth/logout", { method: "POST", redirect: "manual" });
    assert.equal(r.headers.get("location"), "/");
    r = await fetch(base + "/api/auth/logout", { redirect: "manual" });
    assert.ok(r.status === 404 || r.status === 405, `GET logout is not a sign-out (${r.status})`);
  } finally {
    srv.close(); cs.close();
    for (const k of ["CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD", "CF_ACCESS_CERTS_URL", "DEV_LOGIN", "ADMIN_TOKEN", "TRUST_CF_ACCESS_HEADER"]) delete process.env[k];
  }
});
