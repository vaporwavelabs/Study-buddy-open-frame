import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Calculator as CalcIcon,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eraser,
  FileText,
  Keyboard as KeyboardIcon,
  MessageSquare,
  Mic,
  MicOff,
  PenTool,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
} from "lucide-react";
import {
  ChatMessage,
  HandwrittenPreset,
  MathSolution,
  ReadingPreset,
  ScreenMode,
  StudentProfile,
} from "../types/studyBuddy";
import {
  HANDWRITTEN_PRESETS,
  READING_PRESETS,
  renderHandwrittenSampleToDataUrl,
  renderReadingSampleToDataUrl,
  soundEngine,
} from "../services/localGemmaEdgeEngine";
import { ConversationalChatView } from "./ConversationalChatView";

interface OledScreenDisplayProps {
  screenMode: ScreenMode;
  solution: MathSolution;
  activeStepIndex: number;
  isSolving: boolean;
  isSpeaking: boolean;
  isRecordingAudio: boolean;
  equationInput: string;
  voiceNoteInput: string;
  offlineOnlyMode: boolean;
  showWelcomePrompt: boolean;
  hasSavedSession: boolean;
  previousSessionName?: string;
  chatMessages: ChatMessage[];
  studentProfile: StudentProfile;
  isSendingChatMessage: boolean;
  onSendChatMessage: (text: string, fileBase64?: string, fileName?: string) => void;
  onSelectReadingPreset: (presetId: string) => void;
  onSelectStep: (idx: number) => void;
  onSpeakStep: (idx: number) => void;
  onSpeakText: (text: string) => void;
  onChangeEquation: (val: string) => void;
  onChangeVoiceNote: (val: string) => void;
  onToggleRecordAudio: () => void;
  chatTitle?: string;
  onSolveEquation: (
    eqText: string,
    voiceText: string,
    imageBase64?: string
  ) => void;
  onSwitchScreenMode: (mode: ScreenMode) => void;
  onOpenKeyboard: (type: "calculator" | "qwerty") => void;
  onAnswerCheck: (isCorrect: boolean, message: string) => void;
  onStartNewSession: () => void;
  onContinuePreviousStudies: () => void;
  onDismissWelcomePrompt: () => void;
}

