/**
 * Builds 2-3 "same type" practice problems from a solved one. Every generated problem is
 * verified with checkEquationAnswer so a student is never handed a problem with no clean answer.
 */
import { checkEquationAnswer, formatRoots } from "./mathCheck.js";

export type Practice = { question: string; answer: string };

const rnd = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const nz = (lo: number, hi: number) => { let v = 0; while (v === 0) v = rnd(lo, hi); return v; };
const sgn = (n: number) => (n < 0 ? `- ${-n}` : `+ ${n}`);

/** Pull the first equation-like or arithmetic snippet out of free text. */
export function findProblem(text: string): string | null {
  const t = text.replace(/[−–]/g, "-").replace(/²/g, "^2");
  const eq = /[0-9a-z().^*/+\- ]*[a-z][0-9a-z().^*/+\- ]*=\s*[0-9a-z().^*/+\- ]+/i.exec(t);
  if (eq) {
    const s = eq[0].trim().replace(/^(solve|find|for|what is|is)\s+/i, "");
    const vars = new Set((s.match(/[a-z]/gi) || []).map((c) => c.toLowerCase()));
    if (vars.size === 1 && checkEquationAnswer(s, "0").checkable) return s;
  }
  const ar = /\d+(?:\.\d+)?(?:\s*[+\-*/×÷x]\s*\d+(?:\.\d+)?)+/.exec(t);
  if (ar) return ar[0].replace(/(\d)\s*x\s*(\d)/g, "$1 × $2");
  return null;
}

function linear(v: string): string {
  const x = rnd(-9, 12), a = nz(2, 9), b = nz(-15, 20);
  return `${a}${v} ${sgn(b)} = ${a * x + b}`;
}
function quadratic(v: string): string {
  const r1 = rnd(-7, 7), r2 = rnd(-7, 7);
  const B = -(r1 + r2), C = r1 * r2;
  return `${v}^2${B ? ` ${sgn(B).replace(/ 1$/, "")}${v}`.replace(/([+-]) 1x/, "$1 x") : ""}${C ? ` ${sgn(C)}` : ""} = 0`;
}
function arithmetic(src: string): string {
  return src.replace(/\d+(?:\.\d+)?/g, (n) => {
    const dec = n.includes(".") ? n.split(".")[1].length : 0;
    const mag = Math.max(1, Math.floor(parseFloat(n)));
    const lo = Math.max(1, Math.round(mag * 0.5)), hi = Math.max(lo + 3, Math.round(mag * 1.5));
    const v = rnd(lo, hi);
    return dec ? (v + rnd(1, 9) / 10 ** dec).toFixed(dec) : String(v);
  });
}

export function practiceFor(text: string, count = 3): Practice[] | null {
  if (!text) return null;
  const p = findProblem(text);
  if (!p) return null;
  const vars = Array.from(new Set((p.match(/[a-z]/gi) || []).map((c) => c.toLowerCase())));
  const out: Practice[] = [];
  const seen = new Set<string>([p.replace(/\s+/g, "")]);
  for (let tries = 0; out.length < count && tries < 40; tries++) {
    let q: string;
    if (vars.length === 1) q = /\^2/.test(p) ? quadratic(vars[0]) : linear(vars[0]);
    else {
      q = arithmetic(p);
      if (/÷|\//.test(q)) {
        // keep division answers whole: rewrite a ÷ b as (b*k) ÷ b
        q = q.replace(/(\d+)\s*([÷/])\s*(\d+)/, (_m, _a, op, b) => `${Number(b) * rnd(2, 12)} ${op} ${b}`);
      }
    }
    const key = q.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    const chk = checkEquationAnswer(q, "0");
    if (!chk.checkable || !chk.expected || (vars.length === 1 && chk.expected.length === 0)) continue;
    seen.add(key);
    out.push({ question: q, answer: formatRoots(chk.expected, chk.variable ?? "") });
  }
  return out.length >= 2 ? out : null;
}
