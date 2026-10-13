import React, { useState } from "react";
import {
  Calculator as CalcIcon,
  ChevronDown,
  Delete,
  Keyboard as KeyboardIcon,
  Mic,
  MicOff,
  Send,
  Sparkles,
} from "lucide-react";
import { soundEngine } from "../services/localGemmaEdgeEngine";

export interface VirtualSpawnKeyboardProps {
  isOpen: boolean;
  keyboardType: "calculator" | "qwerty";
  activeTarget: "equation" | "chat";
  currentValue: string;
  isRecordingAudio: boolean;
  studentName?: string;
  onChangeValue: (val: string) => void;
  onToggleRecordAudio: () => void;
  onSubmit: (val: string) => void;
  onClose: () => void;
  onSwitchKeyboardType: (type: "calculator" | "qwerty") => void;
}

export const VirtualSpawnKeyboard: React.FC<VirtualSpawnKeyboardProps> = ({
  isOpen,
  keyboardType,
  activeTarget,
  currentValue,
  isRecordingAudio,
  studentName,
  onChangeValue,
  onToggleRecordAudio,
  onSubmit,
  onClose,
  onSwitchKeyboardType,
}) => {
  const [isShiftActive, setIsShiftActive] = useState(false);

  if (!isOpen) return null;

  const handleKeyPress = (val: string) => {
    soundEngine.playKeyClick(1.08);
    onChangeValue((currentValue || "") + val);
  };

  const handleBackspace = () => {
    soundEngine.playKeyClick(0.92);
    onChangeValue((currentValue || "").slice(0, -1));
  };

  const handleClear = () => {
    soundEngine.playKeyClick(0.85);
    onChangeValue("");
  };

  const handleSubmit = () => {
    soundEngine.playKeyClick(1.15);
    onSubmit(currentValue || "");
  };

  const qwertyRow1 = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const qwertyRow2 = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
  const qwertyRow3 = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
  const qwertyRow4 = ["z", "x", "c", "v", "b", "n", "m"];

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center justify-end select-none pointer-events-auto transition-transform duration-300 ease-out"
      role="region"
      aria-label="Virtual on-screen keyboard docked at bottom"
    >
      {/* Keyboard housing docked at bottom like normal mobile / tablet keyboard */}
      <div className="w-full max-w-2xl bg-[#1B1D22] border-t-2 border-x border-[#3A3D46] rounded-t-3xl shadow-[0_-16px_45px_rgba(0,0,0,0.85)] px-3 sm:px-5 pt-2 pb-3.5 text-white">
        {/* Grab Handle & Drag Dismiss */}
        <div
          className="w-12 h-1 bg-white/30 hover:bg-white/50 rounded-full mx-auto mb-2 cursor-pointer transition-colors"
          onClick={onClose}
          title="Tap to hide keyboard"
        />

        {/* Top Control Bar: Mode Toggle, Target Indicator, Mic, Dismiss */}
        <div className="flex flex-col gap-2 mb-2">
          <div className="flex items-center justify-between gap-2">
            {/* Keyboard Type Tabs (QWERTY vs Calculator) */}
            <div className="flex items-center gap-1 bg-black/50 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => onSwitchKeyboardType("qwerty")}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  keyboardType === "qwerty"
                    ? "bg-[#EF5B14] text-white shadow font-semibold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <KeyboardIcon className="w-3.5 h-3.5" />
                <span>QWERTY Type</span>
              </button>
              <button
                type="button"
                onClick={() => onSwitchKeyboardType("calculator")}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  keyboardType === "calculator"
                    ? "bg-[#EF5B14] text-white shadow font-semibold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <CalcIcon className="w-3.5 h-3.5" />
                <span>Math Calc</span>
              </button>
            </div>

            {/* Target Mode Label */}
            <div className="text-[11px] font-mono font-medium text-slate-300 hidden sm:flex items-center gap-1.5 truncate">
              <span className="w-2 h-2 rounded-full bg-[#EF5B14] animate-pulse" />
              <span>
                {activeTarget === "chat"
                  ? `Typing to Buddy ${studentName ? `(${studentName})` : ""}`
                  : "Math Solver Expression"}
              </span>
            </div>

            {/* Actions: Voice Note Mic & Hide Keyboard Button */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleRecordAudio}
                title="Speak voice note context"
                className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isRecordingAudio
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-white/10 hover:bg-white/15 text-slate-200"
                }`}
              >
                {isRecordingAudio ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : (
                  <Mic className="w-3.5 h-3.5 text-[#EF5B14]" />
                )}
                <span className="hidden sm:inline">
                  {isRecordingAudio ? "Listening..." : "Mic"}
                </span>
              </button>

              <button
                type="button"
                onClick={onClose}
                title="Hide keyboard"
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white cursor-pointer transition-colors flex items-center gap-1 text-xs"
                aria-label="Hide keyboard"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span className="text-[11px]">Hide</span>
              </button>
            </div>
          </div>

          {/* Real-time Typed Input Bar with Clear and Backspace */}
          <div className="flex items-center gap-2 bg-black/70 border border-white/20 focus-within:border-[#EF5B14] rounded-xl px-3 py-1.5 shadow-inner">
            <span className="text-xs font-mono text-[#EF5B14] font-bold shrink-0">
              {activeTarget === "chat" ? "CHAT:" : "MATH:"}
            </span>
            <input
              type="text"
              value={currentValue}
              onChange={(e) => onChangeValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder={
                activeTarget === "chat"
                  ? "Type your message, introduce yourself, or ask a question..."
                  : "e.g. 2x^2 - 8x + 6 = 0 or -3x + 7 < 19"
              }
              aria-label="Typed input preview"
              className="flex-1 bg-transparent text-sm sm:text-base font-mono text-white outline-none truncate"
            />
            {currentValue && (
              <button
                type="button"
                onClick={handleClear}
                className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-mono text-slate-300 cursor-pointer"
              >
                CLR
              </button>
            )}
            <button
              type="button"
              onClick={handleBackspace}
              title="Backspace"
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-slate-300 cursor-pointer"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* LAYOUT 1: NORMAL QWERTY TYPEWRITER KEYBOARD */}
        {keyboardType === "qwerty" && (
          <div className="flex flex-col gap-1 sm:gap-1.5">
            {/* Quick shortcuts / symbols bar */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-xs oled-scroll">
              {[
                "?",
                "!",
                "@",
                "#",
                "$",
                "%",
                "+",
                "-",
                "*",
                "/",
                "=",
                "(",
                ")",
                "x",
                "y",
                ",",
                ".",
              ].map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => handleKeyPress(sym)}
                  className="px-2 py-0.5 rounded-md bg-white/[0.08] hover:bg-white/[0.18] text-amber-200 font-mono font-medium shrink-0 cursor-pointer transition-colors text-[11px]"
                >
                  {sym}
                </button>
              ))}
            </div>

            {/* Row 1: Numbers */}
            <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
              {qwertyRow1.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => handleKeyPress(ch)}
                  className="h-9 sm:h-10 rounded-lg bg-[#272A31] hover:bg-[#32363F] active:scale-95 text-sm sm:text-base font-mono text-white flex items-center justify-center font-medium shadow-sm transition-all cursor-pointer"
                >
                  {ch}
                </button>
              ))}
            </div>

            {/* Row 2: Letters Q-P */}
            <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
              {qwertyRow2.map((ch) => {
                const char = isShiftActive ? ch.toUpperCase() : ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => handleKeyPress(char)}
                    className="h-9 sm:h-10 rounded-lg bg-[#2B2E36] hover:bg-[#373B46] active:scale-95 text-sm sm:text-base font-sans text-white flex items-center justify-center font-medium shadow-sm transition-all cursor-pointer"
                  >
                    {char}
                  </button>
                );
              })}
            </div>

            {/* Row 3: Letters A-L */}
            <div className="grid grid-cols-9 gap-1 sm:gap-1.5 px-3 sm:px-6">
              {qwertyRow3.map((ch) => {
                const char = isShiftActive ? ch.toUpperCase() : ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => handleKeyPress(char)}
                    className="h-9 sm:h-10 rounded-lg bg-[#2B2E36] hover:bg-[#373B46] active:scale-95 text-sm sm:text-base font-sans text-white flex items-center justify-center font-medium shadow-sm transition-all cursor-pointer"
                  >
                    {char}
                  </button>
                );
              })}
            </div>

            {/* Row 4: Shift, Letters Z-M, Backspace */}
            <div className="grid grid-cols-[1.2fr_repeat(7,1fr)_1.2fr] gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playKeyClick(0.9);
                  setIsShiftActive((v) => !v);
                }}
                className={`h-9 sm:h-10 rounded-lg flex items-center justify-center text-xs font-semibold transition-colors cursor-pointer ${
                  isShiftActive
                    ? "bg-[#EF5B14] text-white"
                    : "bg-[#22242B] text-slate-300 hover:bg-[#2D3039]"
                }`}
              >
                ⇧ SHIFT
              </button>

              {qwertyRow4.map((ch) => {
                const char = isShiftActive ? ch.toUpperCase() : ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => handleKeyPress(char)}
                    className="h-9 sm:h-10 rounded-lg bg-[#2B2E36] hover:bg-[#373B46] active:scale-95 text-sm sm:text-base font-sans text-white flex items-center justify-center font-medium shadow-sm transition-all cursor-pointer"
                  >
                    {char}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={handleBackspace}
                className="h-9 sm:h-10 rounded-lg bg-[#22242B] hover:bg-[#2D3039] active:scale-95 text-slate-300 flex items-center justify-center cursor-pointer transition-all"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            {/* Row 5: Switch to Calc, Space Bar, Submit Action */}
            <div className="grid grid-cols-[1.1fr_2.8fr_1.5fr] gap-1.5 sm:gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => onSwitchKeyboardType("calculator")}
                className="h-10 rounded-xl bg-[#22242B] hover:bg-[#2D3039] text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <CalcIcon className="w-3.5 h-3.5" />
                <span>123 Math</span>
              </button>

              <button
                type="button"
                onClick={() => handleKeyPress(" ")}
                className="h-10 rounded-xl bg-[#2B2E36] hover:bg-[#373B46] active:scale-[0.99] text-xs font-mono text-slate-300 flex items-center justify-center cursor-pointer transition-all border border-white/5"
              >
                SPACE
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                className="h-10 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-[#EF5B14]/25 cursor-pointer transition-all"
              >
                {activeTarget === "chat" ? (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Solve</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* LAYOUT 2: NORMAL SCIENTIFIC & ALGEBRA CALCULATOR KEYPAD */}
        {keyboardType === "calculator" && (
          <div className="flex flex-col gap-1 sm:gap-1.5">
            {/* Scientific algebra top row */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {[
                { l: "x", v: "x" },
                { l: "y", v: "y" },
                { l: "x²", v: "^2" },
                { l: "x³", v: "^3" },
                { l: "√", v: "√(" },
                { l: "(", v: "(" },
                { l: ")", v: ")" },
              ].map((sym) => (
                <button
                  key={sym.l}
                  type="button"
                  onClick={() => handleKeyPress(sym.v)}
                  className="h-9 sm:h-10 rounded-lg bg-[#222834] hover:bg-[#2C3444] text-sm sm:text-base font-mono font-bold text-cyan-300 flex items-center justify-center cursor-pointer transition-all border border-cyan-500/20 active:scale-95"
                >
                  {sym.l}
                </button>
              ))}
            </div>

            {/* Standard Number & Operator Matrix */}
            <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
              {[
                { l: "7", v: "7", type: "num" },
                { l: "8", v: "8", type: "num" },
                { l: "9", v: "9", type: "num" },
                { l: "÷", v: " / ", type: "op" },
                { l: "d/dx", v: "d/dx ", type: "fn" },

                { l: "4", v: "4", type: "num" },
                { l: "5", v: "5", type: "num" },
                { l: "6", v: "6", type: "num" },
                { l: "×", v: " * ", type: "op" },
                { l: "<", v: " < ", type: "op" },

                { l: "1", v: "1", type: "num" },
                { l: "2", v: "2", type: "num" },
                { l: "3", v: "3", type: "num" },
                { l: "-", v: " - ", type: "op" },
                { l: ">", v: " > ", type: "op" },

                { l: "0", v: "0", type: "num" },
                { l: ".", v: ".", type: "num" },
                { l: "=", v: " = ", type: "op" },
                { l: "+", v: " + ", type: "op" },
                { l: "^", v: "^", type: "op" },
              ].map((btn) => {
                const isOp = btn.type === "op";
                const isFn = btn.type === "fn";
                return (
                  <button
                    key={btn.l}
                    type="button"
                    onClick={() => handleKeyPress(btn.v)}
                    className={`h-9 sm:h-10 rounded-xl text-base sm:text-lg font-mono font-medium flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                      isOp
                        ? "bg-[#333742] hover:bg-[#3E4351] text-[#FF8547] font-bold"
                        : isFn
                        ? "bg-[#232936] hover:bg-[#2F3748] text-amber-300 font-semibold text-xs sm:text-sm"
                        : "bg-[#282B33] hover:bg-[#333742] text-white"
                    }`}
                  >
                    {btn.l}
                  </button>
                );
              })}
            </div>

            {/* Bottom Row: QWERTY toggle, DEL, and Submit */}
            <div className="grid grid-cols-[1fr_1fr_2fr] gap-1.5 sm:gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => onSwitchKeyboardType("qwerty")}
                className="h-10 rounded-xl bg-[#22242B] hover:bg-[#2D3039] text-xs font-semibold text-slate-300 flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <KeyboardIcon className="w-3.5 h-3.5" />
                <span>QWERTY</span>
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                className="h-10 rounded-xl bg-[#22242B] hover:bg-[#2D3039] text-slate-300 flex items-center justify-center gap-1 cursor-pointer transition-colors text-xs font-semibold"
              >
                <Delete className="w-4 h-4" />
                <span>DEL</span>
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                className="h-10 rounded-xl bg-[#EF5B14] hover:bg-[#F46925] active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-[#EF5B14]/25 cursor-pointer transition-all"
              >
                {activeTarget === "chat" ? (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Message</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Calculate &amp; Solve</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
