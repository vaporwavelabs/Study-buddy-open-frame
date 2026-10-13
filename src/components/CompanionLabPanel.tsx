import React, { useRef, useState } from "react";
import {
  AudioLines,
  BookOpen,
  Bot,
  Camera,
  CheckCircle2,
  Cpu,
  FileText,
  Lightbulb,
  Mic,
  Paperclip,
  Play,
  Sparkles,
  Upload,
  User,
  Volume2,
  Wrench,
} from "lucide-react";
import {
  ExplanationDepth,
  HandwrittenPreset,
  MathSolution,
  ReadingPreset,
  StudentProfile,
} from "../types/studyBuddy";
import { LlmProviderConfig } from "../types/llmAndGrok";
import {
  HANDWRITTEN_PRESETS,
  READING_PRESETS,
  soundEngine,
} from "../services/localGemmaEdgeEngine";

interface CompanionLabPanelProps {
  solution: MathSolution;
  activeStepIndex: number;
  isSpeaking: boolean;
  isRecordingAudio: boolean;
  offlineOnlyMode: boolean;
  explanationDepth: ExplanationDepth;
  voiceNoteInput: string;
  history: MathSolution[];
  studentProfile: StudentProfile;
  activeLlmProvider: LlmProviderConfig;
  onOpenGrokModal: () => void;
  onSelectStep: (idx: number) => void;
  onSpeakStep: (idx: number) => void;
  onSpeakAllSteps: () => void;
  onSpeakText: (text: string) => void;
  onToggleOfflineMode: () => void;
  onChangeDepth: (depth: ExplanationDepth) => void;
  onChangeVoiceNote: (val: string) => void;
  onToggleRecordAudio: () => void;
  onQuickScanPreset: (preset: HandwrittenPreset) => void;
  onSelectHistoryItem: (item: MathSolution) => void;
  onAnalyzeReadingPreset: (preset: ReadingPreset) => void;
  onUploadFileForAnalysis: (fileBase64: string, fileName: string) => void;
}

