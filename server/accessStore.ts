/**
 * App-side access store: allowed users (admin + redeemed guests), 18+ confirmations and guest codes.
 * Only a keyed hash of each guest code is stored. Persisted as JSON in DATA_DIR (default ./data).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

export type GuestCode = {
  id: string;
  email: string;
  hash: string;
  createdAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  revokedAt: string | null;
};
export type AllowedUser = { email: string; addedAt: string; via: "guest-code" | "admin" };
type StoreData = {
  secret: string;
  allowed: Record<string, AllowedUser>;
  ageConfirmed: Record<string, string>;
  guestCodes: GuestCode[];
};

export const normEmail = (e: unknown): string =>
  typeof e === "string" ? e.trim().toLowerCase() : "";
export const isEmail = (e: string) => /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,}$/i.test(e);

// Unambiguous alphabet (no 0/O/1/I/L), 10 chars ≈ 49 bits, shown as XXXXX-XXXXX.
const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function generateCodeText(): string {
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHA[bytes[i] % ALPHA.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}
const canonCode = (c: unknown) => (typeof c === "string" ? c.toUpperCase().replace(/[^0-9A-Z]/g, "") : "");

export class AccessStore {
  private data: StoreData;
  constructor(private file: string) {
    this.data = this.load();
  }
  static fromEnv(): AccessStore {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    return new AccessStore(path.join(dir, "access.json"));
  }
  private load(): StoreData {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, "utf8")) as StoreData;
      if (d && typeof d.secret === "string" && d.secret.length >= 32) {
        return { ...d, allowed: d.allowed || {}, ageConfirmed: d.ageConfirmed || {}, guestCodes: d.guestCodes || [] };
      }
    } catch { /* new store */ }
    const fresh: StoreData = { secret: crypto.randomBytes(32).toString("hex"), allowed: {}, ageConfirmed: {}, guestCodes: [] };
    this.data = fresh;
    this.save();
    return fresh;
  }
  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  /** Server secret used for code hashes and session signing (SESSION_SECRET env overrides). */
  get secret(): string {
    return process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32 ? process.env.SESSION_SECRET : this.data.secret;
  }
  hashCode(code: string): string {
    // Hash keyed with the store's own secret so it stays stable even if SESSION_SECRET changes.
    return crypto.createHmac("sha256", this.data.secret).update(canonCode(code)).digest("hex");
  }

  // ---- allowed users ----
  isAllowed(email: string): boolean {
    return Boolean(this.data.allowed[normEmail(email)]);
  }
  addAllowed(email: string, via: AllowedUser["via"]) {
    const e = normEmail(email);
    if (!this.data.allowed[e]) this.data.allowed[e] = { email: e, addedAt: new Date().toISOString(), via };
    this.save();
  }
  removeAllowed(email: string): boolean {
    const e = normEmail(email);
    if (!this.data.allowed[e]) return false;
    delete this.data.allowed[e];
    this.save();
    return true;
  }
  listAllowed(): AllowedUser[] {
    return Object.values(this.data.allowed);
  }

  // ---- 18+ ----
  hasConfirmedAge(email: string): boolean {
    return Boolean(this.data.ageConfirmed[normEmail(email)]);
  }
  confirmAge(email: string) {
    this.data.ageConfirmed[normEmail(email)] = new Date().toISOString();
    this.save();
  }

  // ---- guest codes ----
  createGuestCode(email: string, expiresAt: Date | null): { code: string; record: GuestCode } {
    const e = normEmail(email);
    if (!isEmail(e)) throw new Error("A valid guest email is required");
    if (expiresAt && !(expiresAt.getTime() > Date.now())) throw new Error("Expiry must be in the future");
    const code = generateCodeText();
    const record: GuestCode = {
      id: crypto.randomBytes(6).toString("hex"),
      email: e,
      hash: this.hashCode(code),
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      redeemedAt: null,
      revokedAt: null,
    };
    this.data.guestCodes.push(record);
    this.save();
    return { code, record };
  }
  listGuestCodes(): Array<Omit<GuestCode, "hash"> & { status: string }> {
    const now = Date.now();
    return this.data.guestCodes.map(({ hash: _h, ...r }) => ({
      ...r,
      status: r.revokedAt ? "revoked" : r.redeemedAt ? "redeemed" : r.expiresAt && Date.parse(r.expiresAt) <= now ? "expired" : "active",
    }));
  }
  revokeGuestCode(id: string): boolean {
    const r = this.data.guestCodes.find((c) => c.id === id);
    if (!r || r.revokedAt) return false;
    r.revokedAt = new Date().toISOString();
    // Revoking a redeemed code also removes that guest's ongoing access.
    if (r.redeemedAt) delete this.data.allowed[r.email];
    this.save();
    return true;
  }
  /**
   * Single-use redemption. The code must exist, be unexpired, unrevoked, unredeemed, and belong to `email`.
   * Errors are deliberately generic so the endpoint doesn't reveal which part was wrong.
   */
  redeemGuestCode(email: string, code: string): { ok: true; email: string } | { ok: false; error: string } {
    const e = normEmail(email);
    const h = this.hashCode(code);
    const hb = Buffer.from(h, "hex");
    const rec = this.data.guestCodes.find((c) => {
      const cb = Buffer.from(c.hash, "hex");
      return cb.length === hb.length && crypto.timingSafeEqual(cb, hb);
    });
    const bad = { ok: false as const, error: "That code isn't valid for this email." };
    if (!rec || rec.email !== e) return bad;
    if (rec.revokedAt || rec.redeemedAt) return { ok: false, error: "That code has already been used or was revoked." };
    if (rec.expiresAt && Date.parse(rec.expiresAt) <= Date.now()) return { ok: false, error: "That code has expired." };
    rec.redeemedAt = new Date().toISOString();
    this.data.allowed[e] = { email: e, addedAt: rec.redeemedAt, via: "guest-code" };
    this.save();
    return { ok: true, email: e };
  }
}
