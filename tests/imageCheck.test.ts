import { test } from "node:test";
import assert from "node:assert";
import fs from "fs";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { checkImageReadable } from "../server/imageCheck.ts";

const png = (w: number, h: number, f: (x: number, y: number) => number) => {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, v = f(x, y); p.data[i] = p.data[i + 1] = p.data[i + 2] = v; p.data[i + 3] = 255; }
  return "data:image/png;base64," + PNG.sync.write(p).toString("base64");
};
test("blank white, black and tiny images are unreadable", () => {
  assert.equal(checkImageReadable(png(200, 200, () => 255)).readable, false);
  assert.match(checkImageReadable(png(200, 200, () => 3)).reason!, /dark/);
  assert.equal(checkImageReadable(png(1, 1, () => 0)).readable, false);
});
test("image with content is readable (png + jpeg + real fixture)", () => {
  assert.equal(checkImageReadable(png(200, 200, (x) => (x % 20 < 4 ? 0 : 255))).readable, true);
  const w = 64, h = 64, d = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = (i % w) < 32 ? 20 : 230; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  assert.equal(checkImageReadable("data:image/jpeg;base64," + jpeg.encode({ data: d, width: w, height: h }, 90).data.toString("base64")).readable, true);
  const fx = new URL("./fixtures/equation.png", import.meta.url);
  if (fs.existsSync(fx)) assert.equal(checkImageReadable("data:image/png;base64," + fs.readFileSync(fx).toString("base64")).readable, true);
});
test("garbage and non-images", () => {
  assert.equal(checkImageReadable("data:image/png;base64,AAAA").readable, false);
  assert.equal(checkImageReadable("data:application/pdf;base64,AAAA").checked, false);
});
