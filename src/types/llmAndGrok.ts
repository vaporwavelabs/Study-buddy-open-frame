export type LlmProviderType =
  | "local-edge"
  | "ollama"
  | "custom-server";

export interface LlmProviderConfig {
  id: string;
  name: string;
  type: LlmProviderType;
  baseUrl: string;
  model: string;
  apiKey?: string;
  isEnabled: boolean;
  isReachable?: boolean;
  latencyMs?: number;
  availableModels?: string[];
  statusMessage?: string;
}

export interface LlmTestResult {
  success: boolean;
  provider: LlmProviderType;
  baseUrl: string;
  model: string;
  latencyMs: number;
  availableModels: string[];
  message: string;
}

export interface GrokBotFileNode {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  lines?: number;
  role?: "component" | "service" | "server" | "type" | "config" | "style" | "doc" | "other";
  children?: GrokBotFileNode[];
}

export interface GrokBotPatchRequest {
  filePath: string;
  targetContent?: string;
  replacementContent?: string;
  fullFileContent?: string;
  description: string;
}

export interface GrokBotPatchResult {
  success: boolean;
  filePath: string;
  linesChanged: number;
  message: string;
  backupPath?: string;
}

export interface GrokBotVerifyResult {
  success: boolean;
  exitCode: number;
  output: string;
  durationMs: number;
}

export interface GrokBotAnalysisRequest {
  task: string;
  targetFiles?: string[];
  autoApplyPatch?: boolean;
}

export interface GrokBotAnalysisStep {
  title: string;
  details: string;
  status: "complete" | "in-progress" | "failed";
}

export interface GrokBotAnalysisResult {
  task: string;
  analysisText: string;
  rationale: string;
  steps: GrokBotAnalysisStep[];
  filesInspected: string[];
  proposedChanges: Array<{
    filePath: string;
    description: string;
    diffSnippet: string;
    applied?: boolean;
  }>;
  verification?: GrokBotVerifyResult;
  modelUsed: string;
}
