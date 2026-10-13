import { GoogleGenAI, Type } from "@google/genai";
import { LlmProviderConfig, LlmTestResult } from "../src/types/llmAndGrok.js";

/**
 * Tests connection to an LLM provider (Ollama, Custom OpenAI-compatible server, Grok, or Gemini)
 */
export async function testLlmProviderConnection(
  config: LlmProviderConfig
): Promise<LlmTestResult> {
  const startTime = Date.now();
  const { type, baseUrl, apiKey, model } = config;

  try {
    if (type === "ollama") {
      const cleanBase = (baseUrl || "http://localhost:11434").replace(/\/+$/, "");
      const res = await fetch(`${cleanBase}/api/tags`, {
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        throw new Error(`Ollama responded with HTTP status ${res.status}`);
      }

      const data = await res.json();
      const models = Array.isArray(data.models)
        ? data.models.map((m: { name?: string; model?: string }) => m.name || m.model || "")
        : [];

      return {
        success: true,
        provider: "ollama",
        baseUrl: cleanBase,
        model: model || models[0] || "llama3.2",
        latencyMs: Date.now() - startTime,
        availableModels: models,
        message: `Connected to Ollama! Found ${models.length} installed model(s).`,
      };
    }

    if (type === "custom-server") {
      const cleanBase = (baseUrl || "http://localhost:1234/v1").replace(/\/+$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(`${cleanBase}/models`, {
        headers,
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        throw new Error(`Custom server responded with status ${res.status}`);
      }

      const data = await res.json();
      const models = Array.isArray(data.data)
        ? data.data.map((m: { id?: string }) => m.id || "")
        : [];

      return {
        success: true,
        provider: "custom-server",
        baseUrl: cleanBase,
        model: model || models[0] || "local-model",
        latencyMs: Date.now() - startTime,
        availableModels: models,
        message: `Connected to Custom OpenAI-compatible server! Found ${models.length} model(s).`,
      };
    }

    if (type === "grok") {
      const keyToUse = apiKey || process.env.GROK_API_KEY;
      if (!keyToUse) {
        return {
          success: false,
          provider: "grok",
          baseUrl: "https://api.x.ai/v1",
          model: model || "grok-2-latest",
          latencyMs: Date.now() - startTime,
          availableModels: ["grok-2-latest", "grok-2-vision-1212", "grok-beta"],
          message: "Grok API key not provided. Set GROK_API_KEY in environment or settings.",
        };
      }

      const res = await fetch("https://api.x.ai/v1/models", {
        headers: {
          Authorization: `Bearer ${keyToUse}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        throw new Error(`xAI Grok API error (status ${res.status})`);
      }

      const data = await res.json();
      const models = Array.isArray(data.data)
        ? data.data.map((m: { id?: string }) => m.id || "")
        : ["grok-2-latest", "grok-2-vision-1212", "grok-beta"];

      return {
        success: true,
        provider: "grok",
        baseUrl: "https://api.x.ai/v1",
        model: model || "grok-2-latest",
        latencyMs: Date.now() - startTime,
        availableModels: models,
        message: "Successfully connected to xAI Grok API!",
      };
    }

    if (type === "gemini") {
      const geminiKey = apiKey || process.env.GEMINI_API_KEY;
      if (!geminiKey || geminiKey === "MY_GEMINI_API_KEY") {
        return {
          success: false,
          provider: "gemini",
          baseUrl: "https://generativelanguage.googleapis.com",
          model: "gemini-3.8-flash",
          latencyMs: Date.now() - startTime,
          availableModels: ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-3.5-transcribe"],
          message: "Gemini API key is not configured in server environment.",
        };
      }

      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const ping = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: "ping",
      });

      return {
        success: Boolean(ping.text),
        provider: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com",
        model: "gemini-3.8-flash",
        latencyMs: Date.now() - startTime,
        availableModels: ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-3.8-flash-lite-tts"],
        message: "Successfully connected to Google Gemini Cloud Engine!",
      };
    }

    // Default: Local Gemma 4 Edge (runs in-browser)
    return {
      success: true,
      provider: "local-edge",
      baseUrl: "browser://webgpu-wasm",
      model: "Gemma-4-Edge-Math-4B-IT",
      latencyMs: 1,
      availableModels: ["Gemma-4-Edge-Math-4B-IT", "Gemma-2-2B-IT"],
      message: "Local Gemma 4 Edge Symbolic Engine is active and offline ready.",
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Connection failed";
    return {
      success: false,
      provider: type,
      baseUrl: baseUrl || "",
      model: model || "",
      latencyMs: Date.now() - startTime,
      availableModels: [],
      message: msg,
    };
  }
}

/**
 * Universal chat completion runner across any provider (Ollama, Grok, Custom server, Gemini)
 */
export async function executeUniversalChat(
  config: LlmProviderConfig,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<{ replyText: string; modelUsed: string }> {
  const { type, baseUrl, apiKey, model } = config;

  if (type === "ollama") {
    const cleanBase = (baseUrl || "http://localhost:11434").replace(/\/+$/, "");
    const res = await fetch(`${cleanBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "llama3.2",
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama chat failed with status ${res.status}`);
    }

    const data = await res.json();
    return {
      replyText: data.message?.content || "",
      modelUsed: `Ollama (${model || "llama3.2"})`,
    };
  }

  if (type === "grok" || type === "custom-server") {
    const endpoint =
      type === "grok"
        ? "https://api.x.ai/v1/chat/completions"
        : `${(baseUrl || "http://localhost:1234/v1").replace(/\/+$/, "")}/chat/completions`;

    const keyToUse =
      type === "grok" ? apiKey || process.env.GROK_API_KEY : apiKey;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (keyToUse) headers["Authorization"] = `Bearer ${keyToUse}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model || (type === "grok" ? "grok-2-latest" : "local-model"),
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${type} chat failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";
    return {
      replyText: reply,
      modelUsed: `${type === "grok" ? "xAI Grok" : "Custom Server"} (${model || "default"})`,
    };
  }

  // Fallback to Gemini
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== "MY_GEMINI_API_KEY") {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const formatted = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");
    const resp = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: formatted,
    });
    return {
      replyText: resp.text || "",
      modelUsed: "gemini-3.8-flash",
    };
  }

  throw new Error("No active LLM provider reachable");
}
