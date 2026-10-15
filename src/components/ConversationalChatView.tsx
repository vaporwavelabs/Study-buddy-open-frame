import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  Keyboard as KeyboardIcon,
  Lightbulb,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  ChatMessage,
  StudentProfile,
} from "../types/studyBuddy";
import { soundEngine } from "../services/localGemmaEdgeEngine";

interface ConversationalChatViewProps {
  chatMessages: ChatMessage[];
  studentProfile: StudentProfile;
  isSpeaking: boolean;
  isSendingMessage: boolean;
  isRecordingAudio: boolean;
  onSendMessage: (text: string, fileBase64?: string, fileName?: string) => void;
  onSpeakText: (text: string) => void;
  onToggleRecordAudio: () => void;
  onSelectReadingPreset: (presetId: string) => void;
  onOpenKeyboard: () => void;
  onPractice?: (question: string) => void;
  title?: string;
}

/* Browser speech-to-text (Web Speech API). Chrome/Edge/Safari run it on-device or via the browser vendor;
   nothing goes to our server. Firefox and many in-app browsers lack it, so callers must handle `supported=false`. */
type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
function getSR(): (new () => SR) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const ConversationalChatView: React.FC<ConversationalChatViewProps> = ({
  chatMessages,
  studentProfile,
  isSpeaking,
  isSendingMessage,
  isRecordingAudio,
  onSendMessage,
  onSpeakText,
  onToggleRecordAudio,
  onSelectReadingPreset,
  onOpenKeyboard,
  onPractice,
  title,
}) => {
  const [inputText, setInputText] = useState("");
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const recRef = useRef<SR | null>(null);
  const baseRef = useRef("");
  const wantRef = useRef(false);
  const micSupported = typeof window !== "undefined" && !!getSR();

  const stopListening = () => { wantRef.current = false; recRef.current?.stop(); setListening(false); };
  const startListening = () => {
    const Ctor = getSR();
    if (!Ctor) { setMicNote("Voice typing isn't supported in this browser. Try Chrome, Edge or Safari, or type instead."); return; }
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = inputText ? inputText.replace(/\s*$/, " ") : "";
    rec.onresult = (e) => {
      let finalTxt = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalTxt += r[0].transcript; else interim += r[0].transcript;
      }
      if (finalTxt) baseRef.current = (baseRef.current + finalTxt).replace(/\s+/g, " ").trimStart() + " ";
      setInputText((baseRef.current + interim).trimStart());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { wantRef.current = false; setMicNote("Microphone access is blocked. Allow the mic for this site, or type instead."); }
      else if (e.error === "network") { wantRef.current = false; setMicNote("Voice typing needs the browser's speech service, which isn't reachable. Type instead."); }
    };
    // Browsers end a session after silence; keep listening until the student turns the mic off.
    rec.onend = () => { if (wantRef.current) { try { rec.start(); return; } catch { /* fall through */ } } setListening(false); };
    recRef.current = rec;
    wantRef.current = true;
    setMicNote(null);
    try { rec.start(); setListening(true); } catch { setMicNote("Couldn't start the microphone. Try again."); }
  };
  useEffect(() => () => { wantRef.current = false; recRef.current?.abort(); }, []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, isSendingMessage]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    soundEngine.playKeyClick(1.1);
    if (listening) stopListening();
    const msg = inputText.trim();
    setInputText("");
    baseRef.current = "";
    onSendMessage(msg);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        soundEngine.playBuddyChime("scan");
        onSendMessage(
          inputText.trim() || `Please analyze this reading material: ${file.name}`,
          reader.result,
          file.name
        );
        setInputText("");
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="relative z-10 flex-1 flex flex-col justify-between pt-0.5 overflow-hidden select-none">
      {/* Top Conversation Header with Student Name */}
      <div className="flex items-center justify-between px-1 pb-1.5 border-b border-white/10 shrink-0 text-xs">
        <div className="flex items-center gap-1.5 truncate">
          <span className="w-2 h-2 rounded-full bg-[#EF5B14] shrink-0 animate-pulse" />
          <span className="font-semibold text-white truncate text-[11px] sm:text-xs">
            {title || "Study Buddy"}
          </span>
          {studentProfile.currentNeed && (
            <span className="text-[10px] text-slate-400 hidden sm:inline truncate">
              · {studentProfile.currentNeed}
            </span>
          )}
        </div>

      </div>

      {/* Scrollable Message Thread */}
      <div
        ref={scrollRef}
        className="my-1 flex-1 overflow-y-auto oled-scroll pr-1 space-y-2 max-h-[175px] sm:max-h-[190px]"
      >
        {chatMessages.map((msg) => {
          const isBuddy = msg.sender === "buddy";
          if (msg.pending) {
            return (
              <div key={msg.id} data-testid="pending-reply" data-reply-to={msg.replyTo} className="flex items-center gap-2 text-xs text-slate-400 italic px-2 py-1">
                <Sparkles className="w-3.5 h-3.5 text-[#EF5B14] animate-spin" />
                <span>Study Buddy is reading &amp; thinking...</span>
              </div>
            );
          }
          return (
            <div
              key={msg.id} data-testid={isBuddy ? "buddy-msg" : "user-msg"} data-msg-id={msg.id}
              className={`flex flex-col ${isBuddy ? "items-start" : "items-end"}`}
            >
              <div
                className={`max-w-[94%] sm:max-w-[88%] rounded-2xl px-2.5 py-1.5 text-[11.5px] leading-relaxed ${
                  isBuddy
                    ? "bg-[#181C24] border border-white/10 text-slate-200 shadow-sm"
                    : "bg-[#EF5B14] text-white font-medium"
                }`}
              >
                {/* Image/File attachment badge */}
                {msg.attachmentPreview && !(msg.attachments && msg.attachments.length > 1) && (
                  <div className="mb-1.5 rounded-lg overflow-hidden border border-white/20">
                    <img
                      src={msg.attachmentPreview}
                      alt="Uploaded reading material"
                      referrerPolicy="no-referrer"
                      className="max-h-24 w-full object-cover"
                    />
                    {msg.attachmentName && (
                      <div className="px-2 py-0.5 bg-black/70 text-[9.5px] font-mono text-slate-300 truncate">
                        {msg.attachmentName}
                      </div>
                    )}
                  </div>
                )}

                {/* Message prose */}
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Structured Reading Analysis Card */}
                {msg.readingAnalysis && (
                  <div className="mt-2 pt-1.5 border-t border-white/15 space-y-1.5 bg-black/40 rounded-xl p-2 text-[10.5px]">
                    {/* Main Idea */}
                    <div className="rounded-lg bg-amber-500/15 border border-amber-400/30 p-1.5 text-amber-100">
                      <div className="flex items-center gap-1 font-bold text-[9.5px] text-amber-300 uppercase tracking-wider mb-0.5">
                        <Lightbulb className="w-3 h-3 text-amber-300" />
                        <span>Central Main Idea</span>
                      </div>
                      <p className="leading-snug">{msg.readingAnalysis.mainIdea}</p>
                    </div>

                    {/* Factual Information & Evidence */}
                    {msg.readingAnalysis.facts && msg.readingAnalysis.facts.length > 0 && (
                      <div>
                        <div className="font-semibold text-slate-300 flex items-center gap-1 mb-0.5 text-[9.5px]">
                          <FileText className="w-3 h-3 text-cyan-400" />
                          <span>Key Factual Details:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[10px]">
                          {msg.readingAnalysis.facts.map((fact, idx) => (
                            <li key={idx} className="leading-tight">{fact}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Vocabulary */}
                    {msg.readingAnalysis.vocabulary && msg.readingAnalysis.vocabulary.length > 0 && (
                      <div className="pt-1 border-t border-white/10">
                        <div className="font-semibold text-emerald-300 mb-0.5 text-[9.5px] flex items-center gap-1">
                          <BookOpen className="w-3 h-3 text-emerald-300" />
                          <span>Key Vocabulary:</span>
                        </div>
                        <div className="space-y-0.5">
                          {msg.readingAnalysis.vocabulary.map((v, idx) => (
                            <div key={idx} className="text-[9.5px] leading-tight">
                              <span className="font-bold text-white">{v.term}:</span>{" "}
                              <span className="text-slate-300">{v.definition}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Takeaway */}
                    {msg.readingAnalysis.takeaway && (
                      <div className="text-[9.5px] text-slate-400 italic pt-0.5 border-t border-white/10">
                        Takeaway: {msg.readingAnalysis.takeaway}
                      </div>
                    )}
                  </div>
                )}

                {!isBuddy && msg.attachments && msg.attachments.length > 1 && (
                  <div className="mb-1 grid grid-cols-4 gap-1" data-testid="msg-thumbs">
                    {msg.attachments.map((src, i) => <img key={i} src={src} alt={`Photo ${i + 1}`} className="w-full aspect-square object-cover rounded" />)}
                  </div>
                )}

                {isBuddy && msg.practice && msg.practice.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1" data-testid="practice-chips">
                    <span className="text-[9.5px] text-slate-400">Practice:</span>
                    {msg.practice.map((q) => (
                      <button key={q.question} type="button" data-testid="practice-chip"
                        onClick={() => (onPractice ? onPractice(q.question) : onSendMessage(`Solve ${q.question}`))}
                        className="px-2 py-0.5 rounded-full bg-[#EF5B14]/25 border border-[#EF5B14]/60 text-white text-[10px] font-mono">{q.question}</button>
                    ))}
                  </div>
                )}

                {isBuddy && msg.toolLinks && msg.toolLinks.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="tool-links">
                    {msg.toolLinks.map((l) => (
                      <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-full bg-red-600/90 text-white text-[10px] font-semibold">🧰 {l.title} ↗</a>
                    ))}
                  </div>
                )}

                {/* Voice button for Buddy message */}
                {isBuddy && (
                  <div className="mt-1 flex items-center justify-between pt-1 border-t border-white/10 text-[9.5px] text-slate-400">
                    <span className="font-mono">{msg.timestamp}</span>
                    <button
                      type="button"
                      onClick={() => onSpeakText(msg.spokenSummary || msg.text)}
                      className="inline-flex items-center gap-1 text-[#EF5B14] hover:text-white transition-colors cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3" />
                      <span>{isSpeaking ? "Speaking..." : "Read Aloud"}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}


      </div>

      {micNote && <div className="text-[10px] text-amber-300 px-1 pb-0.5" role="status" data-testid="mic-note">{micNote}</div>}
      {listening && <div className="text-[10px] text-red-300 px-1 pb-0.5 flex items-center gap-1" role="status" data-testid="mic-live"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Listening… tap the mic to stop, then Send.</div>}
      {/* Input Message & Action Bar */}
      <div className="pt-1 flex items-center gap-1 shrink-0">
        {/* File/Photo Upload */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload reading material, article photo, or document"
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer transition-colors shrink-0"
        >
          <Paperclip className="w-3.5 h-3.5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.txt,.pdf"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Voice typing: transcribes into the box; nothing is sent until Send is pressed */}
        <button
          type="button"
          onClick={() => (listening ? stopListening() : startListening())}
          title={micSupported ? (listening ? "Stop voice typing" : "Voice typing") : "Voice typing not supported in this browser"}
          aria-label={listening ? "Microphone on, tap to stop" : "Microphone off, tap to talk"}
          aria-pressed={listening}
          data-testid="mic-button"
          data-state={listening ? "on" : "off"}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
            listening ? "bg-red-500 text-white ring-2 ring-red-300 animate-pulse" : micSupported ? "bg-white/10 hover:bg-white/20 text-slate-200" : "bg-white/5 text-slate-500"
          }`}
        >
          {listening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
        </button>

        {/* Spawn Virtual Keyboard Button */}
        <button
          type="button"
          onClick={onOpenKeyboard}
          title="Spawn full keyboard at bottom"
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer transition-colors shrink-0"
        >
          <KeyboardIcon className="w-3.5 h-3.5 text-[#EF5B14]" />
        </button>

        {/* Text Input */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={listening ? "Listening…" : "Ask a question…"}
          aria-label="Chat with Study Buddy"
          className="flex-1 bg-black/60 border border-white/15 focus:border-[#EF5B14] rounded-lg px-2 py-1 text-xs text-white placeholder:text-slate-500 outline-none truncate"
        />

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputText.trim() || isSendingMessage}
          className="p-1.5 rounded-lg bg-[#EF5B14] hover:bg-[#F46925] disabled:opacity-40 text-white cursor-pointer transition-colors shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
