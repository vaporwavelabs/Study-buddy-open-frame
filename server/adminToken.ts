import crypto from "node:crypto";

/** The one place ADMIN_TOKEN is checked. Unset or short (<12 chars) ADMIN_TOKEN => never matches. Constant-time. */
export function adminTokenMatches(got: unknown): boolean {
  const expected = process.env.ADMIN_TOKEN || "";
  if (expected.length < 12 || typeof got !== "string" || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
