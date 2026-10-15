import fs from "fs";
import path from "path";
/**
 * Identity + authorization for Study Buddy.
 *  1. Cloudflare Access: if CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set, the Cf-Access-Jwt-Assertion header is
 *     verified against https://<team>/cdn-cgi/access/certs (signature, aud, iss, exp) and its email is used.
 *     Without that config, Cf-Access-Authenticated-User-Email is trusted only if TRUST_CF_ACCESS_HEADER=true
 *     (safe only while the app listens on 127.0.0.1 behind cloudflared).
 *  2. App session cookie (sb_session, HMAC-signed): issued by guest-code redemption and, for local dev only,
 *     by /api/auth/dev-login (DEV_LOGIN=true, loopback, not via the tunnel).
 * Access = admin (ADMIN_EMAIL, default hashflow67@gmail.com) or an email in the app-side allow list.
 */
import type express from "express";
import { adminTokenMatches } from "./adminToken.js";
import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AccessStore, normEmail, isEmail } from "./accessStore.js";

export const adminEmail = () => normEmail(process.env.ADMIN_EMAIL || "hashflow67@gmail.com");
export const gevUrl = () => process.env.GEV_URL || "https://gev.vicenvalor.com";

export type Identity = { email: string; source: "cf-access-jwt" | "cf-access-header" | "session" };
export type ReqWithUser = express.Request & { identity?: Identity | null };

const SESSION_COOKIE = "sb_session";

/** Sign-out record per email (ms). Any app session or Access JWT issued before it is refused, so a copied
 *  cookie stops working after "Sign out securely". Persisted to DATA_DIR/logouts.json. */