export const OledScreenDisplay: React.FC<OledScreenDisplayProps> = ({
  screenMode,
  solution,
  activeStepIndex,
  isSolving,
  isSpeaking,
  isRecordingAudio,
  equationInput,
  voiceNoteInput,
  offlineOnlyMode,
  showWelcomePrompt,
  hasSavedSession,
  previousSessionName,
  chatMessages,
  studentProfile,
  isSendingChatMessage,
  onSendChatMessage,
  onSelectReadingPreset,
  onSelectStep,
  onSpeakStep,
  onSpeakText,
  onChangeEquation,
  onChangeVoiceNote,
  onToggleRecordAudio,
  onSolveEquation,
  chatTitle,
  onSwitchScreenMode,
  onOpenKeyboard,
  onAnswerCheck,
  onStartNewSession,
  onContinuePreviousStudies,
  onDismissWelcomePrompt,
}) => {
  const [cameraSubMode, setCameraSubMode] = useState<
    "math-presets" | "reading-presets" | "draw" | "webcam"
  >("webcam");
  const [selectedMathPreset, setSelectedMathPreset] = useState<HandwrittenPreset>(
    HANDWRITTEN_PRESETS[0]
  );
  const [selectedReadingPreset, setSelectedReadingPreset] = useState<ReadingPreset>(
    READING_PRESETS[0]
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(
    null
  );
  const [showQuizOnScreen, setShowQuizOnScreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset quiz selection when solution changes
  useEffect(() => {
    setSelectedQuizOption(null);
    setShowQuizOnScreen(false);
  }, [solution.id]);

  // Manage live webcam stream when in camera -> webcam submode
  useEffect(() => {
    if (screenMode === "camera" && cameraSubMode === "webcam") {
      setCameraError(null);
      navigator.mediaDevices
        ?.getUserMedia({
          video: { facingMode: "environment", width: 640, height: 360 },
        })
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          setCameraError(
            "Camera permission unavailable in this frame—use Draw Pad, Upload Photo, or Presets below!"
          );
        });
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [screenMode, cameraSubMode]);

  // Initialize handwriting draw canvas when in draw mode
  useEffect(() => {
    if (screenMode === "camera" && cameraSubMode === "draw") {
      const canvas = drawCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#12151B";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let x = 24; x < canvas.width; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 24; y < canvas.height; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.font = "500 13px 'JetBrains Mono', monospace";
      ctx.fillText("Draw math with finger or stylus...", 14, 24);
    }
  }, [screenMode, cameraSubMode]);

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX =
      "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY =
      "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    isDrawingRef.current = true;
    ctx.strokeStyle = "#F8FAFC";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const moveDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawingRef.current) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX =
      "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY =
      "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearDrawCanvas = () => {
    soundEngine.playKeyClick(0.9);
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#12151B";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleCaptureAndScan = () => {
    soundEngine.playKeyClick(1.15);
    if (cameraSubMode === "math-presets") {
      const dataUrl = renderHandwrittenSampleToDataUrl(selectedMathPreset);
      onChangeEquation(selectedMathPreset.equation);
      onChangeVoiceNote(selectedMathPreset.defaultVoiceNote);
      onSolveEquation(
        selectedMathPreset.equation,
        selectedMathPreset.defaultVoiceNote,
        dataUrl
      );
    } else if (cameraSubMode === "reading-presets") {
      const dataUrl = renderReadingSampleToDataUrl(selectedReadingPreset);
      onSwitchScreenMode("chat");
      onSendChatMessage(
        `Please analyze this reading passage: "${selectedReadingPreset.title}". Extract the main idea, key factual details, and vocabulary!`,
        dataUrl,
        selectedReadingPreset.title
      );
    } else if (cameraSubMode === "draw" && drawCanvasRef.current) {
      const dataUrl = drawCanvasRef.current.toDataURL("image/png");
      onSolveEquation(equationInput, voiceNoteInput, dataUrl);
    } else if (cameraSubMode === "webcam" && videoRef.current) {
      const snapCanvas = document.createElement("canvas");
      snapCanvas.width = 640;
      snapCanvas.height = 360;
      const ctx = snapCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 640, 360);
        const dataUrl = snapCanvas.toDataURL("image/png");
        onSolveEquation(equationInput, voiceNoteInput, dataUrl);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        soundEngine.playBuddyChime("scan");
        // If image or document uploaded in camera mode, offer to solve equation or analyze text
        onSwitchScreenMode("chat");
        onSendChatMessage(
          `Please analyze this uploaded document or homework page (${file.name}) and extract main idea and factual details.`,
          reader.result,
          file.name
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const currentStep =
    solution.steps[activeStepIndex] || solution.steps[0];

  return (
    <div className="oled-screen-well relative w-full h-[312px] sm:h-[326px] rounded-b-[40px] rounded-t-[8px] px-3.5 pt-3 pb-4 text-slate-100 flex flex-col justify-between overflow-hidden select-none">
      {/* Subtle top glass reflection sheen */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />

      {/* Top OLED Status Bar & Mode Switcher */}
      <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-slate-400 border-b border-white/10 pb-1.5 shrink-0">
        <div className="flex items-center gap-1 truncate">
          <span className="text-[#EF5B14] font-semibold">STUDY BUDDY</span>
          <span aria-hidden="true">·</span>
          <span className="text-slate-300 truncate text-[10px]">
            {studentProfile.name ? studentProfile.nickname || studentProfile.name : "Buddy"}
          </span>
        </div>

        {/* OLED Mode Tabs: Chat, Steps, Scan, Calc, Type */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchScreenMode("chat")}
            title="Chat tutor & conversation"
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-0.5 ${
              screenMode === "chat"
                ? "bg-[#EF5B14] text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchScreenMode("solver")}
            title="Step-by-step math solution"
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
              screenMode === "solver"
                ? "bg-[#EF5B14] text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Steps
          </button>
          
          <button
            type="button"
            onClick={() => {
              onSwitchScreenMode("calculator");
              onOpenKeyboard("calculator");
            }}
            title="Spawn math calculator keyboard at bottom"
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-0.5 ${
              screenMode === "calculator"
                ? "bg-[#EF5B14] text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <CalcIcon className="w-3 h-3" />
            <span>Calc</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onSwitchScreenMode("keyboard");
              onOpenKeyboard("qwerty");
            }}
            title="Spawn full typewriter keyboard at bottom"
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-0.5 ${
              screenMode === "keyboard"
                ? "bg-[#EF5B14] text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <KeyboardIcon className="w-3 h-3" />
            <span>Type</span>
          </button>
        </div>
      </div>

      {/* STARTUP GREETING & SESSION PROMPT MODAL */}
      {showWelcomePrompt && (
        <div className="absolute inset-0 z-40 bg-[#0C0E12]/95 backdrop-blur-sm flex flex-col justify-between p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF5B14] animate-ping" />
              <span className="text-xs font-mono font-bold text-white tracking-wide">
                HELLO FROM STUDY BUDDY!
              </span>
            </div>
            <button
              type="button"
              onClick={onDismissWelcomePrompt}
              className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
            >
              Skip
            </button>
          </div>

          <div className="my-auto py-2 text-center">
            <div className="inline-flex p-2.5 rounded-2xl bg-[#EF5B14]/15 border border-[#EF5B14]/30 mb-2">
              <Sparkles className="w-6 h-6 text-[#EF5B14]" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white">
              Hi! I&apos;m Study Buddy! 🎉
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-[280px] mx-auto leading-relaxed">
              I&apos;m your personal pocket tutor for math, reading analysis, science, and study questions. What should I call you, and what are we working on today?
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onStartNewSession}
              className="w-full py-2 px-3 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] text-white font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-[0.99]"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat &amp; Introduce Myself</span>
            </button>

            <button
              type="button"
              onClick={onContinuePreviousStudies}
              className="w-full py-1.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-white/15 transition-all"
            >
              <RotateCcw className="w-3 h-3 text-[#EF5B14]" />
              <span className="truncate">
                Continue Previous Studies {previousSessionName ? `(${previousSessionName})` : ""}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Loading / Scanning Overlay */}
      {isSolving && (
        <div className="absolute inset-0 z-30 bg-[#0D0E10]/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-xl border-2 border-[#EF5B14] flex items-center justify-center mb-3 animate-pulse">
            <Sparkles className="w-6 h-6 text-[#EF5B14]" />
          </div>
          <p className="text-sm font-semibold text-white">
            Study Buddy is thinking...
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-[260px]">
            Parsing equation &amp; audio notes into step-by-step tutoring.
          </p>
        </div>
      )}

      {/* MODE 0: CONVERSATIONAL CHAT BOT & READING ANALYZER */}
      {screenMode === "chat" && (
        <ConversationalChatView
          chatMessages={chatMessages}
          studentProfile={studentProfile}
          isSpeaking={isSpeaking}
          isSendingMessage={isSendingChatMessage}
          isRecordingAudio={isRecordingAudio}
          onSendMessage={onSendChatMessage}
          onSpeakText={onSpeakText}
          onToggleRecordAudio={onToggleRecordAudio}
          onSelectReadingPreset={onSelectReadingPreset}
          onOpenKeyboard={() => onOpenKeyboard("qwerty")}
          onPractice={(q) => onSolveEquation(q, "")}
          title={chatTitle}
        />
      )}

      {/* MODE 1: STEP-BY-STEP SOLVER & VOICE TUTOR */}
      {screenMode === "solver" && (
        <div className="relative z-10 flex-1 flex flex-col justify-between pt-1.5 overflow-y-auto oled-scroll pr-0.5">
          {/* Equation Header & Final Answer Row */}
          <div className="flex items-start justify-between gap-2 bg-white/[0.04] rounded-xl px-2.5 py-1.5 border border-white/[0.08]">
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                <span>{solution.category}</span>
                {solution.voiceNoteAttached && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#EF5B14]">Voice Note</span>
                  </>
                )}
              </div>
              <div className="text-xs sm:text-sm font-mono font-bold text-white truncate mt-0.5">
                {solution.detectedEquation}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[9px] font-mono text-slate-400">Result</div>
              <div className="text-xs font-mono font-semibold text-emerald-400 truncate max-w-[110px]">
                {solution.finalAnswer}
              </div>
            </div>
          </div>
          {solution.practice && solution.practice.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 px-1 pt-1" data-testid="practice-chips">
              <span className="text-[9px] font-mono text-slate-400">Try:</span>
              {solution.practice.map((q) => (
                <button key={q.question} type="button" data-testid="practice-chip" onClick={() => onSolveEquation(q.question, "")}
                  className="px-1.5 py-0.5 rounded bg-[#EF5B14]/20 border border-[#EF5B14]/50 text-[10px] font-mono text-white">{q.question}</button>
              ))}
            </div>
          )}

          {/* Toggle between Step Walkthrough and Quick Comprehension Check */}
          {!showQuizOnScreen ? (
            <div className="my-1.5 flex-1 flex flex-col justify-between bg-[#161920] rounded-xl p-2.5 border border-white/[0.07]">
              <div>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10.5px] font-mono font-semibold text-[#EF5B14] truncate">
                    Step {currentStep.stepNumber}/{solution.steps.length} ·{" "}
                    {currentStep.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSpeakStep(activeStepIndex)}
                    title="Hear Study Buddy read this step aloud"
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-300 hover:text-[#EF5B14] transition-colors cursor-pointer shrink-0"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#EF5B14]" />
                    <span>{isSpeaking ? "Speaking" : "Speak"}</span>
                  </button>
                </div>

                {/* Derived Math Formula for Current Step */}
                <div className="mt-1 px-2 py-1 rounded bg-black/50 border border-white/[0.06] font-mono text-xs text-amber-200 font-semibold tracking-tight truncate">
                  {currentStep.mathExpression}
                </div>

                {/* Step Explanation */}
                <p className="mt-1 text-[11.5px] text-slate-300 leading-snug line-clamp-3">
                  {currentStep.explanation}
                </p>

                {currentStep.tip && (
                  <p className="mt-0.5 text-[10.5px] text-emerald-300/90 font-medium truncate">
                    Buddy Tip: {currentStep.tip}
                  </p>
                )}
              </div>

              {/* Step Navigation Bar */}
              <div className="mt-1.5 pt-1 border-t border-white/[0.07] flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={activeStepIndex === 0}
                    onClick={() =>
                      onSelectStep(Math.max(0, activeStepIndex - 1))
                    }
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 disabled:opacity-35 text-[11px] flex items-center gap-0.5 cursor-pointer"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    <span>Prev</span>
                  </button>
                  <button
                    type="button"
                    disabled={activeStepIndex >= solution.steps.length - 1}
                    onClick={() =>
                      onSelectStep(
                        Math.min(
                          solution.steps.length - 1,
                          activeStepIndex + 1
                        )
                      )
                    }
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/15 disabled:opacity-35 text-[11px] flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playKeyClick(1.15);
                    setShowQuizOnScreen(true);
                  }}
                  className="px-2 py-0.5 rounded bg-[#EF5B14]/20 hover:bg-[#EF5B14]/30 text-[#FF8547] text-[10.5px] font-medium cursor-pointer transition-colors"
                >
                  Quick Check-In →
                </button>
              </div>
            </div>
          ) : (
            /* Interactive Comprehension Check-In Card */
            <div className="my-1.5 flex-1 flex flex-col justify-between bg-[#161920] rounded-xl p-2.5 border border-[#EF5B14]/40">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[#EF5B14] font-semibold">
                    Study Buddy Check-In
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowQuizOnScreen(false)}
                    className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    ← Steps
                  </button>
                </div>
                <p className="text-[11px] font-medium text-white mt-0.5">
                  {solution.comprehensionCheck.question}
                </p>

                <div className="mt-1.5 space-y-1">
                  {solution.comprehensionCheck.options.map((opt, idx) => {
                    const isPicked = selectedQuizOption === idx;
                    const isRight =
                      idx === solution.comprehensionCheck.correctIndex;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedQuizOption(idx);
                          const correct =
                            idx === solution.comprehensionCheck.correctIndex;
                          onAnswerCheck(
                            correct,
                            correct
                              ? solution.comprehensionCheck
                                  .encouragementOnCorrect
                              : solution.comprehensionCheck.hintOnRetry
                          );
                        }}
                        className={`w-full text-left px-2 py-1 rounded text-[10.5px] border transition-colors cursor-pointer flex items-center justify-between gap-1.5 ${
                          isPicked
                            ? isRight
                              ? "bg-emerald-500/20 border-emerald-400 text-emerald-200"
                              : "bg-amber-500/20 border-amber-400 text-amber-200"
                            : "bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/[0.08]"
                        }`}
                      >
                        <span className="truncate">{opt}</span>
                        {isPicked && isRight && (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedQuizOption !== null && (
                <p className="text-[10.5px] text-slate-300 mt-1 italic truncate">
                  {selectedQuizOption ===
                  solution.comprehensionCheck.correctIndex
                    ? solution.comprehensionCheck.encouragementOnCorrect
                    : solution.comprehensionCheck.hintOnRetry}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODE 2: CAMERA & READING / MATH SCANNER */}
      {screenMode === "camera" && (
        <div className="relative z-10 flex-1 flex flex-col justify-between pt-1 overflow-hidden">
          {/* Sub-mode switcher */}
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 bg-white/[0.06] p-0.5 rounded-lg overflow-x-auto oled-scroll">
              <button
                type="button"
                onClick={() => setCameraSubMode("draw")}
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-medium cursor-pointer transition-colors flex items-center gap-0.5 ${
                  cameraSubMode === "draw"
                    ? "bg-white text-slate-950 font-bold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <PenTool className="w-2.5 h-2.5" />
                <span>Draw</span>
              </button>
              <button
                type="button"
                onClick={() => setCameraSubMode("webcam")}
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-medium cursor-pointer transition-colors flex items-center gap-0.5 ${
                  cameraSubMode === "webcam"
                    ? "bg-white text-slate-950 font-bold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                <Camera className="w-2.5 h-2.5" />
                <span>Cam</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-0.5 rounded bg-white/[0.08] hover:bg-white/[0.14] text-[9.5px] text-slate-200 flex items-center gap-1 cursor-pointer shrink-0"
              title="Upload photo of handwritten homework or reading passage"
            >
              <Upload className="w-3 h-3" />
              <span>Upload</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.txt,.pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Viewport Stage */}
          <div className="my-1 flex-1 relative rounded-xl overflow-hidden border border-white/15 bg-[#12151B] flex flex-col justify-center">
            {cameraSubMode === "draw" && (
              <div className="relative w-full h-full">
                <canvas
                  ref={drawCanvasRef}
                  width={360}
                  height={140}
                  onMouseDown={startDrawing}
                  onMouseMove={moveDrawing}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={moveDrawing}
                  onTouchEnd={stopDrawing}
                  className="w-full h-full cursor-crosshair touch-none"
                />
                <button
                  type="button"
                  onClick={clearDrawCanvas}
                  className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded bg-black/70 hover:bg-black text-[9.5px] text-slate-300 flex items-center gap-1 cursor-pointer border border-white/10"
                >
                  <Eraser className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              </div>
            )}

            {cameraSubMode === "webcam" && (
              <div className="relative w-full h-full flex items-center justify-center bg-black">
                {cameraError ? (
                  <p className="text-[10px] text-amber-300 px-3 text-center">
                    {cameraError}
                  </p>
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-2 border border-dashed border-[#EF5B14]/70 rounded-lg pointer-events-none" />
              </div>
            )}
          </div>

          {/* Bottom Capture & Scan Action */}
          <button
            type="button"
            onClick={handleCaptureAndScan}
            className="w-full py-1.5 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-colors shrink-0"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>
              {cameraSubMode === "reading-presets"
                ? "Scan Reading Material & Analyze"
                : "Scan Handwritten Math & Solve"}
            </span>
          </button>
        </div>
      )}

      {/* MODE 3 & 4: LIVE FORMULA DISPLAY & BOTTOM KEYBOARD LAUNCHER */}
      {(screenMode === "calculator" || screenMode === "keyboard") && (
        <div className="relative z-10 flex-1 flex flex-col justify-between pt-1.5 overflow-hidden animate-in fade-in duration-200">
          <div>
            {/* Active Math Expression Screen Bar */}
            <div
              onClick={() => onOpenKeyboard(screenMode === "calculator" ? "calculator" : "qwerty")}
              className="flex items-center gap-1.5 bg-black/60 border border-white/15 focus-within:border-[#EF5B14] rounded-xl px-2.5 py-2 cursor-pointer hover:border-white/30 transition-colors"
            >
              <span className="text-xs font-mono text-[#EF5B14] font-bold shrink-0">
                {screenMode === "calculator" ? "MATH:" : "PROMPT:"}
              </span>
              <input
                type="text"
                value={equationInput}
                onChange={(e) => onChangeEquation(e.target.value)}
                placeholder={screenMode === "calculator" ? "e.g. 2x^2 - 8x + 6 = 0" : "Type math problem or question..."}
                aria-label="Active equation expression"
                className="flex-1 bg-transparent text-sm sm:text-base font-mono text-white outline-none truncate"
              />
              {equationInput && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeEquation("");
                  }}
                  className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/15 text-[10px] font-mono text-slate-300 cursor-pointer"
                >
                  CLR
                </button>
              )}
            </div>

            {/* Audio Note Shortcut Bar */}
            <div className="mt-2 flex items-center gap-1.5 px-1 text-xs">
              <button
                type="button"
                onClick={onToggleRecordAudio}
                className={`px-2 py-1 rounded-lg text-[10.5px] font-medium flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                  isRecordingAudio
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-[#EF5B14]/20 text-[#FF8547] hover:bg-[#EF5B14]/30"
                }`}
              >
                {isRecordingAudio ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                <span>{isRecordingAudio ? "Stop Mic" : "Voice Note"}</span>
              </button>
              <span className="text-slate-400 truncate text-[11px]">
                {voiceNoteInput || "Speak audio note for teacher context"}
              </span>
            </div>

            {/* Bottom Keyboard Notification Card */}
            <div className="mt-2.5 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 flex flex-col items-center justify-center text-center">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                {screenMode === "calculator" ? (
                  <CalcIcon className="w-4 h-4 text-[#EF5B14]" />
                ) : (
                  <KeyboardIcon className="w-4 h-4 text-[#EF5B14]" />
                )}
                <span>
                  {screenMode === "calculator"
                    ? "Math Calculator Keyboard at Bottom"
                    : "QWERTY Keyboard at Bottom"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 max-w-[240px]">
                Virtual keyboard spawned at bottom of screen like a normal keyboard!
              </p>
              <button
                type="button"
                onClick={() => onOpenKeyboard(screenMode === "calculator" ? "calculator" : "qwerty")}
                className="mt-2 px-3 py-1 rounded-lg bg-[#EF5B14]/20 hover:bg-[#EF5B14]/30 text-[#FF8547] text-xs font-semibold cursor-pointer transition-colors"
              >
                Show Keyboard at Bottom ↑
              </button>
            </div>
          </div>

          {/* Bottom Solve Action */}
          <button
            type="button"
            onClick={() => onSolveEquation(equationInput, voiceNoteInput)}
            className="w-full py-2 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-colors shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Solve step by step</span>
          </button>
        </div>
      )}
    </div>
  );
};
