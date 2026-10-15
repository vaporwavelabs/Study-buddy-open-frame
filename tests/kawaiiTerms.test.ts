import { test } from "node:test";
import assert from "node:assert";
import { hasMinorTerms } from "../server/kawaii.ts";
test("blocks minor/age terms", () => { for (const t of ["a cute kid", "Teen girl", "young woman", "loli style", "school uniform", "12 years old", "my daughter", "a 9yo"]) assert.ok(hasMinorTerms(t), t); });
test("allows adult captions", () => { for (const t of ["a smiling woman in her thirties", "man with beard and glasses", "adult woman, brown hair"]) assert.equal(hasMinorTerms(t), false, t); });
