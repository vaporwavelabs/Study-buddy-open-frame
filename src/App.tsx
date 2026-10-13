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
import { GrokBotHarnessModal } from "./components/GrokBotHarnessModal";
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
  const initialSolution = useCallback(
    () =>
      solveWithLocalGemmaEdge(
        HANDWRITTEN_PRESETS[0].equation,
        HANDWRITTEN_PRESETS[0].defaultVoiceNote,
        "standard"
      ),
    []
  );

  const [solution, setSolution] = useState<MathSolution>(initialSolution);
  const [history, setHistory] = useState<MathSolution[]>(() => [
    initialSolution(),
  ]);
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
      text: "Hi! I'm Study Buddy, your pocket tutor! 👋 What should I call you? Do you have a nickname you prefer, and what are we working on today?",
      spokenSummary: "Hi! I'm Study Buddy! What's your name or nickname, and what are we working on today?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [isSendingChatMessage, setIsSendingChatMessage] = useState<boolean>(false);
  const [chatInputDraft, setChatInputDraft] = useState<string>("");

  // Inputs & Engine state
  const [equationInput, setEquationInput] = useState<string>(
    HANDWRITTEN_PRESETS[0].equation
  );
  const [voiceNoteInput, setVoiceNoteInput] = useState<string>(
    HANDWRITTEN_PRESETS[0].defaultVoiceNote
  );
  const [offlineOnlyMode, setOfflineOnlyMode] = useState<boolean>(false);
  const [explanationDepth, setExplanationDepth] =
    useState<ExplanationDepth>("standard");
  const [isSolving, setIsSolving] = useState<boolean>(false);
  const [deviceFocusOnly, setDeviceFocusOnly] = useState<boolean>(false);

  // Startup Session Prompt state
  const [showWelcomePrompt, setShowWelcomePrompt] = useState<boolean>(true);
  const [hasSavedSession, setHasSavedSession] = useState<boolean>(false);
  const [previousSessionName, setPreviousSessionName] = useState<string>("");

  // Bottom Virtual Keyboard Spawn state
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [keyboardType, setKeyboardType] = useState<"calculator" | "qwerty">("qwerty");

  // Local LLM Hooks & Grok Bot Harness state
  const [activeLlmProvider, setActiveLlmProvider] = useState<LlmProviderConfig>({
    id: "local-edge",
    name: "Gemma 4 Edge (In-Browser Offline)",
    type: "local-edge",
    baseUrl: "browser://webgpu-wasm",
    model: "Gemma-4-Edge-Math-4B-IT",
    isEnabled: true,
    isReachable: true,
    statusMessage: "Default embedded offline symbolic & heuristic engine",
  });
  const [isGrokModalOpen, setIsGrokModalOpen] = useState<boolean>(false);

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

      // Try natural human-like Gemini TTS first if not forced into offline mode
      let playedWithCloud = false;
      if (!offlineOnlyMode) {
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
    async (text: string, fileBase64?: string, fileName?: string) => {
      if (!text.trim() && !fileBase64) return;

      stopSpeaking();
      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: "user",
        text: text.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        attachmentPreview: fileBase64,
        attachmentName: fileName,
      };

      setChatMessages((prev) => [...prev, userMsg]);
      setIsSendingChatMessage(true);
      setMood("thinking");
      setBuddyCaption("Thinking...");
      soundEngine.playKeyClick(1.0);

      // Check if student introduces their name (e.g. "my name is Maya", "I'm Alex", "call me Sam")
      const nameMatch =
        text.match(/(?:my name is|i am|i'm|call me|name's)\s+([A-Za-z]+)/i) ||
        text.match(/^hi,?\s+(?:i'm|i am)\s+([A-Za-z]+)/i);

      if (nameMatch && nameMatch[1]) {
        const extracted = nameMatch[1];
        setStudentProfile((prev) => ({
          ...prev,
          name: extracted,
          nickname: extracted,
        }));
      }

      // 1. Try cloud Gemini 3.8 Flash chat API if online
      if (!offlineOnlyMode) {
        try {
          const resp = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: text,
              history: chatMessages.slice(-6),
              studentProfile,
              imageBase64: fileBase64,
            }),
          });

          if (resp.ok) {
            const data = await resp.json();
            if (data && data.replyText) {
              const buddyMsg: ChatMessage = {
                id: `msg-${Date.now() + 1}`,
                sender: "buddy",
                text: data.replyText,
                spokenSummary: data.spokenSummary || data.replyText,
                timestamp: new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                readingAnalysis: data.readingAnalysis,
              };

              setChatMessages((prev) => [...prev, buddyMsg]);
              setIsSendingChatMessage(false);
              setMood(data.buddyMood || "happy");
              setBuddyCaption("Answered!");

              if (data.learnedStudentInfo) {
                setStudentProfile((prev) => ({
                  ...prev,
                  ...data.learnedStudentInfo,
                }));
              }

              speakTextWithBuddy(
                data.spokenSummary || data.replyText.slice(0, 140),
                data.buddyMood || "talking"
              );
              return;
            }
          }
        } catch {
          // Fallback to local edge solver below
        }
      }

      // 2. Offline Local Gemma Edge fallback
      const localResp = chatWithLocalGemmaEdge(text, studentProfile);
      const offlineMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "buddy",
        text: localResp.replyText,
        spokenSummary: localResp.spokenSummary,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setChatMessages((prev) => [...prev, offlineMsg]);
      setIsSendingChatMessage(false);
      setMood(localResp.buddyMood);
      setBuddyCaption("Answered offline!");

      if (localResp.learnedStudentInfo) {
        setStudentProfile((prev) => ({
          ...prev,
          ...localResp.learnedStudentInfo,
        }));
      }

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
        const response = await fetch("/api/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equationText: eqText,
            voiceTranscript: voiceText,
            imageBase64,
            audioBase64,
            difficultyMode: explanationDepth,
          }),
        });

        const data = await response.json();
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
            engineUsed: data.engine || "Gemma 4 Edge + Neural Assist",
            voiceNoteAttached: voiceText || undefined,
            scannedImagePreview: imageBase64,
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
        // Fallback to Local Gemma 4 Edge below
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
        const sampleNote =
          "Can you explain why we factor out the common number first and check the roots?";
        if (screenMode === "chat") {
          handleSendChatMessage(sampleNote);
        } else {
          setVoiceNoteInput(sampleNote);
        }
        setMood("happy");
        setBuddyCaption("Voice note added!");
        soundEngine.playBuddyChime("happy");
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
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-white/10 bg-[#1B1D21]">
        {/* Zone 1: Wordmark */}
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <span>STUDY BUDDY</span>
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
              soundEngine.playKeyClick(1.0);
              setScreenMode("camera");
            }}
            className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              screenMode === "camera" ? "text-[#EF5B14] font-bold" : ""
            }`}
          >
            Camera Scanner
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

        {/* Zone 3: 1 primary action + LLM / Grok Harness toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.playKeyClick(1.05);
              setIsGrokModalOpen(true);
            }}
            title="Configure Local LLM (Ollama, LM Studio, Grok) & Autonomous Codebase Harness"
            className="px-2.5 py-1.5 rounded-lg bg-[#EF5B14]/15 hover:bg-[#EF5B14]/25 border border-[#EF5B14]/40 text-[#FF8547] text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold hidden sm:inline">LLM / Grok:</span>
            <span className="font-mono text-white text-[11px] truncate max-w-[85px]">
              {activeLlmProvider.type === "local-edge" ? "Gemma Edge" : activeLlmProvider.model}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playKeyClick(1.1);
              setScreenMode("camera");
            }}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#EF5B14] hover:bg-[#F46925] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Scan Material
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
              onPressCamera={() => {
                soundEngine.playKeyClick(1.05);
                setScreenMode((prev) =>
                  prev === "camera" ? "solver" : "camera"
                );
              }}
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
            onOpenGrokModal={() => setIsGrokModalOpen(true)}
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

      {/* Local LLM Hooks & Grok Bot Autonomous Harness Modal */}
      <GrokBotHarnessModal
        isOpen={isGrokModalOpen}
        onClose={() => setIsGrokModalOpen(false)}
        activeProvider={activeLlmProvider}
        onSelectProvider={(p) => setActiveLlmProvider(p)}
      />
    </div>
  );
}
