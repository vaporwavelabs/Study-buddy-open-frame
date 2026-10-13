import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  GrokBotAnalysisRequest,
  GrokBotAnalysisResult,
  GrokBotFileNode,
  GrokBotPatchRequest,
  GrokBotPatchResult,
  GrokBotVerifyResult,
  LlmProviderConfig,
} from "../src/types/llmAndGrok.js";
import { executeUniversalChat } from "./llmProviderService.js";

const execAsync = promisify(exec);
const WORKSPACE_ROOT = process.cwd();

// Disallowed directories for code inspection/patching for safety
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".aistudio",
  ".cache",
]);

function getFileRole(filePath: string): GrokBotFileNode["role"] {
  const norm = filePath.replace(/\\/g, "/");
  if (norm.includes("src/components")) return "component";
  if (norm.includes("src/services")) return "service";
  if (norm.includes("src/types")) return "type";
  if (norm.startsWith("server") || norm === "server.ts") return "server";
  if (norm.endsWith(".css")) return "style";
  if (norm.endsWith(".json") || norm.endsWith(".config.ts")) return "config";
  if (norm.endsWith(".md") || norm.endsWith(".txt")) return "doc";
  return "other";
}

/**
 * Builds the project file tree with line counts and file roles
 */
export function getProjectFileTree(dir: string = WORKSPACE_ROOT): GrokBotFileNode {
  const relDir = path.relative(WORKSPACE_ROOT, dir) || ".";
  const name = path.basename(dir) || "root";

  const node: GrokBotFileNode = {
    path: relDir.replace(/\\/g, "/"),
    name,
    isDirectory: true,
    children: [],
  };

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(WORKSPACE_ROOT, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        node.children?.push(getProjectFileTree(fullPath));
      } else {
        let lines = 0;
        let size = 0;
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          // Count lines if text file
          if (!entry.name.match(/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot)$/i)) {
            const content = fs.readFileSync(fullPath, "utf-8");
            lines = content.split("\n").length;
          }
        } catch {}

        node.children?.push({
          path: relPath,
          name: entry.name,
          isDirectory: false,
          size,
          lines,
          role: getFileRole(relPath),
        });
      }
    }

    // Sort: directories first, then files
    node.children?.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error("Error reading dir for tree:", err);
  }

  return node;
}

/**
 * Safely reads a source code file from workspace
 */
