import { test } from "node:test";
import assert from "node:assert";
import fs from "fs"; import os from "os"; import path from "path";
import { listInstalledModels, ModelSettingsStore, clearModelCache } from "../server/models.ts";

const fake = async (p: string, init?: RequestInit) => {
  if (p === "/api/tags") return new Response(JSON.stringify({ models: [
    { name: "gemma3:12b", size: 8.1e9, details: { family: "gemma3" } },
    { name: "qwen3:8b", size: 5.2e9, details: { family: "qwen3" } },
    { name: "llama3.2-vision:11b", size: 7.9e9, details: { family: "mllama" } },
    { name: "nomic-embed-text:latest", size: 0.3e9, details: { family: "nomic-bert" } },
    { name: "flux-img:latest", size: 12e9, details: { family: "flux" } },
    { name: "llama3.3:70b", size: 42e9, details: { family: "llama" } },
  ] }));
  const m = JSON.parse(String(init?.body)).model;
  const caps: Record<string, string[]> = { "gemma3:12b": ["completion", "vision"], "qwen3:8b": ["completion", "tools", "thinking"], "flux-img:latest": ["image"], "llama3.3:70b": ["completion"] };
  return new Response(JSON.stringify({ capabilities: caps[m] || [] }));
};

test("lists chat models, tags vision, hides embed/image-only/mllama, flags too big", async () => {
  clearModelCache();
  const l = await listInstalledModels(fake as any, true);
  assert.deepEqual(l.map((m) => m.name), ["qwen3:8b", "gemma3:12b", "llama3.3:70b"]);
  assert.equal(l.find((m) => m.name === "gemma3:12b")!.vision, true);
  assert.equal(l.find((m) => m.name === "qwen3:8b")!.vision, false);
  assert.equal(l.find((m) => m.name === "llama3.3:70b")!.tooBig, true);
  assert.equal(l.find((m) => m.name === "gemma3:12b")!.tooBig, false);
});

test("settings persist; user choice limited to allow list", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sbm-")), "models.json");
  const s = new ModelSettingsStore(f, { defaultModel: "gemma3:12b", visionModel: "gemma3:12b", allowed: ["gemma3:12b"] });
  s.set({ defaultModel: "gemma3:12b", visionModel: "gemma3:12b", allowed: ["qwen3:8b"] });
  const s2 = new ModelSettingsStore(f, { defaultModel: "x", visionModel: "", allowed: [] });
  assert.deepEqual(s2.get().allowed.sort(), ["gemma3:12b", "qwen3:8b"], "default always allowed, persisted");
  assert.equal(s2.resolve("qwen3:8b"), "qwen3:8b");
  assert.equal(s2.resolve("gemma4:26b"), "gemma3:12b", "not on allow list -> default");
  assert.equal(s2.resolve("../../etc; rm -rf"), "gemma3:12b", "garbage -> default");
  assert.equal(s2.resolve(undefined), "gemma3:12b");
});
