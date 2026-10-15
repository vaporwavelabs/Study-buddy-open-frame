/**
 * Deterministic answer check for single-variable linear/quadratic equations ("2x + 3 = 11", "x^2 - 9 = 0").
 * Small local models (e.g. gemma3:1b) sometimes return wrong roots; we verify before showing a kid the answer.
 * Returns null when the problem is not something we can check (word problems, systems, etc.).
 */
type Tok = { t: "num"; v: number } | { t: "var" } | { t: "op"; v: string };

function tokenize(src: string, varName: string): Tok[] | null {
  const out: Tok[] = [];
  const s = src.replace(/\s+/g, "").replace(/[×·]/g, "*").replace(/[÷]/g, "/").replace(/[−–]/g, "-").replace(/²/g, "^2");
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    const num = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i));
    if (num) { out.push({ t: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
    if (ch.toLowerCase() === varName) { out.push({ t: "var" }); i++; continue; }
    if ("+-*/^()".includes(ch)) { out.push({ t: "op", v: ch }); i++; continue; }
    return null;
  }
  // implicit multiplication: 2x, 2(, x(, )(, )x, )2
  const res: Tok[] = [];
  for (const tk of out) {
    const prev = res[res.length - 1];
    const prevEnds = prev && (prev.t === "num" || prev.t === "var" || (prev.t === "op" && prev.v === ")"));
    const curStarts = tk.t === "num" || tk.t === "var" || (tk.t === "op" && tk.v === "(");
    if (prevEnds && curStarts) res.push({ t: "op", v: "*" });
    res.push(tk);
  }
  return res;
}

function compile(toks: Tok[]): ((x: number) => number) | null {
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v: string) => { const p = peek(); return p && p.t === "op" && p.v === v; };
  function primary(): (x: number) => number {
    const tk = toks[i++];
    if (!tk) throw new Error("eof");
    if (tk.t === "num") { const v = tk.v; return () => v; }
    if (tk.t === "var") return (x) => x;
    if (tk.v === "(") { const e = expr(); if (!isOp(")")) throw new Error(")"); i++; return e; }
    if (tk.v === "-") { const p = power(); return (x) => -p(x); }
    if (tk.v === "+") return power();
    throw new Error("bad token");
  }
  function power(): (x: number) => number {
    const b = primary();
    if (isOp("^")) { i++; const e = unaryPow(); return (x) => Math.pow(b(x), e(x)); }
    return b;
  }
  function unaryPow(): (x: number) => number { if (isOp("-")) { i++; const p = power(); return (x) => -p(x); } return power(); }
  function term(): (x: number) => number {
    let l = power();
    while (isOp("*") || isOp("/")) { const op = (toks[i++] as { v: string }).v; const r = power(); const L = l; l = op === "*" ? (x) => L(x) * r(x) : (x) => L(x) / r(x); }
    return l;
  }
  function expr(): (x: number) => number {
    let l = term();
    while (isOp("+") || isOp("-")) { const op = (toks[i++] as { v: string }).v; const r = term(); const L = l; l = op === "+" ? (x) => L(x) + r(x) : (x) => L(x) - r(x); }
    return l;
  }
  try { const f = expr(); return i === toks.length ? f : null; } catch { return null; }
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

/** Real roots of f if it is a polynomial of degree 1 or 2 in the variable; null otherwise. */
function rootsOf(f: (x: number) => number): number[] | null {
  const f0 = f(0), f1 = f(1), fm = f(-1);
  const c = f0, a = (f1 + fm) / 2 - c, b = (f1 - fm) / 2;
  for (const t of [2, -3, 5, 0.5]) if (!close(f(t), a * t * t + b * t + c)) return null; // not degree ≤ 2
  if (![a, b, c].every(Number.isFinite)) return null;
  if (close(a, 0)) { if (close(b, 0)) return null; return [-c / b]; }
  const d = b * b - 4 * a * c;
  if (d < -1e-9) return [];
  const sq = Math.sqrt(Math.max(0, d));
  const r = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
  return close(r[0], r[1]) ? [r[0]] : r;
}

function parseNumbers(answer: string, varName: string): number[] {
  const nums: number[] = [];
  const re = new RegExp(`${varName}\\s*=\\s*(-?\\d+(?:\\.\\d+)?(?:\\s*/\\s*\\d+)?)|(-?\\d+(?:\\.\\d+)?(?:\\s*/\\s*\\d+)?)`, "gi");
  for (const m of answer.replace(/[−–]/g, "-").replace(/±\s*(\d+(?:\.\d+)?)/g, "$1 or -$1").matchAll(re)) {
    const raw = (m[1] ?? m[2]).replace(/\s+/g, "");
    const [p, q] = raw.split("/");
    const v = q ? parseFloat(p) / parseFloat(q) : parseFloat(p);
    if (Number.isFinite(v)) nums.push(v);
  }
  return nums;
}

export type MathCheck = { checkable: false } | { checkable: true; ok: boolean; expected: number[]; got: number[]; variable: string };

/** "15% of 80", "What is 12 * (3 + 4)?" : pure arithmetic or percent-of. */
function checkArithmetic(problem: string, finalAnswer: string): MathCheck {
  const p = problem.trim().replace(/^(what\s+is|what's|calculate|compute|find|evaluate)\s+/i, "").replace(/[?.!=\s]+$/, "");
  let value: number | null = null;
  const pct = /^(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)$/i.exec(p);
  if (pct) value = (parseFloat(pct[1]) / 100) * parseFloat(pct[2]);
  else if (/^[\d\s+\-*/^().×÷−]+$/.test(p) && /\d/.test(p) && /[+\-*/^×÷−]/.test(p)) {
    const toks = tokenize(p, "\u0000");
    const f = toks && compile(toks);
    if (f) value = f(0);
  }
  if (value === null || !Number.isFinite(value)) return { checkable: false };
  const got = parseNumbers(finalAnswer.replace(/,/g, ""), "\u0000");
  const ok = got.length > 0 && Math.abs(got[got.length - 1] - value) < 1e-6 * Math.max(1, Math.abs(value)) + 0.005;
  return { checkable: true, ok, expected: [value], got, variable: "" };
}

export function checkEquationAnswer(problem: string, finalAnswer: string): MathCheck {
  const arith = checkArithmetic(problem, finalAnswer);
  if (arith.checkable) return arith;
  const eq = problem.trim().replace(/^(solve|find)\b[^:]*:?\s*/i, "").replace(/\s*(for\s+[a-z])?[.?!]*$/i, "");
  const parts = eq.split("=");
  if (parts.length !== 2) return { checkable: false };
  const vars = Array.from(new Set((eq.match(/[a-z]/gi) || []).map((c) => c.toLowerCase())));
  if (vars.length !== 1) return { checkable: false };
  const v = vars[0];
  const lt = tokenize(parts[0], v), rt = tokenize(parts[1], v);
  if (!lt || !rt) return { checkable: false };
  const L = compile(lt), R = compile(rt);
  if (!L || !R) return { checkable: false };
  const f = (x: number) => L(x) - R(x);
  const expected = rootsOf(f);
  if (!expected) return { checkable: false };
  const got = parseNumbers(finalAnswer, v);
  const ok = expected.length === 0
    ? /no (real )?solution|no real roots|∅|none/i.test(finalAnswer)
    : expected.every((e) => got.some((g) => close(g, e) || Math.abs(g - e) < 0.01)) && got.every((g) => expected.some((e) => Math.abs(g - e) < 0.01));
  return { checkable: true, ok, expected, got, variable: v };
}

export function formatRoots(roots: number[], varName = "x"): string {
  if (!varName) return roots.map((r) => String(Math.round(r * 1000) / 1000)).join(", ");
  const fmt = (n: number) => (Number.isInteger(Math.round(n * 1e6) / 1e6) ? String(Math.round(n)) : String(Math.round(n * 1000) / 1000));
  if (roots.length === 0) return "no real solution";
  return roots.map((r) => `${varName} = ${fmt(r)}`).join(" or ");
}