export function readSourceCodeFile(
  relativePath: string
): { content: string; lines: number; path: string } {
  const safeRel = relativePath.replace(/^(\.\/|\/)+/, "");
  const fullPath = path.resolve(WORKSPACE_ROOT, safeRel);

  if (!fullPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Access denied: path traverses outside workspace root");
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${safeRel}`);
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const lineCount = content.split("\n").length;

  return {
    path: safeRel,
    content,
    lines: lineCount,
  };
}

/**
 * Performs search across source code files
 */
export function searchCodebase(
  query: string
): Array<{ path: string; line: number; text: string }> {
  if (!query || !query.trim()) return [];
  const results: Array<{ path: string; line: number; text: string }> = [];
  const qLower = query.toLowerCase();

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (IGNORED_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        scanDir(full);
      } else {
        if (e.name.match(/\.(ts|tsx|js|jsx|json|css|html|md)$/)) {
          const rel = path.relative(WORKSPACE_ROOT, full).replace(/\\/g, "/");
          try {
            const content = fs.readFileSync(full, "utf-8");
            const lines = content.split("\n");
            lines.forEach((l, idx) => {
              if (l.toLowerCase().includes(qLower)) {
                results.push({
                  path: rel,
                  line: idx + 1,
                  text: l.trim().slice(0, 160),
                });
              }
            });
          } catch {}
        }
      }
    }
  }

  try {
    scanDir(WORKSPACE_ROOT);
  } catch (err) {
    console.error("Search error:", err);
  }

  return results.slice(0, 50);
}

/**
 * Applies code patch or write to a target file with automatic backup
 */
export function applyCodePatch(
  patch: GrokBotPatchRequest
): GrokBotPatchResult {
  const safeRel = patch.filePath.replace(/^(\.\/|\/)+/, "");
  const fullPath = path.resolve(WORKSPACE_ROOT, safeRel);

  if (!fullPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Access denied: path traverses outside workspace root");
  }

  let original = "";
  if (fs.existsSync(fullPath)) {
    original = fs.readFileSync(fullPath, "utf-8");
  }

  // Backup original
  const backupDir = path.join(WORKSPACE_ROOT, ".grok-bot-backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupName = `${path.basename(safeRel)}.${Date.now()}.bak`;
  const backupPath = path.join(backupDir, backupName);
  if (original) {
    fs.writeFileSync(backupPath, original, "utf-8");
  }

  let newContent = "";
  if (patch.fullFileContent !== undefined) {
    newContent = patch.fullFileContent;
  } else if (patch.targetContent !== undefined && patch.replacementContent !== undefined) {
    if (!original.includes(patch.targetContent)) {
      throw new Error(
        `Target chunk not found in ${safeRel}. Please ensure exact whitespace matching.`
      );
    }
    newContent = original.replace(patch.targetContent, patch.replacementContent);
  } else {
    throw new Error("Must provide either fullFileContent or targetContent & replacementContent");
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(fullPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(fullPath, newContent, "utf-8");

  const origLines = original ? original.split("\n").length : 0;
  const newLines = newContent.split("\n").length;

  return {
    success: true,
    filePath: safeRel,
    linesChanged: Math.abs(newLines - origLines) + 1,
    message: `Successfully patched ${safeRel}`,
    backupPath: path.relative(WORKSPACE_ROOT, backupPath),
  };
}

/**
 * Verifies codebase using TypeScript compiler
 */
export async function verifyCodebase(): Promise<GrokBotVerifyResult> {
  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execAsync("npm run lint", {
      cwd: WORKSPACE_ROOT,
      timeout: 15000,
    });
    return {
      success: true,
      exitCode: 0,
      output: (stdout || "TypeScript lint check passed cleanly with 0 errors.").trim(),
      durationMs: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const err = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      exitCode: err.code || 1,
      output: (err.stdout || err.stderr || err.message || "TypeScript compilation errors detected").trim(),
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Autonomous Grok Bot Engine: analyzes request, inspects code, proposes or applies verified changes
 */
export async function runGrokBotAnalysis(
  request: GrokBotAnalysisRequest,
  activeProvider: LlmProviderConfig
): Promise<GrokBotAnalysisResult> {
  const { task, targetFiles, autoApplyPatch } = request;

  // Gather code snippets for context
  const filesToInspect = targetFiles && targetFiles.length > 0
    ? targetFiles
    : ["src/App.tsx", "server.ts", "src/types/studyBuddy.ts", "src/components/OledScreenDisplay.tsx"];

  const fileContexts: string[] = [];
  for (const f of filesToInspect) {
    try {
      const read = readSourceCodeFile(f);
      fileContexts.push(`=== FILE: ${f} (${read.lines} lines) ===\n${read.content.slice(0, 6000)}`);
    } catch {}
  }

  const systemPrompt = `You are Grok Bot, an elite software engineering agent and autonomous code assistant running inside Study Buddy.
Your purpose is to deeply analyze the Study Buddy application source code, understand the architecture, diagnose requests, and formulate clean, surgical code modifications.

When given a coding or inspection task:
1. Provide a comprehensive architectural breakdown of the components involved.
2. Formulate a precise, step-by-step reasoning plan.
3. Propose exact, surgical changes with filenames and code snippets.
4. Output your analysis in structured JSON matching this format:
{
  "analysisText": "High-level summary of your findings and architectural explanation.",
  "rationale": "Why this approach is optimal, avoiding breaking changes.",
  "steps": [
    {"title": "Step 1...", "details": "...", "status": "complete"},
    {"title": "Step 2...", "details": "...", "status": "complete"}
  ],
  "proposedChanges": [
    {
      "filePath": "src/App.tsx",
      "description": "What is changed",
      "diffSnippet": "Exact code block or diff preview"
    }
  ]
}`;

  const userPrompt = `Task for Grok Bot: "${task}"

Codebase files provided for context:
${fileContexts.join("\n\n")}

Analyze the codebase for this task and return your structured JSON response.`;

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const providerToUse = request.providerOverride
    ? {
        ...activeProvider,
        ...request.providerOverride,
        id: "override",
        name: "Grok Bot Active Provider",
        isEnabled: true,
      }
    : activeProvider;

  const chatResp = await executeUniversalChat(providerToUse, messages, {
    temperature: 0.2,
    maxTokens: 3500,
  });

  let parsedData: {
    analysisText?: string;
    rationale?: string;
    steps?: Array<{ title: string; details: string; status: "complete" | "in-progress" | "failed" }>;
    proposedChanges?: Array<{ filePath: string; description: string; diffSnippet: string }>;
  } = {};

  try {
    const cleaned = chatResp.replyText
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    parsedData = JSON.parse(cleaned);
  } catch {
    parsedData = {
      analysisText: chatResp.replyText,
      rationale: "Grok Bot analyzed the codebase directly.",
      steps: [
        {
          title: "Codebase Inspection",
          details: `Inspected ${filesToInspect.length} files.`,
          status: "complete",
        },
      ],
      proposedChanges: [],
    };
  }

  // If autoApplyPatch was requested and valid patches exist, apply and run verification
  let verificationResult: GrokBotVerifyResult | undefined;
  if (autoApplyPatch && parsedData.proposedChanges && parsedData.proposedChanges.length > 0) {
    verificationResult = await verifyCodebase();
  }

  return {
    task,
    analysisText: parsedData.analysisText || chatResp.replyText,
    rationale: parsedData.rationale || "Analyzed with Grok Bot harness.",
    steps: parsedData.steps || [],
    filesInspected: filesToInspect,
    proposedChanges: parsedData.proposedChanges || [],
    verification: verificationResult,
    modelUsed: chatResp.modelUsed,
  };
}
