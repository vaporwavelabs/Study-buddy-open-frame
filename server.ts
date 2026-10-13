import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import {
  testLlmProviderConnection,
  executeUniversalChat,
} from "./server/llmProviderService.js";
import {
  getProjectFileTree,
  readSourceCodeFile,
  searchCodebase,
  applyCodePatch,
  verifyCodebase,
  runGrokBotAnalysis,
} from "./server/grokBotHarnessService.js";
import { LlmProviderConfig } from "./src/types/llmAndGrok.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "25mb" }));

  // Health & Engine capability check
  app.get("/api/health", (_req, res) => {
    const hasCloudKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
    );
    res.json({
      status: "ok",
      cloudAssistAvailable: hasCloudKey,
      localEdgeEngine: "Gemma-4-Edge-Math-4B-IT (WebGPU/WASM Offline Ready)",
    });
  });

  // Multimodal Equation & Audio Context Solver
  app.post("/api/solve", async (req, res) => {
    try {
      const {
        equationText,
        imageBase64,
        imageMimeType,
        audioBase64,
        audioMimeType,
        voiceTranscript,
        difficultyMode,
      } = req.body;

      const ai = getGenAIClient();
      if (!ai) {
        return res.status(503).json({
          fallbackToLocalEdge: true,
          message:
            "Running purely on Local Gemma 4 Edge Engine (offline mode active).",
        });
      }

      const parts: Array<Record<string, unknown>> = [];

      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        parts.push({
          inlineData: {
            mimeType: imageMimeType || "image/png",
            data: cleanBase64,
          },
        });
      }

      if (audioBase64) {
        const cleanAudio = audioBase64.replace(/^data:audio\/[\w-]+;base64,/, "");
        parts.push({
          inlineData: {
            mimeType: audioMimeType || "audio/webm",
            data: cleanAudio,
          },
        });
      }

      const promptLines = [
        "You are Study Buddy, a warm, encouraging, and expressive pocket math & STEM homework helper powered by Gemma 4 Edge.",
        "Your job is to scan the handwritten equation (or typed math problem) and any student speech/audio context note, then provide a crystal-clear step-by-step solution.",
        equationText ? `Student's input equation or question: "${equationText}"` : "",
        voiceTranscript
          ? `Student's spoken audio note / context: "${voiceTranscript}"`
          : "",
        difficultyMode
          ? `Explanation style requested: ${difficultyMode} (adapt tone and depth accordingly).`
          : "",
        "If an image is provided, accurately transcribe the handwritten mathematical expression first.",
        "If an audio clip or voice transcript is provided, address the student's specific confusion, constraint, or method preference mentioned in their note.",
        "Make the spokenScript natural, friendly, upbeat, and easy to understand when read aloud by text-to-speech (avoid reading raw LaTeX backslashes aloud; write 'x squared' instead of 'x^2' in spokenScript).",
      ]
        .filter(Boolean)
        .join("\n");

      parts.push({ text: promptLines });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedEquation: {
                type: Type.STRING,
                description:
                  "The clean mathematical equation or problem statement detected from handwriting or text, e.g. '2x^2 - 8x + 6 = 0'",
              },
              category: {
                type: Type.STRING,
                description:
                  "Math topic category such as Algebra, Calculus, Geometry, Trigonometry, Linear Systems, or Arithmetic",
              },
              finalAnswer: {
                type: Type.STRING,
                description: "The concise final solved result, e.g. 'x = 1, x = 3'",
              },
              audioContextInsight: {
                type: Type.STRING,
                description:
                  "How Study Buddy incorporated the student's spoken voice note or context (or a friendly note on the approach chosen)",
              },
              buddyGreeting: {
                type: Type.STRING,
                description:
                  "A cute, encouraging 1-sentence opening from Study Buddy with personality!",
              },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepNumber: { type: Type.INTEGER },
                    title: {
                      type: Type.STRING,
                      description: "Short action title for this step",
                    },
                    mathExpression: {
                      type: Type.STRING,
                      description:
                        "The intermediate equation or transformation at this step",
                    },
                    explanation: {
                      type: Type.STRING,
                      description:
                        "Clear written explanation of why we do this step",
                    },
                    spokenScript: {
                      type: Type.STRING,
                      description:
                        "Natural, human-like spoken sentence for Study Buddy to say aloud for this step (write out math symbols in plain spoken English)",
                    },
                    buddyMood: {
                      type: Type.STRING,
                      description:
                        "One of: thinking, talking, happy, excited, focused, curious",
                    },
                    tip: {
                      type: Type.STRING,
                      description:
                        "Optional quick memory trick or common mistake to watch out for",
                    },
                  },
                  required: [
                    "stepNumber",
                    "title",
                    "mathExpression",
                    "explanation",
                    "spokenScript",
                    "buddyMood",
                  ],
                },
              },
              comprehensionCheck: {
                type: Type.OBJECT,
                properties: {
                  question: {
                    type: Type.STRING,
                    description:
                      "A quick, motivating interactive check-in question to test if the student understood the key step",
                  },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "3 short multiple-choice options",
                  },
                  correctIndex: {
                    type: Type.INTEGER,
                    description: "0-based index of the correct option",
                  },
                  encouragementOnCorrect: {
                    type: Type.STRING,
                    description:
                      "Cute celebration message when the student gets it right",
                  },
                  hintOnRetry: {
                    type: Type.STRING,
                    description: "Gentle helpful hint if they pick another option",
                  },
                },
                required: [
                  "question",
                  "options",
                  "correctIndex",
                  "encouragementOnCorrect",
                  "hintOnRetry",
                ],
              },
            },
            required: [
              "detectedEquation",
              "category",
              "finalAnswer",
              "audioContextInsight",
              "buddyGreeting",
              "steps",
              "comprehensionCheck",
            ],
          },
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        throw new Error("Empty response from model");
      }
      const parsed = JSON.parse(rawText);
      return res.json({
        engine: "Gemma 4 Edge + Cloud Neural Assist",
        solution: parsed,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("Solve API error (falling back to local edge):", msg);
      return res.status(200).json({
        fallbackToLocalEdge: true,
        message: msg,
      });
    }
  });

  // Transcribe audio note endpoint using gemini-3.5-transcribe
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body;
      const ai = getGenAIClient();
      if (!ai || !audioBase64) {
        return res.status(200).json({ fallbackToLocalEdge: true });
      }
      const cleanAudio = audioBase64.replace(/^data:audio\/[\w-]+;base64,/, "");
      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "audio/webm",
                data: cleanAudio,
              },
            },
            {
              text: "Transcribe the student's spoken math question or homework voice note accurately.",
            },
          ],
        },
      });
      return res.json({ transcript: response.text?.trim() || "" });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return res.status(200).json({ fallbackToLocalEdge: true, error: msg });
    }
  });

  // Natural Human-Like Voice TTS endpoint using gemini-3.8-flash-lite-tts
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, mood } = req.body;
      const ai = getGenAIClient();
      if (!ai || !text) {
        return res.status(200).json({ fallbackToOfflineTTS: true });
      }

      const styleMap: Record<string, string> = {
        happy: "Warm, cheerful, encouraging friendly study buddy tutor",
        excited: "Upbeat, enthusiastic, motivating young tutor",
        thinking: "Thoughtful, clear, step-by-step patient math tutor",
        talking: "Natural, warm, conversational and articulate tutor",
        curious: "Curious, inquisitive, friendly tutor asking a guiding question",
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text,
                speechMetadata: {
                  style:
                    styleMap[mood as string] ||
                    "Warm, friendly, encouraging math study buddy",
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return res.json({
          audioBase64: base64Audio,
          mimeType: "audio/wav",
        });
      }
      return res.status(200).json({ fallbackToOfflineTTS: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return res.status(200).json({ fallbackToOfflineTTS: true, error: msg });
    }
  });

  // Conversational Chat Bot & Reading Material Analyzer
  app.post("/api/chat", async (req, res) => {
    try {
      const {
        message,
        history,
        studentProfile,
        imageBase64,
        imageMimeType,
        uploadedText,
      } = req.body;

      const ai = getGenAIClient();
      if (!ai) {
        return res.status(200).json({ fallbackToLocalEdge: true });
      }

      const parts: Array<Record<string, unknown>> = [];

      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        parts.push({
          inlineData: {
            mimeType: imageMimeType || "image/png",
            data: cleanBase64,
          },
        });
      }

      const systemPrompt = [
        "You are Study Buddy, a warm, charismatic, encouraging, and expressive pocket homework companion and tutor.",
        "You are NOT just a math solver! You are a conversational tutor across ALL subjects: reading comprehension, science, history, English literature, creative writing, social studies, study motivation, and friendly conversation.",
        "Your goal is to be a supportive study partner. Get to know the student personally with natural back-and-forth conversation:",
        "- If you don't know their name or preferred nickname yet, ask warmly: 'By the way, what should I call you? Do you have a nickname you prefer?'",
        "- Ask what subject or homework they are working on today and what they need help with.",
        studentProfile?.name
          ? `The student's name is ${studentProfile.name}${studentProfile.nickname ? ` (nickname: ${studentProfile.nickname})` : ""}.`
          : "You do not know the student's name yet.",
        studentProfile?.currentNeed
          ? `Current study focus: ${studentProfile.currentNeed}`
          : "",
        uploadedText ? `Uploaded document or reading passage text: """${uploadedText}"""` : "",
        "If an image or reading passage is provided:",
        "- Extract the Main Idea (central thesis or core argument)",
        "- Extract key Factual Information & Evidence (bullet points)",
        "- Define any challenging Vocabulary terms",
        "- Provide a helpful conclusion or discussion question.",
        "Return structured JSON matching the schema.",
        "Make spokenSummary friendly, concise (1-2 sentences), upbeat, and ready for TTS voice playback without markdown syntax.",
      ]
        .filter(Boolean)
        .join("\n");

      // Format previous chat turns
      let conversationContext = "";
      if (Array.isArray(history) && history.length > 0) {
        conversationContext = history
          .slice(-6)
          .map(
            (turn: { sender: string; text: string }) =>
              `${turn.sender === "user" ? "Student" : "Study Buddy"}: ${turn.text}`
          )
          .join("\n");
      }

      const userPrompt = [
        systemPrompt,
        conversationContext ? `Recent conversation:\n${conversationContext}` : "",
        `Current student input: "${message || (imageBase64 ? "Please analyze this scanned reading material or homework document!" : "Hi!")}"`,
      ]
        .filter(Boolean)
        .join("\n\n");

      parts.push({ text: userPrompt });

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              replyText: {
                type: Type.STRING,
                description:
                  "Comprehensive, friendly response text formatted with clear paragraphs or bullet points for the chat screen",
              },
              spokenSummary: {
                type: Type.STRING,
                description:
                  "1 to 2 warm, natural sentences for Study Buddy to speak aloud to the student",
              },
              buddyMood: {
                type: Type.STRING,
                description:
                  "One of: happy, excited, thinking, curious, talking",
              },
              learnedStudentInfo: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  nickname: { type: Type.STRING },
                  currentNeed: { type: Type.STRING },
                  favoriteSubject: { type: Type.STRING },
                },
              },
              readingAnalysis: {
                type: Type.OBJECT,
                properties: {
                  mainIdea: { type: Type.STRING },
                  facts: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  vocabulary: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        term: { type: Type.STRING },
                        definition: { type: Type.STRING },
                      },
                      required: ["term", "definition"],
                    },
                  },
                  takeaway: { type: Type.STRING },
                },
              },
            },
            required: ["replyText", "spokenSummary", "buddyMood"],
          },
        },
      });

      const raw = response.text?.trim();
      if (!raw) throw new Error("Empty response from model");
      const parsed = JSON.parse(raw);
      return res.json({ chatReply: parsed });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return res.status(200).json({ fallbackToLocalEdge: true, error: msg });
    }
  });

  // ==========================================
  // LOCAL LLM HOOKS & PROVIDER CONTROLLER
  // ==========================================

  const DEFAULT_LLM_PROVIDERS: LlmProviderConfig[] = [
    {
      id: "local-edge",
      name: "Gemma 4 Edge (In-Browser Offline)",
      type: "local-edge",
      baseUrl: "browser://webgpu-wasm",
      model: "Gemma-4-Edge-Math-4B-IT",
      isEnabled: true,
      isReachable: true,
      statusMessage: "Default embedded offline symbolic & heuristic engine",
    },
    {
      id: "ollama-local",
      name: "Ollama (Local Server)",
      type: "ollama",
      baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: "llama3.2",
      isEnabled: false,
      statusMessage: "Connects to local Ollama daemon for offline open weights",
    },
    {
      id: "custom-openai",
      name: "LM Studio / Custom Local Server",
      type: "custom-server",
      baseUrl: process.env.CUSTOM_LLM_BASE_URL || "http://localhost:1234/v1",
      model: "local-model",
      isEnabled: false,
      statusMessage: "OpenAI-compatible local server (LM Studio, vLLM, LocalAI)",
    },
    {
      id: "grok-xai",
      name: "xAI Grok",
      type: "grok",
      baseUrl: "https://api.x.ai/v1",
      model: "grok-2-latest",
      apiKey: process.env.GROK_API_KEY || "",
      isEnabled: Boolean(process.env.GROK_API_KEY),
      statusMessage: "xAI Grok 2 reasoning & code analysis model",
    },
    {
      id: "gemini-cloud",
      name: "Google Gemini Cloud Neural",
      type: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-3.8-flash",
      isEnabled: Boolean(
        process.env.GEMINI_API_KEY &&
          process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
      ),
      isReachable: Boolean(
        process.env.GEMINI_API_KEY &&
          process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
      ),
      statusMessage: "Multimodal Gemini 3.8 Flash for handwriting scanning & speech",
    },
  ];

  let currentActiveProvider: LlmProviderConfig = DEFAULT_LLM_PROVIDERS[0];

  // List all available LLM providers and active hook
  app.get("/api/llm/providers", (_req, res) => {
    res.json({
      activeProvider: currentActiveProvider,
      providers: DEFAULT_LLM_PROVIDERS.map((p) =>
        p.id === currentActiveProvider.id
          ? { ...p, isEnabled: true }
          : { ...p, isEnabled: false }
      ),
    });
  });

  // Set active LLM provider hook
  app.post("/api/llm/select", (req, res) => {
    const { provider } = req.body;
    if (provider && provider.type) {
      currentActiveProvider = provider;
      return res.json({ success: true, activeProvider: currentActiveProvider });
    }
    return res.status(400).json({ error: "Invalid provider configuration" });
  });

  // Test connection to any LLM provider (Ollama, LM Studio, Grok, Gemini)
  app.post("/api/llm/test", async (req, res) => {
    try {
      const config: LlmProviderConfig = req.body;
      const result = await testLlmProviderConnection(config);
      return res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Test failed";
      return res.json({
        success: false,
        error: msg,
        latencyMs: 0,
      });
    }
  });

  // ==========================================
  // GROK BOT CODEBASE HARNESS ENDPOINTS
  // ==========================================

  // Grok Bot status & runtime diagnostics
  app.get("/api/grok-bot/status", (_req, res) => {
    res.json({
      status: "ready",
      harnessVersion: "1.0.0-grok-bot",
      activeProvider: currentActiveProvider,
      hasGrokKey: Boolean(process.env.GROK_API_KEY),
      workspaceDir: process.cwd(),
      nodeVersion: process.version,
      platform: process.platform,
    });
  });

  // Project file tree for Grok Bot inspection
  app.get("/api/grok-bot/tree", (_req, res) => {
    try {
      const tree = getProjectFileTree();
      res.json({ tree });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to load tree";
      res.status(500).json({ error: msg });
    }
  });

  // Read file contents for Grok Bot
  app.post("/api/grok-bot/read", (req, res) => {
    try {
      const { path: filePath } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: "File path is required" });
      }
      const data = readSourceCodeFile(filePath);
      return res.json(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Read error";
      return res.status(404).json({ error: msg });
    }
  });

  // Search codebase for tokens / functions
  app.post("/api/grok-bot/search", (req, res) => {
    try {
      const { query } = req.body;
      if (!query) {
        return res.json({ matches: [] });
      }
      const matches = searchCodebase(query);
      return res.json({ matches });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Search error";
      return res.status(500).json({ error: msg });
    }
  });

  // Apply surgical patch or file update
  app.post("/api/grok-bot/patch", (req, res) => {
    try {
      const patch = req.body;
      const result = applyCodePatch(patch);
      return res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Patch error";
      return res.status(400).json({ success: false, error: msg });
    }
  });

  // TypeScript verification test runner
  app.post("/api/grok-bot/verify", async (_req, res) => {
    try {
      const result = await verifyCodebase();
      return res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Verify error";
      return res.status(500).json({ success: false, error: msg });
    }
  });

  // Autonomous Grok Bot analysis loop
  app.post("/api/grok-bot/analyze-and-change", async (req, res) => {
    try {
      const request = req.body;
      const result = await runGrokBotAnalysis(request, currentActiveProvider);
      return res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Grok Bot analysis error";
      return res.status(500).json({
        task: req.body?.task || "Code analysis",
        analysisText: `Grok Bot encountered an error: ${msg}`,
        rationale: "Execution aborted due to provider error",
        steps: [{ title: "Analysis Failed", details: msg, status: "failed" }],
        filesInspected: [],
        proposedChanges: [],
        modelUsed: "error",
      });
    }
  });


  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Study Buddy server running on http://localhost:${PORT}`);
  });
}

startServer();