let logoutFile = "";
const loggedOutAt = new Map<string, number>();
export function initLogoutStore(dataDir: string) {
  logoutFile = path.join(dataDir, "logouts.json");
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(logoutFile, "utf8")))) loggedOutAt.set(k, Number(v)); } catch { /* none yet */ }
}
export function recordLogout(email: string, now = Date.now()) {
  loggedOutAt.set(normEmail(email), now);
  if (logoutFile) { try { fs.writeFileSync(logoutFile, JSON.stringify(Object.fromEntries(loggedOutAt)), { mode: 0o600 }); } catch (e) { console.warn("Could not save logout record:", e instanceof Error ? e.message : e); } }
}
const revokedBefore = (email: string, issuedMs: number) => issuedMs <= (loggedOutAt.get(normEmail(email)) || 0);
const SESSION_DAYS = () => Number(process.env.SESSION_DAYS) > 0 ? Number(process.env.SESSION_DAYS) : 30;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTeam = "";
function cfTeam(): string {
  return (process.env.CF_ACCESS_TEAM_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
export function accessConfigSummary() {
  return { jwtCheck: cfJwtConfigured(), team: cfTeam() || null, audPrefix: (process.env.CF_ACCESS_AUD || "").slice(0, 8) || null, admin: adminEmail() };
}
export function cfJwtConfigured(): boolean {
  return Boolean(cfTeam() && process.env.CF_ACCESS_AUD);
}
async function verifyCfJwt(token: string): Promise<string | null> {
  const team = cfTeam();
  if (!jwks || jwksTeam !== team) {
    // CF_ACCESS_CERTS_URL: test override only; default is the team's public certs endpoint.
    jwks = createRemoteJWKSet(new URL(process.env.CF_ACCESS_CERTS_URL || `https://${team}/cdn-cgi/access/certs`));
    jwksTeam = team;
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { audience: process.env.CF_ACCESS_AUD, issuer: `https://${team}` });
    const email = normEmail(payload.email);
    if (!isEmail(email)) return null;
    if (revokedBefore(email, (Number(payload.iat) || 0) * 1000)) return null; // signed out after this token was issued
    return email;
  } catch (err) {
    // Log only the reason, never the token.
    const why = err instanceof Error ? `${(err as { code?: string }).code || err.name}: ${err.message}` : "unknown";
    if (why !== lastJwtError) console.warn(`Cloudflare Access JWT rejected (${why})`);
    lastJwtError = why;
    return null;
  }
}
let lastJwtError = "";

function parseCookies(req: express.Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sign(secret: string, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}
export function makeSessionValue(secret: string, email: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ e: normEmail(email), i: now, x: now + SESSION_DAYS() * 86400_000 })).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}
export function readSessionValue(secret: string, v: string | undefined): string | null {
  if (!v) return null;
  const [body, mac] = v.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sign(secret, body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const { e, x, i } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof e !== "string" || typeof x !== "number" || x <= Date.now()) return null;
    if (revokedBefore(e, typeof i === "number" ? i : 0)) return null;
    return e;
  } catch {
    return null;
  }
}
export function setSessionCookie(req: express.Request, res: express.Response, secret: string, email: string) {
  const secure = req.secure || req.get("x-forwarded-proto") === "https";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${makeSessionValue(secret, email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS() * 86400}${secure ? "; Secure" : ""}`
  );
}

export async function resolveIdentity(req: express.Request, store: AccessStore): Promise<Identity | null> {
  if (cfJwtConfigured()) {
    // Header set by Cloudflare at the edge; CF_Authorization cookie as fallback.
    const tok = req.get("cf-access-jwt-assertion") || parseCookies(req)["CF_Authorization"];
    if (tok) {
      const email = await verifyCfJwt(tok);
      if (email) return { email, source: "cf-access-jwt" };
    }
  } else if (process.env.TRUST_CF_ACCESS_HEADER === "true") {
    const email = normEmail(req.get("cf-access-authenticated-user-email"));
    if (isEmail(email)) return { email, source: "cf-access-header" };
  }
  const email = readSessionValue(store.secret, parseCookies(req)[SESSION_COOKIE]);
  return email ? { email, source: "session" } : null;
}

export const isAdminEmail = (email?: string | null) => Boolean(email) && normEmail(email) === adminEmail();

/** Came through Cloudflare (tunnel) or another proxy, i.e. not a direct local request. */
function viaProxy(req: express.Request): boolean {
  return Boolean(req.get("cf-connecting-ip") || req.get("cf-ray") || req.get("x-forwarded-for"));
}
function isLoopback(req: express.Request): boolean {
  const a = req.socket.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

type PolicyTarget = { app?: string; policy?: string };
/** Access policies that list guest emails: the Study Buddy app (optional) and God's Eye View (GEV_ACCESS_*). */
function policyTargets(): PolicyTarget[] {
  return [
    { app: process.env.CF_ACCESS_APP_ID, policy: process.env.CF_ACCESS_POLICY_ID },
    { app: process.env.GEV_ACCESS_APP_ID, policy: process.env.GEV_ACCESS_POLICY_ID },
  ].filter((t) => t.app && t.policy);
}

/** Add or remove one email in an Access policy include list. Best-effort, never throws, never touches other rules. */
async function editPolicyEmail(t: PolicyTarget, email: string, op: "add" | "remove", fetchImpl: typeof fetch): Promise<{ ok: boolean; error?: string }> {
  const { CF_API_TOKEN: token, CF_ACCOUNT_ID: acct } = process.env;
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/access/apps/${t.app}/policies/${t.policy}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const e = normEmail(email);
  try {
    const cur = await fetchImpl(url, { headers, signal: AbortSignal.timeout(10000) });
    const j = (await cur.json()) as { success?: boolean; result?: Record<string, unknown> };
    if (!cur.ok || !j.success || !j.result) return { ok: false, error: `GET policy HTTP ${cur.status}` };
    const p = j.result as { name: string; decision: string; include?: unknown[]; exclude?: unknown[]; require?: unknown[]; precedence?: number; session_duration?: string };
    const include = Array.isArray(p.include) ? [...p.include] : [];
    const isE = (r: unknown) => normEmail((r as { email?: { email?: string } })?.email?.email) === e;
    let next: unknown[];
    if (op === "add") { if (include.some(isE)) return { ok: true }; next = [...include, { email: { email: e } }]; }
    else {
      if (e === adminEmail()) return { ok: false, error: "refusing to remove the admin" };
      next = include.filter((r) => !isE(r));
      if (next.length === include.length) return { ok: true };
      if (next.length === 0) return { ok: false, error: "refusing to empty the policy" };
    }
    const body = { name: p.name, decision: p.decision, include: next, exclude: p.exclude || [], require: p.require || [], ...(p.precedence ? { precedence: p.precedence } : {}), ...(p.session_duration ? { session_duration: p.session_duration } : {}) };
    const put = await fetchImpl(url, { method: "PUT", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const pj = (await put.json().catch(() => ({}))) as { success?: boolean };
    return put.ok && pj.success ? { ok: true } : { ok: false, error: `PUT policy HTTP ${put.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Cloudflare API error" };
  }
}

async function syncEmailToPolicies(email: string, op: "add" | "remove", fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!process.env.CF_API_TOKEN || !process.env.CF_ACCOUNT_ID) return { ok: false, skipped: true };
  const targets = policyTargets();
  if (!targets.length) return { ok: false, skipped: true };
  const errs: string[] = [];
  for (const t of targets) { const r = await editPolicyEmail(t, email, op, fetchImpl); if (!r.ok) errs.push(`${t.app?.slice(0, 8)}: ${r.error}`); }
  return errs.length ? { ok: false, error: errs.join("; ") } : { ok: true };
}
export const addEmailToCfAccessPolicy = (email: string, fetchImpl: typeof fetch = fetch) => syncEmailToPolicies(email, "add", fetchImpl);
export const removeEmailFromCfAccessPolicy = (email: string, fetchImpl: typeof fetch = fetch) => syncEmailToPolicies(email, "remove", fetchImpl);

