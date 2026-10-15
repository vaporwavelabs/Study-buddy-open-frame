import { test } from "node:test";
import assert from "node:assert";
import express from "express";
import { suggestTools, wantsGev, readGevSnapshot } from "../server/llmTools.ts";

test("toolsontab suggestions: relevant, toolsontab.com only, none for plain homework", () => {
  const pdf = suggestTools("how do I merge two PDF files into one?");
  assert.ok(pdf.length > 0 && pdf.every((t) => t.url.startsWith("https://toolsontab.com/tools/")), JSON.stringify(pdf));
  assert.ok(/pdf/i.test(pdf[0].title), pdf[0].title);
  const img = suggestTools("compress this photo to 50kb");
  assert.ok(img.length && /compress/i.test(img[0].title), JSON.stringify(img));
  assert.equal(suggestTools("what is photosynthesis?").length, 0);
  assert.equal(suggestTools("solve 3x + 5 = 20").length, 0);
});

test("GEV intent detection", () => {
  assert.ok(wantsGev("How is model performance on God's Eye right now?"));
  assert.ok(wantsGev("what's the VRAM use"));
  assert.ok(!wantsGev("explain the eye of a hurricane"));
});

test("GEV feed reader: /health always, geocode -> flights/area by question, GET only, local rate cap", async () => {
  const { extractPlace } = await import("../server/llmTools.ts");
  assert.equal(extractPlace("any flights over LAX right now?"), "LAX");
  assert.equal(extractPlace("what's the weather in Austin, TX?"), "Austin, TX");
  const seen: string[] = [];
  const app = express();
  app.use((q, _r, n) => { seen.push(`${q.method} ${q.path}`); n(); });
  app.get("/llm/v1/health", (_q, r) => r.json({ ok: true, ollama: { up: true, loaded: ["gemma3:12b"] }, study_buddy_app: { up: false } }));
  app.get("/llm/v1/geocode", (_q, r) => r.json([{ name: "LAX", lat: 33.94, lon: -118.4 }]));
  app.get("/llm/v1/flights", (q, r) => r.json({ count: 82, lat: q.query.lat, aircraft: [{ callsign: "SKW6277" }] }));
  app.get("/llm/v1/area", (_q, r) => r.json({ place: "Austin", weather: { temp_c: 24 } }));
  const srv = app.listen(0, "127.0.0.1"); await new Promise((r) => srv.once("listening", r));
  try {
    process.env.GEV_API_URL = `http://127.0.0.1:${(srv.address() as any).port}/llm/v1`;
    let s = await readGevSnapshot("how is model performance on god's eye?");
    assert.ok(s.ok && /gemma3:12b/.test(s.note)); assert.deepEqual(seen, ["GET /llm/v1/health"]);
    seen.length = 0; s = await readGevSnapshot("any flights over LAX right now?");
    assert.deepEqual(seen, ["GET /llm/v1/health", "GET /llm/v1/geocode", "GET /llm/v1/flights"]); assert.ok(/SKW6277/.test(s.note) && /33\.94/.test(s.note));
    seen.length = 0; s = await readGevSnapshot("weather in Austin, TX?");
    assert.deepEqual(seen, ["GET /llm/v1/health", "GET /llm/v1/geocode", "GET /llm/v1/area"]);
    process.env.GEV_API_PER_MIN = "1"; await new Promise((r) => setTimeout(r, 5));
    s = await readGevSnapshot("gev status"); assert.ok(s.endpoints.some((e) => e.status === "rate_limited_locally"), "local 60/min guard");
    delete process.env.GEV_API_PER_MIN;
    process.env.GEV_API_URL = "http://127.0.0.1:1/llm/v1";
    const d = await readGevSnapshot("gev status"); assert.ok(!d.ok && /not reachable/.test(d.note));
  } finally { srv.close(); delete process.env.GEV_API_URL; }
});
