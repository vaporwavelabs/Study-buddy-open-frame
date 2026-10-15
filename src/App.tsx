import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BuddyMood,
  ChatMessage,
  ExplanationDepth,
  HandwrittenPreset,
  MathSolution,
  ReadingPreset,
  ScreenMode,
  StudentProfile,
} from "./types/studyBuddy";
import {
  HANDWRITTEN_PRESETS,
  READING_PRESETS,
  chatWithLocalGemmaEdge,
  renderHandwrittenSampleToDataUrl,
  renderReadingSampleToDataUrl,
  solveWithLocalGemmaEdge,
  soundEngine,
} from "./services/localGemmaEdgeEngine";
import { OledScreenDisplay } from "./components/OledScreenDisplay";
import { HardwareControlDeck } from "./components/HardwareControlDeck";
import { CompanionLabPanel } from "./components/CompanionLabPanel";
import { VirtualSpawnKeyboard } from "./components/VirtualSpawnKeyboard";
import { AccessGate, Me } from "./components/AccessGate";
import { CameraCapture } from "./components/CameraCapture";
import { KawaiiMode } from "./components/KawaiiMode";
import { StartScreen, StartAction } from "./components/StartScreen";
import { runAiJob } from "./lib/aiJob";
import { shrinkImageDataUrl } from "./lib/shrinkImage";
import { SignOutButton, CARTS, CartridgeGrid, CartIntro, DraftboardMode, GodsEyeMode, ToolsMode } from "./components/Cartridges";
import { AdminGuestCodes } from "./components/AdminGuestCodes";
import { ModelPicker, AdminModels, UserModels } from "./components/ModelPicker";
import { LlmProviderConfig } from "./types/llmAndGrok";

const MOTIVATIONAL_PEP_TALKS = [
  "Hi! I'm Study Buddy! Tap the Camera key to scan handwritten math or reading passages, or tap Chat to talk through your homework with me!",
  "You've got this! Every tricky problem is just a few small steps stacked together.",
  "Tip: Turn my silver dial or tap the orange LEDs to scrub through each step at your own pace!",
  "Need help with an article? Upload a photo or document and I'll extract the main idea, key facts, and vocabulary!",
];

const STORAGE_KEY = "study_buddy_saved_session";
const PROFILE_KEY = "study_buddy_student_profile";

export default function App() {
  return <AccessGate>{(me) => <CartridgeShell me={me} />}</AccessGate>;
}

/** After sign-in + 18+: cartridge grid -> Study Buddy intro card -> chosen mode. Always starts at the grid. */
function CartridgeShell({ me }: { me: Me }) {
  const [stage, setStage] = useState<"grid" | "intro" | "mode">("grid");
  const [cart, setCart] = useState<(typeof CARTS)[number] | null>(null);
  const toGrid = () => { setStage("grid"); setCart(null); window.scrollTo(0, 0); };
  if (stage === "grid" || !cart) return <CartridgeGrid onPick={(c) => { setCart(c); setStage("intro"); }} />;
  if (stage === "intro") return <CartIntro cart={cart} onBack={toGrid} onBegin={() => setStage("mode")} />;
  switch (cart.id) {
    case "studybuddy-math": return <StudyBuddyApp key="math" me={me} onSwitch={toGrid} subject="math" />;
    case "studybuddy-science": return <StudyBuddyApp key="science" me={me} onSwitch={toGrid} subject="science" />;
    case "kawaii": return <KawaiiMode onSwitch={toGrid} />;
    case "draftboard": return <DraftboardMode onSwitch={toGrid} />;
    case "godseye": return <GodsEyeMode url={me.gevUrl || "https://gev.vicenvalor.com"} onSwitch={toGrid} />;
    case "tools": return <ToolsMode onSwitch={toGrid} />;
    default: return <CartIntro cart={cart} onBack={toGrid} onBegin={toGrid} />;
  }
}

/** Blank starting state: nothing preloaded until the student asks. */
const EMPTY_SOLUTION: MathSolution = {
  id: "empty",
  timestamp: "",
  detectedEquation: "",
  category: "",
  finalAnswer: "",
  audioContextInsight: "",
  buddyGreeting: "",
  steps: [{ stepNumber: 1, title: "Ready when you are", mathExpression: "", explanation: "Type a question, upload a file or take photos to get started.", spokenScript: "What do you need help with?", buddyMood: "happy" }],
  comprehensionCheck: undefined as unknown as MathSolution["comprehensionCheck"],
  engineUsed: "",
} as MathSolution;