/** Startup backfill: every redeemed guest still allowed gets added to the GEV/Access policies. */
export async function backfillAccessPolicies(store: AccessStore, fetchImpl: typeof fetch = fetch) {
  let n = 0;
  for (const u of store.listAllowed()) {
    const r = await addEmailToCfAccessPolicy(u.email, fetchImpl);
    if (r.skipped) return { skipped: true, n };
    if (r.ok) n++; else console.warn(`Access policy backfill failed for a guest: ${r.error}`);
  }
  return { skipped: false, n };
}

type Limiter = (req: express.Request, res: express.Response, next: express.NextFunction) => void;

export function registerAuth(app: express.Express, store: AccessStore, redeemLimiter: Limiter) {
  // Attach identity to every /api request.
  app.use(["/api", "/draftboard"], async (req, _res, next) => {
    try { (req as ReqWithUser).identity = await resolveIdentity(req, store); } catch { (req as ReqWithUser).identity = null; }
    next();
  });

  const hasAccess = (email?: string) => Boolean(email) && (isAdminEmail(email) || store.isAllowed(email!));

  app.get("/api/me", (req, res) => {
    const id = (req as ReqWithUser).identity;
    const email = id?.email || null;
    const admin = isAdminEmail(email);
    res.json({
      email,
      authSource: id?.source || null,
      hasAccess: hasAccess(email || undefined),
      isAdmin: admin,
      ageConfirmed: email ? store.hasConfirmedAge(email) : false,
      // Only offered for direct local requests, never through the tunnel.
      devLogin: process.env.DEV_LOGIN === "true" && isLoopback(req) && !viaProxy(req),
      // God's Eye View: admin and redeemed guests (Cloudflare Access enforces the same list on gev.*).
      ...(hasAccess(email || undefined) ? { gevUrl: gevUrl() } : {}),
    });
  });

  // Local-dev fallback login. Off unless DEV_LOGIN=true; loopback only; refused through the tunnel/proxies.
  app.post("/api/auth/dev-login", (req, res) => {
    if (process.env.DEV_LOGIN !== "true" || !isLoopback(req) || viaProxy(req)) return res.status(404).json({ error: "Not found" });
    const email = normEmail(req.body?.email);
    if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email" });
    if (isAdminEmail(email)) {
      // Admin always needs the token; with ADMIN_TOKEN unset nobody can sign in as admin here.
      if (!adminTokenMatches(String(req.body?.adminToken || ""))) {
        return res.status(401).json({ error: "Admin token required for the admin account" });
      }
    } else if (!store.isAllowed(email)) {
      return res.status(403).json({ error: "This email doesn't have access yet. Redeem a guest code first." });
    }
    setSessionCookie(req, res, store.secret, email);
    res.json({ ok: true, email });
  });

  // Sign out securely: revoke server-side, clear cookies + browser cache/storage, then end the Cloudflare Access session.
  // POST only (a form submit), so a link or image can't sign someone out.
  app.post("/api/auth/logout", (req, res) => {
    const id = (req as ReqWithUser).identity;
    if (id) recordLogout(id.email);
    const secure = req.secure || req.get("x-forwarded-proto") === "https";
    const kill = (name: string) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? "; Secure" : ""}`;
    // CF_Authorization is left for Cloudflare's own logout to consume (clearing it first makes Access answer
    // "No Access cookie found" and keeps the team-wide session alive). It is refused server-side from now on anyway.
    res.setHeader("Set-Cookie", kill(SESSION_COOKIE));
    res.setHeader("Clear-Site-Data", '"cache", "storage"');
    res.setHeader("Cache-Control", "no-store");
    // Through Cloudflare: hand off to Access logout. Direct local use: back to the sign-in gate.
    // Team-domain logout ends the whole Access session (every app), so the next visit needs a new one-time PIN.
    const behindAccess = viaProxy(req) || (cfJwtConfigured() && !isLoopback(req));
    const target = !behindAccess ? "/" : cfTeam() ? `https://${cfTeam()}/cdn-cgi/access/logout` : "/cdn-cgi/access/logout";
    if ((req.get("accept") || "").includes("application/json")) return res.json({ ok: true, redirect: target });
    res.redirect(303, target);
  });

  // 18+ confirmation (per signed-in email).
  app.post("/api/age/confirm", (req, res) => {
    const id = (req as ReqWithUser).identity;
    if (!id || !hasAccess(id.email)) return res.status(401).json({ error: "Sign in first" });
    if (req.body?.confirm18 !== true) return res.status(400).json({ error: "You must confirm you are 18 or older" });
    store.confirmAge(id.email);
    res.json({ ok: true });
  });

  // Guest code redemption. With a verified identity the email must match it; otherwise the body email is used
  // and an app session is issued for it. Rate-limited per IP.
  app.post("/api/guest/redeem", redeemLimiter, async (req, res) => {
    const id = (req as ReqWithUser).identity;
    const email = id ? id.email : normEmail(req.body?.email);
    if (id && req.body?.email && normEmail(req.body.email) !== id.email) {
      return res.status(400).json({ error: "That code isn't valid for this email." });
    }
    if (!isEmail(email)) return res.status(400).json({ error: "Enter the email the code was sent to" });
    const code = typeof req.body?.code === "string" ? req.body.code.slice(0, 40) : "";
    if (!code) return res.status(400).json({ error: "Enter your guest code" });
    const out = store.redeemGuestCode(email, code);
    if (!out.ok) return res.status(400).json({ error: out.error });
    const cf = await addEmailToCfAccessPolicy(email);
    if (!cf.ok && !cf.skipped) console.warn(`Guest redeemed but Cloudflare Access policy update failed: ${cf.error}`);
    if (!id) setSessionCookie(req, res, store.secret, email);
    res.json({ ok: true, email, cfAccessUpdated: cf.ok });
  });

  // ---- admin only ----
  const requireAdminUser: Limiter = (req, res, next) => {
    const id = (req as ReqWithUser).identity;
    if (!id || !isAdminEmail(id.email)) return res.status(403).json({ error: "Admin only" });
    next();
  };
  app.get("/api/admin/guest-codes", requireAdminUser, (_req, res) => {
    res.json({ codes: store.listGuestCodes(), allowed: store.listAllowed() });
  });
  app.post("/api/admin/guest-codes", requireAdminUser, (req, res) => {
    let expires: Date | null = null;
    if (req.body?.expiresAt) {
      expires = new Date(String(req.body.expiresAt));
      if (isNaN(expires.getTime())) return res.status(400).json({ error: "Invalid expiry date" });
    } else if (Number(req.body?.expiresInDays) > 0) {
      expires = new Date(Date.now() + Number(req.body.expiresInDays) * 86400_000);
    }
    try {
      const { code, record } = store.createGuestCode(String(req.body?.email || ""), expires);
      const { hash: _h, ...pub } = record;
      // The plain code is returned exactly once, here.
      res.status(201).json({ code, guestCode: pub });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Could not create code" });
    }
  });
  app.post("/api/admin/guest-codes/:id/revoke", requireAdminUser, async (req, res) => {
    const rec = store.listGuestCodes().find((c) => c.id === String(req.params.id));
    const ok = store.revokeGuestCode(String(req.params.id));
    if (!ok) return res.status(404).json({ error: "Code not found or already revoked" });
    let cfAccessUpdated: boolean | undefined;
    if (rec?.redeemedAt && !store.isAllowed(rec.email)) {
      const cf = await removeEmailFromCfAccessPolicy(rec.email);
      if (!cf.ok && !cf.skipped) console.warn(`Revoked guest but Access policy removal failed: ${cf.error}`);
      cfAccessUpdated = cf.ok;
    }
    res.json({ ok: true, cfAccessUpdated });
  });

  /** Middleware for AI routes: signed in, allowed, and 18+ confirmed. */
  const requireUserAndAge: Limiter = (req, res, next) => {
    const id = (req as ReqWithUser).identity;
    if (!id) return res.status(401).json({ error: "Please sign in to use Study Buddy.", needLogin: true });
    if (!hasAccess(id.email)) return res.status(403).json({ error: "This email doesn't have access yet. Redeem a guest code.", needGuestCode: true });
    if (!store.hasConfirmedAge(id.email)) return res.status(403).json({ error: "Please confirm you are 18 or older.", needAgeConfirm: true });
    next();
  };
  return { requireUserAndAge, requireAdminUser };
}
