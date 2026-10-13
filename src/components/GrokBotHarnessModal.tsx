import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Cpu,
  FileCode2,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Terminal,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  GrokBotAnalysisResult,
  GrokBotFileNode,
  GrokBotVerifyResult,
  LlmProviderConfig,
  LlmTestResult,
} from "../types/llmAndGrok";
import { soundEngine } from "../services/localGemmaEdgeEngine";

interface GrokBotHarnessModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProvider: LlmProviderConfig;
  onSelectProvider: (provider: LlmProviderConfig) => void;
}

export const GrokBotHarnessModal: React.FC<GrokBotHarnessModalProps> = ({
  isOpen,
  onClose,
  activeProvider,
  onSelectProvider,
}) => {
  const [activeTab, setActiveTab] = useState<"providers" | "grok-bot" | "files">("providers");

  // Providers state
  const [providers, setProviders] = useState<LlmProviderConfig[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(activeProvider.id);
  const [editConfig, setEditConfig] = useState<LlmProviderConfig>(activeProvider);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null);

  // Grok Bot state
  const [taskPrompt, setTaskPrompt] = useState(
    "Analyze the speech concurrency lock in App.tsx and verify that overlapping voices cannot occur."
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<GrokBotAnalysisResult | null>(null);
  const [autoApplyPatch, setAutoApplyPatch] = useState(false);

  // File tree & reader state
  const [fileTree, setFileTree] = useState<GrokBotFileNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    src: true,
    "src/components": true,
    server: true,
  });
  const [selectedFile, setSelectedFile] = useState<string>("src/App.tsx");
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ path: string; line: number; text: string }>>([]);

  // Verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<GrokBotVerifyResult | null>(null);

  // Fetch providers list on mount
  useEffect(() => {
    if (isOpen) {
      fetch("/api/llm/providers")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.providers)) {
            setProviders(data.providers);
            const current = data.providers.find((p: LlmProviderConfig) => p.id === activeProvider.id) || data.activeProvider;
            if (current) {
              setSelectedProviderId(current.id);
              setEditConfig(current);
            }
          }
        })
        .catch(() => {});

      // Fetch file tree
      fetch("/api/grok-bot/tree")
        .then((r) => r.json())
        .then((d) => {
          if (d.tree) setFileTree(d.tree);
        })
        .catch(() => {});
    }
  }, [isOpen, activeProvider.id]);

  // Load file content when selected
  useEffect(() => {
    if (isOpen && selectedFile) {
      setIsLoadingFile(true);
      fetch("/api/grok-bot/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFile }),
      })
        .then((r) => r.json())
        .then((d) => {
          setFileContent(d.content || "");
          setIsLoadingFile(false);
        })
        .catch(() => {
          setIsLoadingFile(false);
        });
    }
  }, [isOpen, selectedFile]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    soundEngine.playKeyClick(1.05);
    setTestingConnection(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editConfig),
      });
      const data: LlmTestResult = await res.json();
      setTestResult(data);
      if (data.success && data.availableModels && data.availableModels.length > 0) {
        setEditConfig((prev) => ({
          ...prev,
          availableModels: data.availableModels,
          model: prev.model || data.availableModels[0],
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setTestResult({
        success: false,
        provider: editConfig.type,
        baseUrl: editConfig.baseUrl,
        model: editConfig.model,
        latencyMs: 0,
        availableModels: [],
        message: msg,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleApplyProvider = async () => {
    soundEngine.playBuddyChime("happy");
    try {
      await fetch("/api/llm/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: editConfig }),
      });
    } catch {}
    onSelectProvider(editConfig);
    onClose();
  };

  const handleRunGrokAnalysis = async () => {
    soundEngine.playBuddyChime("scan");
    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const res = await fetch("/api/grok-bot/analyze-and-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: taskPrompt,
          autoApplyPatch,
          providerOverride: editConfig,
        }),
      });
      const data: GrokBotAnalysisResult = await res.json();
      setAnalysisResult(data);
      if (data.verification) {
        setVerifyResult(data.verification);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      setAnalysisResult({
        task: taskPrompt,
        analysisText: `Error: ${msg}`,
        rationale: "Failed to connect to provider.",
        steps: [{ title: "Analysis Failed", details: msg, status: "failed" }],
        filesInspected: [],
        proposedChanges: [],
        modelUsed: "error",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVerifyCodebase = async () => {
    soundEngine.playKeyClick(1.0);
    setIsVerifying(true);
    try {
      const res = await fetch("/api/grok-bot/verify", { method: "POST" });
      const data: GrokBotVerifyResult = await res.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({
        success: false,
        exitCode: 1,
        output: "Failed to run verify endpoint",
        durationMs: 0,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSearchCode = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch("/api/grok-bot/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      setSearchResults(data.matches || []);
    } catch {}
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderFileNode = (node: GrokBotFileNode) => {
    const isExpanded = expandedFolders[node.path];
    if (node.isDirectory) {
      return (
        <div key={node.path} className="text-xs">
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            className="w-full text-left py-1 px-1.5 rounded hover:bg-white/5 flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="font-mono truncate">{node.name}</span>
          </button>
          {isExpanded && node.children && (
            <div className="pl-3 border-l border-white/10 ml-2 space-y-0.5 mt-0.5">
              {node.children.map((child) => renderFileNode(child))}
            </div>
          )}
        </div>
      );
    }

    const isSelected = selectedFile === node.path;
    return (
      <button
        key={node.path}
        type="button"
        onClick={() => {
          soundEngine.playKeyClick(0.95);
          setSelectedFile(node.path);
        }}
        className={`w-full text-left py-1 px-1.5 rounded flex items-center justify-between text-xs transition-colors cursor-pointer ${
          isSelected
            ? "bg-[#EF5B14]/20 text-[#FF8547] font-semibold border-l-2 border-[#EF5B14]"
            : "hover:bg-white/5 text-slate-400 hover:text-slate-200"
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <FileCode2 className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
          <span className="font-mono truncate">{node.name}</span>
        </div>
        {node.lines !== undefined && (
          <span className="text-[10px] font-mono text-slate-400 shrink-0">
            {node.lines}L
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-label="Local LLM Hooks & Grok Bot Harness"
    >
      <div className="relative w-full max-w-5xl h-[88vh] bg-[#16181D] border border-white/15 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#1B1E24]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#EF5B14]/20 border border-[#EF5B14]/40">
              <Bot className="w-5 h-5 text-[#EF5B14]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Local LLM Hooks &amp; Grok Bot Backend Harness
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 font-semibold">
                  LIVE HARNESS READY
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Connect Ollama, LM Studio, or Grok Bot to inspect codebase architecture and execute verified code edits.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Strip */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 bg-[#1B1E24] border-b border-white/10 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("providers")}
            className={`px-3.5 py-1.5 rounded-xl flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === "providers"
                ? "bg-[#EF5B14] text-white font-semibold shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>1. Local LLM Hooks &amp; Providers</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("grok-bot")}
            className={`px-3.5 py-1.5 rounded-xl flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === "grok-bot"
                ? "bg-[#EF5B14] text-white font-semibold shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>2. Grok Bot Codebase Agent</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("files")}
            className={`px-3.5 py-1.5 rounded-xl flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === "files"
                ? "bg-[#EF5B14] text-white font-semibold shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>3. Source Code Inspector</span>
          </button>

          {/* Quick Verify button in tab header */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleVerifyCodebase}
              disabled={isVerifying}
              title="Run TypeScript lint check"
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
            >
              {isVerifying ? (
                <Loader2 className="w-3 h-3 animate-spin text-[#EF5B14]" />
              ) : (
                <Terminal className="w-3 h-3 text-[#EF5B14]" />
              )}
              <span>Verify Build (tsc)</span>
            </button>
          </div>
        </div>

        {/* TAB 1: LOCAL LLM PROVIDER HOOKS */}
        {activeTab === "providers" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 oled-scroll">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {providers.map((p) => {
                const isSelected = selectedProviderId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playKeyClick(1.0);
                      setSelectedProviderId(p.id);
                      setEditConfig(p);
                      setTestResult(null);
                    }}
                    className={`text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "bg-[#EF5B14]/15 border-[#EF5B14] shadow-md shadow-[#EF5B14]/10"
                        : "bg-[#1E2128] border-white/10 hover:border-white/25"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
                        <span className="uppercase text-[10px] text-[#EF5B14] font-bold">
                          {p.type}
                        </span>
                        {p.id === activeProvider.id && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-semibold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-white text-sm">{p.name}</h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {p.statusMessage}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-slate-400 truncate">
                      <span className="truncate">{p.baseUrl}</span>
                      <span className="text-cyan-300 shrink-0">{p.model}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Provider Configuration Card */}
            <div className="bg-[#1C1F26] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#EF5B14]" />
                  <h3 className="font-bold text-white text-sm">
                    Configure Hook: {editConfig.name}
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Type: {editConfig.type}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Host / Base URL */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Server Base URL
                  </label>
                  <input
                    type="text"
                    value={editConfig.baseUrl}
                    onChange={(e) =>
                      setEditConfig((prev) => ({ ...prev, baseUrl: e.target.value }))
                    }
                    placeholder="e.g. http://localhost:11434 or http://localhost:1234/v1"
                    className="w-full bg-black/50 border border-white/15 focus:border-[#EF5B14] rounded-xl px-3 py-2 font-mono text-white outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ollama default: <code>http://localhost:11434</code> · LM Studio default: <code>http://localhost:1234/v1</code>
                  </p>
                </div>

                {/* Model Name */}
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Model Identifier
                  </label>
                  <input
                    type="text"
                    value={editConfig.model}
                    onChange={(e) =>
                      setEditConfig((prev) => ({ ...prev, model: e.target.value }))
                    }
                    placeholder="e.g. llama3.2, grok-2-latest, gemma2, qwen2.5-coder"
                    className="w-full bg-black/50 border border-white/15 focus:border-[#EF5B14] rounded-xl px-3 py-2 font-mono text-white outline-none"
                  />
                  {editConfig.availableModels && editConfig.availableModels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="text-[10.5px] text-slate-400">Detected:</span>
                      {editConfig.availableModels.slice(0, 4).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setEditConfig((prev) => ({ ...prev, model: m }))}
                          className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-mono text-cyan-300 cursor-pointer"
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* API Key (if required for Grok or private endpoint) */}
                {editConfig.type !== "local-edge" && (
                  <div className="md:col-span-2">
                    <label className="block text-slate-300 font-medium mb-1">
                      API Key (Optional for local Ollama / LM Studio; Required for Grok)
                    </label>
                    <input
                      type="password"
                      value={editConfig.apiKey || ""}
                      onChange={(e) =>
                        setEditConfig((prev) => ({ ...prev, apiKey: e.target.value }))
                      }
                      placeholder={
                        editConfig.type === "grok"
                          ? "Enter xAI Grok API key (starts with xai-...)"
                          : "Optional Bearer API token"
                      }
                      className="w-full bg-black/50 border border-white/15 focus:border-[#EF5B14] rounded-xl px-3 py-2 font-mono text-white outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Test Connection Output */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                    testResult.success
                      ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-200"
                      : "bg-red-500/10 border-red-400/30 text-red-200"
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-semibold">
                      {testResult.success ? "Connection Verified!" : "Connection Error"} (
                      {testResult.latencyMs}ms)
                    </div>
                    <p className="mt-0.5 text-[11px] opacity-90">{testResult.message}</p>
                  </div>
                </div>
              )}

              {/* Actions: Test Connection & Apply as Active */}
              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-xs flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {testingConnection ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#EF5B14]" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 text-[#EF5B14]" />
                  )}
                  <span>Test Provider Ping</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyProvider}
                  className="px-5 py-2 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] text-white font-semibold text-xs flex items-center gap-2 cursor-pointer transition-all shadow-md active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Set as Active Study Buddy LLM</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GROK BOT CODEBASE AGENT HARNESS */}
        {activeTab === "grok-bot" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5 oled-scroll">
            {/* Task Prompt Input */}
            <div className="bg-[#1C1F26] border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#EF5B14]" />
                  <h3 className="font-bold text-white text-sm">
                    Grok Bot Autonomous Code Analyzer &amp; Modifier
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Using: {editConfig.name} ({editConfig.model})
                </span>
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">
                  Task or Code Analysis Instructions for Grok Bot:
                </label>
                <textarea
                  rows={3}
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder="Ask Grok Bot to inspect components, diagnose architecture, or propose code modifications..."
                  className="w-full bg-black/60 border border-white/15 focus:border-[#EF5B14] rounded-xl p-3 text-xs text-white placeholder:text-slate-500 outline-none leading-relaxed font-mono"
                />
              </div>

              {/* Quick Prompt Presets */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] text-slate-400">Quick Tasks:</span>
                {[
                  "Analyze speech concurrency lock in App.tsx",
                  "Review Local Gemma Edge math solver logic",
                  "Check Reading Material Analyzer and schema",
                  "Inspect OledScreenDisplay component states",
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTaskPrompt(preset)}
                    className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] cursor-pointer transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Execution Bar */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoApplyPatch}
                    onChange={(e) => setAutoApplyPatch(e.target.checked)}
                    className="rounded text-[#EF5B14] focus:ring-0"
                  />
                  <span>Auto-verify TypeScript after analysis</span>
                </label>

                <button
                  type="button"
                  onClick={handleRunGrokAnalysis}
                  disabled={isAnalyzing || !taskPrompt.trim()}
                  className="px-5 py-2 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer transition-all shadow-md"
                >
                  {isAnalyzing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>{isAnalyzing ? "Grok Bot Analyzing..." : "Run Grok Bot Analysis"}</span>
                </button>
              </div>
            </div>

            {/* Analysis Output Section */}
            {analysisResult && (
              <div className="bg-[#1C1F26] border border-white/10 rounded-2xl p-5 space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <h4 className="font-bold text-white text-sm">
                      Grok Bot Analysis Diagnosis &amp; Findings
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-300">
                    Engine: {analysisResult.modelUsed}
                  </span>
                </div>

                {/* Analysis Text */}
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 text-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                  {analysisResult.analysisText}
                </div>

                {/* Rationale */}
                {analysisResult.rationale && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/20 text-xs">
                    <span className="font-bold text-amber-300 block mb-0.5">
                      Engineering Rationale:
                    </span>
                    <p className="text-amber-100">{analysisResult.rationale}</p>
                  </div>
                )}

                {/* Inspected Files */}
                {analysisResult.filesInspected.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-slate-300 block mb-1.5">
                      Files Inspected by Grok Bot:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {analysisResult.filesInspected.map((f, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proposed Code Changes */}
                {analysisResult.proposedChanges.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <span className="text-xs font-semibold text-white block">
                      Proposed Code Modifications ({analysisResult.proposedChanges.length}):
                    </span>
                    {analysisResult.proposedChanges.map((change, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className="text-[#EF5B14] font-bold">{change.filePath}</span>
                          <span className="text-slate-400">{change.description}</span>
                        </div>
                        <pre className="p-2.5 rounded-lg bg-black/80 border border-white/5 text-[11px] font-mono text-cyan-200 overflow-x-auto oled-scroll">
                          {change.diffSnippet}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {/* Verification result if available */}
                {verifyResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-mono ${
                      verifyResult.success
                        ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-200"
                        : "bg-red-500/10 border-red-400/30 text-red-200"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span>TypeScript Verification Status</span>
                      <span>{verifyResult.success ? "PASSED (0 errors)" : "FAILED"}</span>
                    </div>
                    <pre className="text-[11px] whitespace-pre-wrap">{verifyResult.output}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SOURCE CODE EXPLORER */}
        {activeTab === "files" && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left file tree and search bar */}
            <div className="w-64 border-r border-white/10 p-3 flex flex-col justify-between bg-[#191B21]">
              <div>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearchCode();
                    }}
                    placeholder="Search codebase..."
                    className="w-full bg-black/50 border border-white/10 focus:border-[#EF5B14] rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none"
                  />
                </div>

                <div className="overflow-y-auto max-h-[60vh] space-y-0.5 oled-scroll pr-1">
                  {fileTree && renderFileNode(fileTree)}
                </div>
              </div>

              {/* Search results popup if active */}
              {searchResults.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/10 max-h-36 overflow-y-auto text-xs oled-scroll">
                  <div className="text-[10px] text-slate-400 font-mono mb-1">
                    Matches ({searchResults.length}):
                  </div>
                  {searchResults.slice(0, 10).map((m, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedFile(m.path)}
                      className="w-full text-left p-1 rounded hover:bg-white/5 truncate font-mono text-[10.5px] text-slate-300 block"
                    >
                      <span className="text-[#EF5B14]">{m.path}:{m.line}</span> {m.text}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right code content viewer */}
            <div className="flex-1 flex flex-col bg-[#121418] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#17191F] text-xs font-mono">
                <span className="text-white font-bold">{selectedFile}</span>
                <span className="text-slate-400">
                  {fileContent ? `${fileContent.split("\n").length} lines` : ""}
                </span>
              </div>

              <div className="flex-1 overflow-auto p-4 oled-scroll font-mono text-xs leading-relaxed text-slate-200">
                {isLoadingFile ? (
                  <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-[#EF5B14]" />
                    <span>Loading file...</span>
                  </div>
                ) : (
                  <pre className="text-[11.5px]">{fileContent}</pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