function StudyBuddyApp({ me, onSwitch, subject }: { me: Me; onSwitch: () => void; subject?: "math" | "science" }) {
  const [showCamera, setShowCamera] = useState(false);
  const [solution, setSolution] = useState<MathSolution>(EMPTY_SOLUTION);
  const [history, setHistory] = useState<MathSolution[]>([]);
  const [showStart, setShowStart] = useState<boolean>(true);
  const [showGuestAdmin, setShowGuestAdmin] = useState<boolean>(false);
  const [showModelsAdmin, setShowModelsAdmin] = useState<boolean>(false);
  const [modelInfo, setModelInfo] = useState<UserModels | null>(null);
  const [chosenModel, setChosenModelRaw] = useState<string>(() => { try { return sessionStorage.getItem("sb_model") || ""; } catch { return ""; } });
  const setChosenModel = (m: string) => { setChosenModelRaw(m); try { sessionStorage.setItem("sb_model", m); } catch { /* private mode */ } };
  const loadModels = useCallback(() => { fetch("/api/models").then((r) => r.json()).then((j) => j && Array.isArray(j.models) && setModelInfo(j)).catch(() => {}); }, []);
  useEffect(loadModels, [loadModels]);
  /** Model sent with each request (server re-validates against the allow list). Shows "Loading model…" on cold loads. */
  const modelForRequest = () => {
    const m = chosenModel && modelInfo?.models.some((x) => x.name === chosenModel) ? chosenModel : modelInfo?.default || "";
    if (m && modelInfo && !modelInfo.loaded.includes(m)) {
      setBuddyCaption(`Loading model ${m}…`);
      setModelInfo({ ...modelInfo, loaded: [m] });
    }
    return m || undefined;
  };
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [screenMode, setScreenMode] = useState<ScreenMode>("chat");
  const [mood, setMood] = useState<BuddyMood>("happy");
  const [buddyCaption, setBuddyCaption] = useState<string>("Ready to help!");
  const [knobAngle, setKnobAngle] = useState<number>(0);

  // Student Profile state
  const [studentProfile, setStudentProfile] = useState<StudentProfile>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(PROFILE_KEY);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {
      name: "",
      nickname: "",
      currentNeed: "",
      gradeLevel: "",
      favoriteSubject: "",
    };
  });

  // Conversational Chat Messages
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: "msg-init",
      sender: "buddy",
      text: "What do you need help with? Type a question, upload a file or take photos.",
      spokenSummary: "What do you need help with?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [isSendingChatMessage, setIsSendingChatMessage] = useState<boolean>(false);
  const [chatInputDraft, setChatInputDraft] = useState<string>("");

  // Inputs & Engine state
  const [equationInput, setEquationInput] = useState<string>("");
  const [voiceNoteInput, setVoiceNoteInput] = useState<string>("");
  const [offlineOnlyMode, setOfflineOnlyMode] = useState<boolean>(false);
  const [explanationDepth, setExplanationDepth] =
    useState<ExplanationDepth>("standard");
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [deviceFocusOnly, setDeviceFocusOnly] = useState<boolean>(false);

  // Startup Session Prompt state
  const [showWelcomePrompt, setShowWelcomePromptRaw] = useState<boolean>(() => {
    return false; // the "What do you need help with?" start screen replaces the old intro
  });
  // The intro shows once; any dismissal (or starting work) marks it seen so it never blocks the solver later.
  const setShowWelcomePrompt = useCallback((show: boolean) => {
    if (!show) { try { localStorage.setItem("studyBuddyWelcomeSeen", "1"); } catch { /* private mode */ } }
    setShowWelcomePromptRaw(show);
  }, []);
  const [hasSavedSession, setHasSavedSession] = useState<boolean>(false);
  const [previousSessionName, setPreviousSessionName] = useState<string>("");

  // Bottom Virtual Keyboard Spawn state
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [keyboardType, setKeyboardType] = useState<"calculator" | "qwerty">("qwerty");

  // Local LLM Hooks & Grok Bot Harness state
  const [activeLlmProvider, setActiveLlmProvider] = useState<LlmProviderConfig>({
    id: "local-edge",
    name: "Built-in offline helper",
    type: "local-edge",
    baseUrl: "browser://webgpu-wasm",
    model: "offline-helper",
    isEnabled: true,
    isReachable: true,
    statusMessage: "Rule-based offline helper (no AI model)",
  });

  // Which backend is answering right now (primary PC, backup NUC, or offline). Polled so failover shows in the header.
  const [engineLabel, setEngineLabel] = useState<string>("");
  useEffect(() => {
    let alive = true;
    const poll = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((h) => {
          if (!alive || !h || typeof h.activeEngine !== "string") return;
          setEngineLabel(h.activeEngine.replace(/^Ollama backup \((.+)\)$/, "backup: $1").replace(/^Ollama \((.+)\)$/, "$1"));
        })
        .catch(() => alive && setEngineLabel("Offline helper"));
    poll();
    const id = window.setInterval(poll, 30000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  // Sync active provider from server on mount
  useEffect(() => {
    fetch("/api/llm/providers")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.activeProvider) {
          setActiveLlmProvider(data.activeProvider);
        }
      })
      .catch(() => {});
  }, []);

  // Voice TTS & Recording state
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speechPulse, setSpeechPulse] = useState<number>(0);
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const speechIntervalRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pepTalkIndexRef = useRef<number>(0);

  const speechSeqRef = useRef<number>(0);
  const hasGreetedRef = useRef<boolean>(false);

  // Persist student profile changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(studentProfile));
      } catch {}
    }
  }, [studentProfile]);

  // Clean up speech synthesis and intervals on unmount
  const stopSpeaking = useCallback(() => {
    // Invalidate any in-flight asynchronous TTS requests
    speechSeqRef.current += 1;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = "";
      audioElementRef.current = null;
    }
    if (speechIntervalRef.current) {
      window.clearInterval(speechIntervalRef.current);
      speechIntervalRef.current = null;
    }
    setIsSpeaking(false);
    setMood("resting");
    setBuddyCaption("Resting");
  }, []);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  // Speak text using single-source TTS (never overlap audio elements with Web Speech API)
  const speakTextWithBuddy = useCallback(
    async (
      textToSpeak: string,
      targetMood: BuddyMood = "talking",
      onComplete?: () => void
    ) => {
      stopSpeaking();
      const currentSeq = ++speechSeqRef.current;

      setIsSpeaking(true);
      setMood(targetMood);
      setBuddyCaption("Talking...");

      // Start mouth syllable pulse timer
      speechIntervalRef.current = window.setInterval(() => {
        setSpeechPulse((p) => (p + 1) % 12);
      }, 110);

      const finishSpeech = () => {
        // Discard callback if another speech sequence was started
        if (speechSeqRef.current !== currentSeq) return;
        if (speechIntervalRef.current) {
          window.clearInterval(speechIntervalRef.current);
          speechIntervalRef.current = null;
        }
        setIsSpeaking(false);
        setMood("resting");
        setBuddyCaption("Ready!");
        if (onComplete) onComplete();
      };

      // Server voice is off (local-only build); this falls through to the device voice
      let playedWithCloud = false;
      if (false as boolean) {
        try {
          const resp = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: textToSpeak, mood: targetMood }),
          });

          // If another speech command was issued while fetching, abort this one
          if (speechSeqRef.current !== currentSeq) return;

          if (resp.ok) {
            const data = await resp.json();
            if (data && data.audioBase64) {
              playedWithCloud = true;
              const audio = new Audio(
                `data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`
              );
              audioElementRef.current = audio;

              audio.onended = () => {
                finishSpeech();
              };
              audio.onerror = () => {
                finishSpeech();
              };

              await audio.play();
              return;
            }
          }
        } catch {
          playedWithCloud = false;
        }
      }

      // Check again if sequence was invalidated before starting fallback
      if (speechSeqRef.current !== currentSeq) return;

      // Fallback: Offline Web Speech API
      if (!playedWithCloud && typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.05;
        utterance.pitch = 1.15; // friendly, enthusiastic young tutor pitch

        const voices = window.speechSynthesis.getVoices();
        const englishVoice =
          voices.find(
            (v) =>
              (v.lang.startsWith("en") &&
                (v.name.includes("Samantha") ||
                  v.name.includes("Victoria") ||
                  v.name.includes("Natural") ||
                  v.name.includes("Karen") ||
                  v.name.includes("Google US English"))) ||
              v.default
          ) || voices[0];

        if (englishVoice) {
          utterance.voice = englishVoice;
        }

        utterance.onend = () => {
          finishSpeech();
        };
        utterance.onerror = () => {
          finishSpeech();
        };

        window.speechSynthesis.speak(utterance);
      } else if (!playedWithCloud) {
        // If neither is supported, pulse mouth briefly and finish
        window.setTimeout(() => {
          finishSpeech();
        }, 2200);
      }
    },
    [offlineOnlyMode, stopSpeaking]
  );

  // Greet user on initial app start with session choice prompt
  useEffect(() => {
    if (hasGreetedRef.current) return;
    hasGreetedRef.current = true;

    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.solution) {
            setHasSavedSession(true);
            setPreviousSessionName(parsed.solution.detectedEquation || "Previous Session");
          }
        }
      } catch {}
    }

    const timer = window.setTimeout(() => {
      speakTextWithBuddy(
        "Hi there! Welcome to Study Buddy! I'm your pocket tutor for math, reading analysis, science, and homework questions. Would you like to introduce yourself and start a new chat, or continue previous studies?",
        "happy"
      );
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [speakTextWithBuddy]);

  // Handle Send Chat Message (Conversational Bot & Reading Material Analyzer)
  const handleSendChatMessage = useCallback(
    async (text: string, fileBase64?: string, fileName?: string, images?: string[]) => {
      if (!text.trim() && !fileBase64) return;

      stopSpeaking();
      setShowWelcomePrompt(false);
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: "user",
        text: text.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        attachmentPreview: fileBase64,
        attachmentName: fileName,
        attachments: images && images.length > 1 ? images : undefined,
      };

      // The reply placeholder carries its own id and the user message id, so a late answer can only ever
      // land on (and clear the spinner of) the turn it belongs to.
      const replyId = `reply-${userMsg.id}`;
      const nowTs = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const settle = (patch: Partial<ChatMessage>) => {
        setChatMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, ...patch, pending: false, timestamp: nowTs() } : m)));
        setIsSendingChatMessage(false);
      };
      setChatMessages((prev) => [...prev, userMsg, { id: replyId, replyTo: userMsg.id, sender: "buddy", text: "", timestamp: "", pending: true }]);
      setIsSendingChatMessage(true);
      setMood("thinking");
      setBuddyCaption("Thinking...");
      soundEngine.playKeyClick(1.0);

      if (!offlineOnlyMode) {
        try {
          const r = await runAiJob("chat", {
            message: text,
            // Text only: never resend earlier attachments (base64), analysis cards or unfinished placeholders.
            history: chatMessages.filter((m) => !m.pending).slice(-6).map((m) => ({ sender: m.sender, text: m.text })),
            studentProfile,
            imageBase64: fileBase64,
            images: images && images.length > 1 ? images : undefined,
            subject,
            model: modelForRequest(),
          });
          const data = r.data && r.data.chatReply ? r.data.chatReply : r.data;
          if (r.ok && data && data.replyText) {
            settle({ text: data.replyText, spokenSummary: data.spokenSummary || data.replyText, readingAnalysis: data.readingAnalysis, practice: Array.isArray(data.practice) ? data.practice.filter((q: { question?: unknown }) => typeof q?.question === "string").slice(0, 3) : undefined, toolLinks: Array.isArray(data.toolLinks) ? data.toolLinks.filter((l: { url?: string }) => typeof l?.url === "string" && l.url.startsWith("https://toolsontab.com/")) : undefined });
            setMood(data.buddyMood || "happy");
            setBuddyCaption("Answered!");
            if (data.learnedStudentInfo) setStudentProfile((prev) => ({ ...prev, ...data.learnedStudentInfo }));
            speakTextWithBuddy(data.spokenSummary || data.replyText.slice(0, 140), data.buddyMood || "talking");
            return;
          }
          if (fileBase64 || (r.status >= 400 && r.status < 500 && r.data?.error)) {
            // Photos/files can't be answered offline, and 4xx (too big, wrong type, sign-in) must be shown as-is.
            settle({ text: String(r.data?.error || "I couldn't read that file just now. Please try again.") });
            setMood("curious");
            setBuddyCaption("Couldn't answer");
            return;
          }
        } catch {
          if (fileBase64) {
            settle({ text: "I lost the connection while reading your file. Please try again." });
            setMood("curious");
            return;
          }
        }
      }

      // Built-in offline helper (text only, no AI model)
      const localResp = chatWithLocalGemmaEdge(text, studentProfile);
      settle({ text: localResp.replyText, spokenSummary: localResp.spokenSummary });
      setMood(localResp.buddyMood);
      setBuddyCaption("Answered offline!");
      if (localResp.learnedStudentInfo) setStudentProfile((prev) => ({ ...prev, ...localResp.learnedStudentInfo }));
      speakTextWithBuddy(localResp.spokenSummary, localResp.buddyMood);
    },
    [chatMessages, offlineOnlyMode, speakTextWithBuddy, stopSpeaking, studentProfile]
  );

  // Handle Startup Session Choice: Start New Session
  const handleStartNewSession = () => {
    soundEngine.playBuddyChime("happy");
    setShowWelcomePrompt(false);
    setScreenMode("chat");
    setIsKeyboardOpen(true);
    setKeyboardType("qwerty");
    speakTextWithBuddy(
      "Awesome! Let's get to know each other. What's your name or nickname, and what subject are we tackling today?",
      "excited"
    );
  };

  // Handle Startup Session Choice: Continue Previous Studies
  const handleContinuePreviousStudies = () => {
    soundEngine.playBuddyChime("happy");
    setShowWelcomePrompt(false);

    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.solution) {
            setSolution(parsed.solution);
            setEquationInput(parsed.solution.detectedEquation);
            setScreenMode("solver");
            setActiveStepIndex(0);
            speakTextWithBuddy(
              `Welcome back! Restoring your study session on ${parsed.solution.detectedEquation}. Let's keep making progress!`,
              "happy"
            );
            return;
          }
        }
      } catch {}
    }

    setScreenMode("solver");
    speakTextWithBuddy(
      "Welcome back! Ready to continue where we left off?",
      "happy"
    );
  };

  // Open Keyboard at bottom (like a normal smartphone / tablet keyboard)
  const handleOpenKeyboard = (type: "calculator" | "qwerty") => {
    soundEngine.playKeyClick(1.0);
    setKeyboardType(type);
    setIsKeyboardOpen(true);
  };

  // Speak a specific solution step
  const handleSpeakStep = (stepIdx: number) => {
    const step = solution.steps[stepIdx];
    if (!step) return;
    speakTextWithBuddy(step.spokenScript, step.buddyMood);
  };

  // Full sequence play button (hardware orange PLAY key)
  const handlePressPlay = () => {
    soundEngine.playKeyClick(1.1);
    if (isSpeaking) {
      stopSpeaking();
      return;
    }

    if (screenMode === "chat") {
      const lastBuddyMsg = [...chatMessages].reverse().find((m) => m.sender === "buddy");
      if (lastBuddyMsg) {
        speakTextWithBuddy(lastBuddyMsg.spokenSummary || lastBuddyMsg.text, "talking");
        return;
      }
    }

    let currentStepToRead = 0;
    const playNextStep = () => {
      if (currentStepToRead >= solution.steps.length) {
        speakTextWithBuddy(
          `And that's our final result: ${solution.finalAnswer}! Amazing work!`,
          "happy"
        );
        return;
      }
      setActiveStepIndex(currentStepToRead);
      const s = solution.steps[currentStepToRead];
      currentStepToRead += 1;
      speakTextWithBuddy(s.spokenScript, s.buddyMood, playNextStep);
    };

    speakTextWithBuddy(
      `${solution.buddyGreeting} Let's walk through this together!`,
      "happy",
      playNextStep
    );
  };

  // Solve Equation & Speech Context Note
  const handleSolveEquation = useCallback(
    async (
      eqText: string,
      voiceText: string = "",
      imageBase64?: string,
      audioBase64?: string
    ) => {
      stopSpeaking();
      setShowWelcomePrompt(false);
      setIsSolving(true);
      setMood("thinking");
      setBuddyCaption("Thinking & solving...");
      soundEngine.playBuddyChime("scan");

      const localResult = solveWithLocalGemmaEdge(
        eqText,
        voiceText,
        explanationDepth,
        imageBase64
      );

      if (offlineOnlyMode) {
        setTimeout(() => {
          setSolution(localResult);
          setHistory((prev) => [
            localResult,
            ...prev.filter((p) => p.detectedEquation !== localResult.detectedEquation).slice(0, 5),
          ]);
          setActiveStepIndex(0);
          setScreenMode("solver");
          setIsSolving(false);
          setMood("happy");
          setBuddyCaption("Solved offline!");
          soundEngine.playBuddyChime("happy");
          speakTextWithBuddy(
            `${localResult.buddyGreeting} Step 1: ${localResult.steps[0].spokenScript}`,
            "talking"
          );
        }, 420);
        return;
      }

      try {
        const r = await runAiJob("solve", {
          equationText: eqText,
          voiceTranscript: voiceText,
          imageBase64,
          audioBase64,
          difficultyMode: explanationDepth,
          model: modelForRequest(),
        });
        const response = { ok: r.ok, status: r.status };
        const data = r.data;
        if (data && (data.unreadablePhoto || (!response.ok && data.error && (response.status < 500 || imageBase64)))) {
          // Blank/unreadable photo or a rejected upload: say so, never invent a problem.
          const text = String(data.message || data.error);
          setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}`, sender: "buddy", text, spokenSummary: text, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
          setScreenMode("chat");
          setIsSolving(false);
          setMood("curious");
          setBuddyCaption("Couldn't read that");
          speakTextWithBuddy(text.slice(0, 140), "curious");
          return;
        }
        if (data && data.solution && Array.isArray(data.solution.steps) && data.solution.steps.length > 0) {
          const enriched: MathSolution = {
            id: `sol-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            detectedEquation:
              data.solution.detectedEquation || localResult.detectedEquation,
            category: data.solution.category || localResult.category,
            finalAnswer: data.solution.finalAnswer || localResult.finalAnswer,
            audioContextInsight:
              data.solution.audioContextInsight ||
              localResult.audioContextInsight,
            buddyGreeting:
              data.solution.buddyGreeting || localResult.buddyGreeting,
            steps: data.solution.steps,
            comprehensionCheck:
              data.solution.comprehensionCheck ||
              localResult.comprehensionCheck,
            engineUsed: data.engine || activeLlmProvider.model || "Server AI",
            voiceNoteAttached: voiceText || undefined,
            scannedImagePreview: imageBase64,
            practice: Array.isArray(data.practice) ? data.practice.slice(0, 3) : undefined,
          };
          setSolution(enriched);
          setHistory((prev) => [
            enriched,
            ...prev.filter((p) => p.detectedEquation !== enriched.detectedEquation).slice(0, 5),
          ]);
          setActiveStepIndex(0);
          setScreenMode("solver");
          setIsSolving(false);
          setMood("happy");
          setBuddyCaption("Solved!");
          soundEngine.playBuddyChime("happy");
          speakTextWithBuddy(
            `${enriched.buddyGreeting} Step 1: ${enriched.steps[0].spokenScript}`,
            "talking"
          );
          return;
        }
      } catch {
        // Fallback to the built-in offline helper below (text problems only)
      }

      if (imageBase64) {
        // Never invent a problem for a photo the AI didn't answer.
        const text = "I couldn't get an answer for that photo just now. Please try again in a moment.";
        setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}`, sender: "buddy", text, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
        setScreenMode("chat");
        setIsSolving(false);
        setMood("curious");
        setBuddyCaption("Couldn't answer");
        return;
      }
      setSolution(localResult);
      setHistory((prev) => [
        localResult,
        ...prev.filter((p) => p.detectedEquation !== localResult.detectedEquation).slice(0, 5),
      ]);
      setActiveStepIndex(0);
      setScreenMode("solver");
      setIsSolving(false);
      setMood("happy");
      setBuddyCaption("Solved offline!");
      soundEngine.playBuddyChime("happy");
      speakTextWithBuddy(
        `${localResult.buddyGreeting} Step 1: ${localResult.steps[0].spokenScript}`,
        "talking"
      );
    },
    [explanationDepth, offlineOnlyMode, speakTextWithBuddy, stopSpeaking]
  );

  // Record speech/audio note for additional problem context
  const handleToggleRecordAudio = useCallback(async () => {
    soundEngine.playKeyClick(1.0);
    if (isRecordingAudio) {
      setIsRecordingAudio(false);
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    try {
      setIsRecordingAudio(true);
      setMood("listening");
      setBuddyCaption("Listening to you...");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio =
            typeof reader.result === "string" ? reader.result : undefined;
          if (base64Audio && !offlineOnlyMode) {
            try {
              const tRes = await fetch("/api/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  audioBase64: base64Audio,
                  mimeType: "audio/webm",
                }),
              });
              const tData = await tRes.json();
              if (tData.transcript) {
                if (screenMode === "chat") {
                  handleSendChatMessage(tData.transcript);
                } else {
                  setVoiceNoteInput(tData.transcript);
                }
                setMood("happy");
                setBuddyCaption("Got voice note!");
                return;
              }
            } catch {
              // Fallback below
            }
          }
          setMood("happy");
          setBuddyCaption("Voice note saved!");
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
    } catch {
      setTimeout(() => {
        setIsRecordingAudio(false);
        setMood("curious");
        setBuddyCaption("Microphone not available");
      }, 1200);
    }
  }, [handleSendChatMessage, isRecordingAudio, offlineOnlyMode, screenMode]);

  // Rotary Encoder Knob rotation handler
  const handleRotateKnob = (direction: 1 | -1) => {
    const totalSteps = solution.steps.length;
    const nextIdx = (activeStepIndex + direction + totalSteps) % totalSteps;
    setActiveStepIndex(nextIdx);
    setKnobAngle((prev) => prev + direction * 36);
    soundEngine.playRotaryClick(nextIdx);
    setMood(solution.steps[nextIdx]?.buddyMood || "thinking");
    setBuddyCaption(`Step ${nextIdx + 1} of ${totalSteps}`);
  };

  // Clicking one of the 6 orange LEDs jumps directly to that step
  const handleSelectLed = (ledNumber: number) => {
    const targetIdx = Math.min(ledNumber - 1, solution.steps.length - 1);
    setActiveStepIndex(targetIdx);
    setKnobAngle(targetIdx * 36);
    soundEngine.playRotaryClick(targetIdx);
  };

  // Tapping Study Buddy's face box
  const handlePokeBuddy = () => {
    soundEngine.playBuddyChime("happy");
    const msg =
      MOTIVATIONAL_PEP_TALKS[
        pepTalkIndexRef.current % MOTIVATIONAL_PEP_TALKS.length
      ];
    pepTalkIndexRef.current += 1;
    speakTextWithBuddy(msg, "happy");
  };

  // Quick scan a handwritten math preset
  const handleQuickScanPreset = (preset: HandwrittenPreset) => {
    const dataUrl = renderHandwrittenSampleToDataUrl(preset);
    setEquationInput(preset.equation);
    setVoiceNoteInput(preset.defaultVoiceNote);
    handleSolveEquation(preset.equation, preset.defaultVoiceNote, dataUrl);
  };

  // Quick scan a reading material preset
  const handleAnalyzeReadingPreset = (preset: ReadingPreset) => {
    const dataUrl = renderReadingSampleToDataUrl(preset);
    setScreenMode("chat");
    handleSendChatMessage(
      `Please analyze this reading passage: "${preset.title}". Extract the central main idea, key factual details, and vocabulary!`,
      dataUrl,
      preset.title
    );
  };

  const handleStartAction = (a: StartAction) => {
    setShowStart(false);
    soundEngine.playKeyClick(1.05);
    if (a === "type") {
      setScreenMode("chat");
      window.setTimeout(() => (document.querySelector('[aria-label="Chat with Study Buddy"]') as HTMLInputElement | null)?.focus(), 150);
    } else if (a === "upload") {
      uploadInputRef.current?.click();
    } else {
      setShowCamera(true);
    }
  };
  const readPicked = (e: React.ChangeEvent<HTMLInputElement>, kind: "photo" | "upload") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Photos are shrunk in the browser before upload, so big camera files are fine; other files must fit the 7 MB server cap.
    const isImg = file.type.startsWith("image/");
    if (file.size > (isImg ? 25 : 7) * 1024 * 1024) {
      setScreenMode("chat");
      setChatMessages((prev) => [...prev, { id: `msg-${Date.now()}`, sender: "buddy", text: isImg ? "That photo is too big (max 25 MB). Try a smaller one." : "That file is too big (max 7 MB). Try a smaller file.", timestamp: "" }]);
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      if (!raw) return;
      const dataUrl = await shrinkImageDataUrl(raw);
      if (kind === "photo") {
        // Photo shows in the chat with its own reply bubble (the reply is tied to this message's id).
        setScreenMode("chat");
        handleSendChatMessage("Please look at this photo and help me solve it step by step.", dataUrl, file.name || "photo.jpg");
      } else {
        setScreenMode("chat");
        handleSendChatMessage(
          file.type.startsWith("image/")
            ? `Please look at this photo (${file.name}) and help me with it.`
            : `Please analyze this uploaded document (${file.name}). Extract the main idea, key facts, and vocabulary!`,
          dataUrl,
          file.name
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const activeLedCount = Math.max(
    1,
    Math.min(
      6,
      Math.round(((activeStepIndex + 1) / Math.max(1, solution.steps.length)) * 6)
    )
  );

  return (
    <div className="min-h-screen bg-[#16171A] text-slate-100 flex flex-col justify-between">
      {/* Top Bar following strict 3-Zone Contract */}
      <header className="flex flex-wrap items-center justify-between gap-2 sm:gap-8 px-3 sm:px-6 py-3 sm:py-3.5 border-b border-white/10 bg-[#1B1D21]">
        <button onClick={onSwitch} data-testid="switch-cart" title="Switch cartridge" aria-label="Switch cartridge"
          className="shrink-0 px-2 py-1.5 rounded-lg bg-black/40 border border-white/15 text-xs font-bold text-white">🎮<span className="hidden sm:inline"> Switch cartridge</span></button>
        {/* Zone 1: Wordmark */}
        <a
          href="#top"
          className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap min-w-0 truncate flex items-center gap-2"
        >
          <span>{subject === "science" ? "STUDY BUDDY SCIENCE" : subject === "math" ? "STUDY BUDDY MATH" : "STUDY BUDDY"}</span>
          {studentProfile.name && (
            <span className="text-xs font-mono text-[#EF5B14] font-normal hidden sm:inline">
              · Hi, {studentProfile.nickname || studentProfile.name}!
            </span>
          )}
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => {
              soundEngine.playKeyClick(1.0);
              setScreenMode("chat");
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              screenMode === "chat" ? "text-[#EF5B14] font-bold" : ""
            }`}
          >
            Chat &amp; Tutor
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playKeyClick(1.0);
              setScreenMode("solver");
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              screenMode === "solver" ? "text-[#EF5B14] font-bold" : ""
            }`}
          >
            Math Solver
          </button>
          
          <button
            type="button"
            onClick={() => {
              handleOpenKeyboard("calculator");
            }}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Calculator Keypad
          </button>
          <button
            type="button"
            onClick={() => {
              handleOpenKeyboard("qwerty");
            }}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Typewriter Keyboard
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playBuddyChime("happy");
              setShowWelcomePrompt(true);
            }}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer text-[#EF5B14]"
          >
            Session Menu
          </button>
        </nav>

        {/* Zone 3: admin links + AI status + primary action */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 min-w-0">
          <SignOutButton compact />
          {me.hasAccess && me.gevUrl && (
            <a
              href={me.gevUrl || "https://gev.vicenvalor.com"}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="gev-button"
              className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white whitespace-nowrap"
              title="God's Eye View"
            >
              <span className="sm:hidden">GEV</span><span className="hidden sm:inline">God's Eye View</span>
            </a>
          )}
          <ModelPicker value={chosenModel} onChange={setChosenModel} info={modelInfo} />
          {me.isAdmin && (
            <button type="button" onClick={() => setShowModelsAdmin(true)} data-testid="models-button"
              className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white whitespace-nowrap">
              Models
            </button>
          )}
          {me.isAdmin && (
            <button type="button" onClick={() => setShowGuestAdmin(true)} data-testid="guest-codes-button"
              className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white whitespace-nowrap">
              Guests
            </button>
          )}
          <button
            type="button"
            title="Local AI model answering right now"
            className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#EF5B14]/15 hover:bg-[#EF5B14]/25 border border-[#EF5B14]/40 text-[#FF8547] text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold hidden sm:inline">AI:</span>
            <span className="font-mono text-white text-[11px] truncate max-w-[100px] sm:max-w-[120px]">
              {engineLabel || (activeLlmProvider.type === "local-edge" ? "Offline" : activeLlmProvider.model)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { soundEngine.playKeyClick(1.1); setShowCamera(true); }}
            className="px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-white bg-[#EF5B14] hover:bg-[#F46925] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="Take photo"
            data-testid="photo-button"
          >
            📷 Photo
          </button>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-8">
        {/* LEFT / CENTER ANCHOR: Physical "STUDY BUDDY" Handheld Hardware Device */}
        <div className="w-full max-w-[392px] shrink-0 flex flex-col items-center justify-center">
          <div className="chassis-surface w-full rounded-[38px] p-2.5 sm:p-3 border border-[#E2E3E5]/80 flex flex-col justify-between">
            {/* Top Recessed Rounded-Bottom Black OLED Display Screen */}
            <OledScreenDisplay
              screenMode={screenMode}
              solution={solution}
              activeStepIndex={activeStepIndex}
              isSolving={isSolving}
              isSpeaking={isSpeaking}
              isRecordingAudio={isRecordingAudio}
              equationInput={equationInput}
              voiceNoteInput={voiceNoteInput}
              offlineOnlyMode={offlineOnlyMode}
              showWelcomePrompt={showWelcomePrompt}
              hasSavedSession={hasSavedSession}
              previousSessionName={previousSessionName}
              chatMessages={chatMessages}
              studentProfile={studentProfile}
              isSendingChatMessage={isSendingChatMessage}
              onSendChatMessage={handleSendChatMessage}
              onSelectReadingPreset={(id) => {
                const found = READING_PRESETS.find((p) => p.id === id);
                if (found) handleAnalyzeReadingPreset(found);
              }}
              onSelectStep={(idx) => {
                soundEngine.playRotaryClick(idx);
                setActiveStepIndex(idx);
              }}
              onSpeakStep={handleSpeakStep}
              onSpeakText={(txt) => speakTextWithBuddy(txt, "talking")}
              onChangeEquation={setEquationInput}
              onChangeVoiceNote={setVoiceNoteInput}
              onToggleRecordAudio={handleToggleRecordAudio}
              onSolveEquation={handleSolveEquation}
              chatTitle={subject === "science" ? "Study Buddy Science" : subject === "math" ? "Study Buddy Math" : "Study Buddy"}
              onSwitchScreenMode={(m) => {
                soundEngine.playKeyClick(1.0);
                setScreenMode(m);
              }}
              onAnswerCheck={(isCorrect, message) => {
                if (isCorrect) {
                  soundEngine.playBuddyChime("happy");
                  speakTextWithBuddy(message, "happy");
                } else {
                  soundEngine.playKeyClick(0.85);
                  speakTextWithBuddy(message, "curious");
                }
              }}
              onOpenKeyboard={handleOpenKeyboard}
              onStartNewSession={handleStartNewSession}
              onContinuePreviousStudies={handleContinuePreviousStudies}
              onDismissWelcomePrompt={() => setShowWelcomePrompt(false)}
            />

            {/* Bottom Hardware Control Deck: Knob, 6 LEDs, Face Box, PLAY / Camera / Calculator / Keyboard Keys, Speaker Grille & Logo */}
            <HardwareControlDeck
              mood={mood}
              isSpeaking={isSpeaking}
              speechPulse={speechPulse}
              activeLedCount={activeLedCount}
              knobAngle={knobAngle}
              screenMode={screenMode}
              isRecordingAudio={isRecordingAudio}
              onRotateKnob={handleRotateKnob}
              onSelectLed={handleSelectLed}
              onPressPlay={handlePressPlay}
              onPressCalculator={() => {
                handleOpenKeyboard("calculator");
              }}
              onPressKeyboard={() => {
                handleOpenKeyboard("qwerty");
              }}
              onPokeBuddy={handlePokeBuddy}
              buddyStatusCaption={buddyCaption}
            />
          </div>
        </div>

        {/* RIGHT COMPANION NOTEBOOK LAB (Synchronized with the Handheld Device on Desktop) */}
        {!deviceFocusOnly && (
          <CompanionLabPanel
            solution={solution}
            activeStepIndex={activeStepIndex}
            isSpeaking={isSpeaking}
            isRecordingAudio={isRecordingAudio}
            offlineOnlyMode={offlineOnlyMode}
            explanationDepth={explanationDepth}
            voiceNoteInput={voiceNoteInput}
            history={history}
            studentProfile={studentProfile}
            activeLlmProvider={activeLlmProvider}
            onOpenGrokModal={() => {}}
            onSelectStep={(idx) => {
              soundEngine.playRotaryClick(idx);
              setActiveStepIndex(idx);
            }}
            onSpeakStep={handleSpeakStep}
            onSpeakAllSteps={handlePressPlay}
            onSpeakText={(t) => speakTextWithBuddy(t, "talking")}
            onToggleOfflineMode={() => {
              soundEngine.playKeyClick(1.0);
              setOfflineOnlyMode((v) => !v);
            }}
            onChangeDepth={(d) => {
              soundEngine.playKeyClick(1.05);
              setExplanationDepth(d);
              handleSolveEquation(
                solution.detectedEquation,
                voiceNoteInput,
                solution.scannedImagePreview
              );
            }}
            onChangeVoiceNote={setVoiceNoteInput}
            onToggleRecordAudio={handleToggleRecordAudio}
            onQuickScanPreset={handleQuickScanPreset}
            onSelectHistoryItem={(item) => {
              soundEngine.playKeyClick(1.0);
              setSolution(item);
              setActiveStepIndex(0);
            }}
            onAnalyzeReadingPreset={handleAnalyzeReadingPreset}
            onUploadFileForAnalysis={(fileBase64, name) => {
              setScreenMode("chat");
              handleSendChatMessage(
                `Please analyze this uploaded document or article (${name}). Extract the main idea, key facts, and vocabulary!`,
                fileBase64,
                name
              );
            }}
          />
        )}
      </main>

      {/* Bottom Spawned Virtual Keyboard Drawer (Docked cleanly at the bottom like a normal keyboard) */}
      <VirtualSpawnKeyboard
        isOpen={isKeyboardOpen}
        keyboardType={keyboardType}
        activeTarget={screenMode === "chat" ? "chat" : "equation"}
        currentValue={screenMode === "chat" ? chatInputDraft : equationInput}
        isRecordingAudio={isRecordingAudio}
        studentName={studentProfile.nickname || studentProfile.name}
        onChangeValue={(val) => {
          if (screenMode === "chat") {
            setChatInputDraft(val);
          } else {
            setEquationInput(val);
          }
        }}
        onToggleRecordAudio={handleToggleRecordAudio}
        onSubmit={(val) => {
          setIsKeyboardOpen(false);
          if (screenMode === "chat") {
            handleSendChatMessage(val);
            setChatInputDraft("");
          } else {
            handleSolveEquation(val || equationInput, voiceNoteInput);
          }
        }}
        onClose={() => setIsKeyboardOpen(false)}
        onSwitchKeyboardType={(type) => {
          soundEngine.playKeyClick(1.0);
          setKeyboardType(type);
          if (screenMode !== "chat") {
            setScreenMode(type === "qwerty" ? "keyboard" : "calculator");
          }
        }}
      />

      {showModelsAdmin && me.isAdmin && <AdminModels onClose={() => setShowModelsAdmin(false)} onSaved={loadModels} />}
      {showGuestAdmin && me.isAdmin && <AdminGuestCodes onClose={() => setShowGuestAdmin(false)} />}

      {showCamera && (
        <CameraCapture
          onClose={() => setShowCamera(false)}
          onSend={(imgs, note) => {
            setShowCamera(false);
            setScreenMode("chat");
            handleSendChatMessage(note || (imgs.length > 1 ? `Help me with these ${imgs.length} photos.` : "Help me with this photo."), imgs[0], "photo.jpg", imgs);
          }}
        />
      )}
      {showStart && <StartScreen name={studentProfile.nickname || studentProfile.name} onPick={handleStartAction} />}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Take photo" onChange={(e) => readPicked(e, "photo")} />
      <input ref={uploadInputRef} type="file" accept="image/*,.txt,.pdf" className="hidden" aria-label="Upload file" onChange={(e) => readPicked(e, "upload")} />
      <footer className="text-center text-[11px] text-slate-500 py-2">
        18+ only · <a className="underline" href="/privacy.html">Privacy</a> · <a className="underline" href="/terms.html">Terms</a>
      </footer>
    </div>
  );
}