export const CompanionLabPanel: React.FC<CompanionLabPanelProps> = ({
  solution,
  activeStepIndex,
  isSpeaking,
  isRecordingAudio,
  offlineOnlyMode,
  explanationDepth,
  voiceNoteInput,
  history,
  studentProfile,
  activeLlmProvider,
  onOpenGrokModal,
  onSelectStep,
  onSpeakStep,
  onSpeakAllSteps,
  onSpeakText,
  onToggleOfflineMode,
  onChangeDepth,
  onChangeVoiceNote,
  onToggleRecordAudio,
  onQuickScanPreset,
  onSelectHistoryItem,
  onAnalyzeReadingPreset,
  onUploadFileForAnalysis,
}) => {
  const [activeTab, setActiveTab] = useState<"math" | "reading">("math");
  const [activeReadingPreset, setActiveReadingPreset] = useState<ReadingPreset>(
    READING_PRESETS[0]
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const quickVoicePrompts = [
    "Factor out the GCF first before solving",
    "Explain why the sign flips like I'm 10",
    "Show how to plug the answer back in to verify",
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        soundEngine.playBuddyChime("scan");
        onUploadFileForAnalysis(reader.result, file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-5 text-slate-100">
      {/* Top Edge Engine & Workbench Mode Switcher */}
      <div className="bg-[#212328] border border-white/10 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="text-xs font-mono text-slate-400">
              LOCAL EDGE COMPUTE &amp; MULTIMODAL TUTOR
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight mt-0.5">
              Study Buddy Companion Lab
            </h2>
          </div>

          {/* Tab Switcher: Math Homework vs Reading Material & Chat */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playKeyClick(1.0);
                  setActiveTab("math");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                  activeTab === "math"
                    ? "bg-[#EF5B14] text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>🧮 Math Homework Lab</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playKeyClick(1.0);
                  setActiveTab("reading");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                  activeTab === "reading"
                    ? "bg-[#EF5B14] text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>📖 Reading &amp; Chat Lab</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleOfflineMode}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                offlineOnlyMode
                  ? "bg-emerald-500/15 border-emerald-400/50 text-emerald-300"
                  : "bg-white/[0.06] border-white/15 text-slate-200 hover:bg-white/10"
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-[#EF5B14]" />
              <span className="hidden sm:inline">
                {offlineOnlyMode ? "Offline Edge" : "Neural Assist"}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenGrokModal}
              title="Open Grok Bot Codebase Harness & Local LLM Provider Hooks"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#EF5B14]/20 hover:bg-[#EF5B14]/30 border border-[#EF5B14]/40 text-[#FF8547] flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
            >
              <Bot className="w-3.5 h-3.5 text-[#EF5B14]" />
              <span className="hidden md:inline">Grok Bot / LLM:</span>
              <span className="font-mono text-white text-[11px] truncate max-w-[90px]">
                {activeLlmProvider.type === "local-edge" ? "Gemma Edge" : activeLlmProvider.model}
              </span>
            </button>
          </div>
        </div>

        {/* TAB 1: MATH LAB CONTROLS */}
        {activeTab === "math" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pt-4 animate-in fade-in duration-150">
            {/* Left: Handwritten Equation Scanner Presets */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-medium text-slate-200 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-[#EF5B14]" />
                  <span>Instant Handwritten Equation Scans</span>
                </span>
                <span>Click to scan onto device</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {HANDWRITTEN_PRESETS.slice(0, 4).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onQuickScanPreset(preset)}
                    className="text-left p-2.5 rounded-xl bg-black/35 hover:bg-black/55 border border-white/10 hover:border-[#EF5B14]/60 transition-all cursor-pointer group"
                  >
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>{preset.topic}</span>
                      <span className="text-[#EF5B14] opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                        Scan →
                      </span>
                    </div>
                    <div className="font-mono text-sm font-semibold text-white mt-0.5 truncate">
                      {preset.handwrittenLines[0]}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Speech & Audio Context Note Analyzer */}
            <div className="flex flex-col justify-between bg-black/35 rounded-xl p-3.5 border border-white/10">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                    <AudioLines className="w-3.5 h-3.5 text-[#EF5B14]" />
                    <span>Student Speech &amp; Audio Context Note</span>
                  </span>
                  <button
                    type="button"
                    onClick={onToggleRecordAudio}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 ${
                      isRecordingAudio
                        ? "bg-red-500 text-white animate-pulse"
                        : "bg-[#EF5B14] hover:bg-[#F46925] text-white"
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>
                      {isRecordingAudio ? "Listening..." : "Record Voice Note"}
                    </span>
                  </button>
                </div>

                <input
                  type="text"
                  value={voiceNoteInput}
                  onChange={(e) => onChangeVoiceNote(e.target.value)}
                  placeholder="Speak or type context (e.g., 'My teacher wants factoring')"
                  aria-label="Student speech context note"
                  className="w-full mt-2 bg-black/50 border border-white/15 focus:border-[#EF5B14] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none"
                />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {quickVoicePrompts.map((promptText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onChangeVoiceNote(promptText)}
                    className="text-[11px] text-slate-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] px-2 py-1 rounded-md transition-colors cursor-pointer truncate max-w-full"
                  >
                    &ldquo;{promptText}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: READING MATERIAL & CHAT LAB */}
        {activeTab === "reading" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pt-4 animate-in fade-in duration-150">
            {/* Left: Reading Material Presets */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="font-medium text-slate-200 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#EF5B14]" />
                  <span>Reading Material Scans &amp; Passages</span>
                </span>
                <span>Select to analyze</span>
              </div>
              <div className="space-y-2">
                {READING_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playKeyClick(1.05);
                      setActiveReadingPreset(preset);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      activeReadingPreset.id === preset.id
                        ? "bg-[#EF5B14]/15 border-[#EF5B14] text-white"
                        : "bg-black/35 hover:bg-black/55 border-white/10 text-slate-300"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-[#EF5B14]">
                        {preset.subject}
                      </div>
                      <div className="font-semibold text-sm text-white truncate">
                        {preset.title}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-slate-400 shrink-0">
                      View →
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Student Profile & Upload File Container */}
            <div className="flex flex-col justify-between bg-black/35 rounded-xl p-3.5 border border-white/10">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-[#EF5B14]" />
                    <span className="text-xs font-bold text-white">
                      Student Study Profile
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Auto-memorized by Buddy
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-slate-400">Name / Nickname</div>
                    <div className="font-semibold text-white mt-0.5">
                      {studentProfile.name ? studentProfile.nickname || studentProfile.name : "Not set yet (Tell Buddy!)"}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-slate-400">Current Focus</div>
                    <div className="font-semibold text-white mt-0.5 truncate">
                      {studentProfile.currentNeed || "All Subjects / Homework"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload Reading Document or Book Photo */}
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-[#EF5B14]" />
                  <span>Upload Book Photo or Document (.txt, .pdf)</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.txt,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* LOWER PANEL: MATH STEP DERIVATION OR READING ANALYSIS VIEW */}
      {activeTab === "math" ? (
        <div className="bg-[#212328] border border-white/10 rounded-2xl p-5 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                {solution.scannedImagePreview && (
                  <img
                    src={solution.scannedImagePreview}
                    alt="Scanned handwritten math equation"
                    referrerPolicy="no-referrer"
                    className="w-20 h-12 object-cover rounded-lg border border-white/20 shrink-0"
                  />
                )}
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{solution.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{solution.engineUsed}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{solution.timestamp}</span>
                  </div>
                  <div className="text-lg sm:text-xl font-mono font-bold text-white mt-0.5">
                    {solution.detectedEquation}{" "}
                    <span className="text-emerald-400 font-normal">⇒</span>{" "}
                    <span className="text-emerald-400">
                      {solution.finalAnswer}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onSpeakAllSteps}
                className="px-4 py-2 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isSpeaking
                    ? "Stop Voice Walkthrough"
                    : "Narrate All Steps Aloud"}
                </span>
              </button>
            </div>

            {/* Stepper Card */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {solution.steps.map((st, idx) => {
                const isActive = idx === activeStepIndex;
                return (
                  <div
                    key={st.stepNumber}
                    onClick={() => onSelectStep(idx)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? "bg-[#EF5B14]/15 border-[#EF5B14] shadow-md shadow-[#EF5B14]/10"
                        : "bg-black/25 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span
                          className={
                            isActive ? "text-[#EF5B14] font-bold" : "text-slate-400"
                          }
                        >
                          Step {st.stepNumber}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {st.title}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-sm font-semibold text-white truncate">
                        {st.mathExpression}
                      </div>
                      <p className="mt-1 text-xs text-slate-300 line-clamp-2">
                        {st.explanation}
                      </p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 italic capitalize">
                        {st.buddyMood}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSpeakStep(idx);
                        }}
                        className="text-[#EF5B14] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>Speak</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* READING PASSAGE ANALYZER CARD */
        <div className="bg-[#212328] border border-white/10 rounded-2xl p-5 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-[#EF5B14] font-semibold">
                    {activeReadingPreset.subject}
                  </span>
                  <span>·</span>
                  <span>{activeReadingPreset.authorOrSource}</span>
                </div>
                <h3 className="text-xl font-bold text-white mt-0.5">
                  {activeReadingPreset.title}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onSpeakText(
                      `Here is the main idea of ${activeReadingPreset.title}: ${activeReadingPreset.mainIdea}`
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5 text-[#EF5B14]" />
                  <span>Read Main Idea</span>
                </button>
                <button
                  type="button"
                  onClick={() => onAnalyzeReadingPreset(activeReadingPreset)}
                  className="px-4 py-2 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Send to Chat Tutor</span>
                </button>
              </div>
            </div>

            {/* Reading Material Excerpt */}
            <div className="mt-4 p-4 rounded-xl bg-black/30 border border-white/10 text-slate-200 text-sm leading-relaxed font-serif">
              <span className="text-xs font-mono text-[#EF5B14] block not-italic mb-1">
                PASSAGE EXCERPT:
              </span>
              &ldquo;{activeReadingPreset.excerpt}&rdquo;
            </div>

            {/* Analysis Grid: Main Idea, Key Facts, Vocabulary */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Main Idea Card */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wide mb-1">
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Central Main Idea</span>
                  </div>
                  <p className="text-xs text-amber-100 leading-relaxed">
                    {activeReadingPreset.mainIdea}
                  </p>
                </div>
              </div>

              {/* Key Facts Card */}
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 uppercase tracking-wide mb-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Key Factual Details</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-xs text-cyan-100">
                    {activeReadingPreset.facts.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Vocabulary Card */}
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300 uppercase tracking-wide mb-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Key Vocabulary</span>
                  </div>
                  <div className="space-y-1.5">
                    {activeReadingPreset.vocabulary.map((v, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-bold text-white">{v.term}:</span>{" "}
                        <span className="text-emerald-100">{v.definition}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
