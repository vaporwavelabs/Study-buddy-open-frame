import { test } from "node:test";
import assert from "node:assert";
import { practiceFor } from "../server/practice.ts";
import { checkEquationAnswer } from "../server/mathCheck.ts";
const verify = (src: string) => {
  for (let i = 0; i < 25; i++) {
    const ps = practiceFor(src);
    assert.ok(ps && ps.length >= 2 && ps.length <= 3, src);
    for (const p of ps!) { const c = checkEquationAnswer(p.question, p.answer); assert.ok(c.checkable && c.ok, `${p.question} -> ${p.answer}`); }
  }
};
test("linear practice is same type and verified", () => { verify("Solve 2x + 3 = 11"); assert.ok(practiceFor("Solve 2x + 3 = 11")!.every((p) => !/\^2/.test(p.question))); });
test("quadratic practice", () => { verify("x^2 - 5x + 6 = 0"); assert.ok(practiceFor("x^2 - 5x + 6 = 0")!.every((p) => /\^2/.test(p.question))); });
test("arithmetic practice", () => { verify("what is 48 / 6"); verify("12 x 7"); verify("3.5 + 2.25"); });
test("non-math gives none", () => { assert.equal(practiceFor("tell me about cells"), null); });
