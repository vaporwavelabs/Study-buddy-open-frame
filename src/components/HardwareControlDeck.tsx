import React from "react";
import { BuddyMood, ScreenMode } from "../types/studyBuddy";
import { StudyBuddyFaceBox } from "./StudyBuddyFaceBox";

interface HardwareControlDeckProps {
  mood: BuddyMood;
  isSpeaking: boolean;
  speechPulse: number;
  activeLedCount: number; // 1 to 6
  knobAngle: number;
  screenMode: ScreenMode;
  isRecordingAudio: boolean;
  onRotateKnob: (direction: 1 | -1) => void;
  onSelectLed: (ledIndex: number) => void;
  onPressPlay: () => void;
  onPressCamera: () => void;
  onPressCalculator: () => void;
  onPressKeyboard: () => void;
  onPokeBuddy: () => void;
  buddyStatusCaption?: string;
}

export const HardwareControlDeck: React.FC<HardwareControlDeckProps> = ({
  mood,
  isSpeaking,
  speechPulse,
  activeLedCount,
  knobAngle,
  screenMode,
  isRecordingAudio,
  onRotateKnob,
  onSelectLed,
  onPressPlay,
  onPressCamera,
  onPressCalculator,
  onPressKeyboard,
  onPokeBuddy,
  buddyStatusCaption,
}) => {
  // 12x12 perforated grid for the speaker grille matching IMG_8382.jpeg
  const grilleRows = Array.from({ length: 12 });
  const grilleCols = Array.from({ length: 12 });

  return (
    <div className="w-full px-5 pt-4 pb-5 flex flex-col justify-between select-none">
      {/* Main 3-Column Tactile Control Matrix */}
      <div className="grid grid-cols-[1.28fr_0.58fr_1.28fr] gap-3.5 items-start">
        {/* LEFT COLUMN: Brushed Metal Rotary Knob + 6 LED Dots + Study Buddy Face Box */}
        <div className="flex flex-col gap-3">
          {/* Top Row: Rotary Encoder Knob + 6 LED Indicator Dots */}
          <div className="h-[52px] flex items-center justify-between pr-0.5">
            {/* Conical Brushed Metal Rotary Knob */}
            <button
              type="button"
              onClick={() => onRotateKnob(1)}
              onContextMenu={(e) => {
                e.preventDefault();
                onRotateKnob(-1);
              }}
              title="Click to step forward through solution steps (Right-click to step back)"
              aria-label="Rotary step & depth selector knob"
              className="relative w-[44px] h-[44px] rounded-full rotary-knob-metal border border-[#8E9094] flex items-center justify-center cursor-pointer active:scale-95 transition-transform shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EF5B14]"
            >
              {/* Knurled outer rim texture */}
              <div
                className="w-full h-full rounded-full flex items-start justify-center pt-1 transition-transform duration-150"
                style={{ transform: `rotate(${knobAngle}deg)` }}
              >
                {/* White/silver position indicator notch */}
                <span className="w-[2.5px] h-[10px] rounded-full bg-white shadow-[0_0_2px_rgba(0,0,0,0.45)]" />
              </div>
            </button>

            {/* 6 Circular LED Indicators (first N lit in warm orange #EF5B14, rest grey) */}
            <div
              className="flex items-center gap-[6px]"
              role="group"
              aria-label="Step progress LEDs"
            >
              {[1, 2, 3, 4, 5, 6].map((ledNum) => {
                const isLit = ledNum <= activeLedCount;
                return (
                  <button
                    key={ledNum}
                    type="button"
                    onClick={() => onSelectLed(ledNum)}
                    title={`Jump to Step ${ledNum}`}
                    aria-label={`Step LED ${ledNum}`}
                    className="p-1 -m-1 cursor-pointer focus-visible:outline-1 focus-visible:outline-[#EF5B14] rounded-full"
                  >
                    <span
                      className={`block w-[7px] h-[7px] rounded-full transition-all duration-150 ${
                        isLit
                          ? "bg-[#EE621B] shadow-[0_0_5px_rgba(238,98,27,0.75),inset_0_0.5px_1px_rgba(255,255,255,0.45)]"
                          : "bg-[#8D8F92] shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.38)]"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom-Left: Animated Square Study Buddy Face Pad */}
          <StudyBuddyFaceBox
            mood={mood}
            isSpeaking={isSpeaking}
            speechPulse={speechPulse}
            onPokeBuddy={onPokeBuddy}
            statusCaption={buddyStatusCaption}
          />
        </div>

        {/* CENTER COLUMN: 4 Tactile Keycaps (PLAY, CAMERA, CALCULATOR, KEYBOARD) */}
        <div className="flex flex-col items-center gap-2.5">
          {/* 1. Orange PLAY Button */}
          <div className="w-full aspect-square p-[2px] rounded-[9px] tactile-key-well">
            <button
              type="button"
              onClick={onPressPlay}
              title={
                isSpeaking
                  ? "Pause Study Buddy voice walkthrough"
                  : "Play natural voice step-by-step walkthrough"
              }
              aria-label={isSpeaking ? "Pause voice explanation" : "Play voice explanation"}
              className={`w-full h-full rounded-[7px] tactile-key-orange flex flex-col items-center justify-start pt-1.5 cursor-pointer transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                isSpeaking ? "ring-2 ring-white/80" : ""
              }`}
            >
              <span className="text-[9px] font-semibold tracking-[0.08em] text-white/95 leading-none">
                {isSpeaking ? "STOP" : "PLAY"}
              </span>
              {isSpeaking && (
                <span className="mt-1.5 flex items-end gap-0.5 h-2.5">
                  <span className="w-0.5 h-1.5 bg-white/90 animate-bounce" />
                  <span className="w-0.5 h-2.5 bg-white/90 animate-pulse" />
                  <span className="w-0.5 h-1 bg-white/90 animate-bounce" />
                </span>
              )}
            </button>
          </div>

          {/* 2. Dark Grey Camera Button */}
          <div className="w-full aspect-square p-[2px] rounded-[9px] tactile-key-well">
            <button
              type="button"
              onClick={onPressCamera}
              title="Open Camera & Handwriting Scanner"
              aria-label="Open Camera to scan handwritten equations"
              className={`w-full h-full rounded-[7px] tactile-key-dark flex items-center justify-center cursor-pointer transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EF5B14] ${
                screenMode === "camera" ? "ring-2 ring-[#EF5B14]" : ""
              }`}
            >
              {/* Camera Icon */}
              <svg
                viewBox="0 0 32 26"
                className="w-[60%] h-[60%] text-[#DCDEE1]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M11.5 2C10.7 2 10 2.5 9.7 3.2L8.5 6H4C2.3 6 1 7.3 1 9V21C1 22.7 2.3 24 4 24H28C29.7 24 31 22.7 31 21V9C31 7.3 29.7 6 28 6H23.5L22.3 3.2C22 2.5 21.3 2 20.5 2H11.5ZM16 9.5C19.3 9.5 22 12.2 22 15.5C22 18.8 19.3 21.5 16 21.5C12.7 21.5 10 18.8 10 15.5C10 12.2 12.7 9.5 16 9.5ZM16 12C14.1 12 12.5 13.6 12.5 15.5C12.5 17.4 14.1 19 16 19C17.9 19 19.5 17.4 19.5 15.5C19.5 13.6 17.9 12 16 12Z" />
              </svg>
            </button>
          </div>

          {/* 3. CALCULATOR Button */}
          <div className="w-full aspect-square p-[2px] rounded-[9px] tactile-key-well">
            <button
              type="button"
              onClick={onPressCalculator}
              title="Spawn Smart Math Calculator Keyboard"
              aria-label="Open Calculator Keypad"
              className={`w-full h-full rounded-[7px] tactile-key-mid flex items-center justify-center cursor-pointer transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EF5B14] ${
                screenMode === "calculator" ? "ring-2 ring-[#EF5B14]" : ""
              }`}
            >
              {/* Crisp Calculator Icon */}
              <svg
                viewBox="0 0 28 32"
                className="w-[58%] h-[58%] text-[#EAEBED]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="24" height="28" rx="4" />
                <rect x="6" y="6" width="16" height="5" rx="1.5" fill="currentColor" stroke="none" />
                {/* 2x3 key grid */}
                <circle cx="8" cy="16" r="1.5" fill="currentColor" />
                <circle cx="14" cy="16" r="1.5" fill="currentColor" />
                <circle cx="20" cy="16" r="1.5" fill="currentColor" />
                <circle cx="8" cy="22" r="1.5" fill="currentColor" />
                <circle cx="14" cy="22" r="1.5" fill="currentColor" />
                <circle cx="20" cy="22" r="1.5" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* 4. KEYBOARD Button */}
          <div className="w-full aspect-square p-[2px] rounded-[9px] tactile-key-well">
            <button
              type="button"
              onClick={onPressKeyboard}
              title="Spawn Full QWERTY Typewriter Keyboard to type text/equations"
              aria-label="Open Full Typewriter Keyboard"
              className={`w-full h-full rounded-[7px] tactile-key-dark flex items-center justify-center cursor-pointer transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EF5B14] ${
                screenMode === "keyboard" ? "ring-2 ring-[#EF5B14]" : ""
              }`}
            >
              {/* Crisp Keyboard Icon */}
              <svg
                viewBox="0 0 36 24"
                className="w-[64%] h-[64%] text-[#E3E4E6]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="2" y="3" width="32" height="18" rx="2.5" />
                <rect x="6" y="7" width="3" height="2.5" fill="currentColor" stroke="none" />
                <rect x="11" y="7" width="3" height="2.5" fill="currentColor" stroke="none" />
                <rect x="16" y="7" width="3" height="2.5" fill="currentColor" stroke="none" />
                <rect x="21" y="7" width="3" height="2.5" fill="currentColor" stroke="none" />
                <rect x="26" y="7" width="4" height="2.5" fill="currentColor" stroke="none" />
                <rect x="6" y="11.5" width="4" height="2.5" fill="currentColor" stroke="none" />
                <rect x="12" y="11.5" width="3" height="2.5" fill="currentColor" stroke="none" />
                <rect x="17" y="11.5" width="3" height="2.5" fill="currentColor" stroke="none" />
                <rect x="22" y="11.5" width="3" height="2.5" fill="currentColor" stroke="none" />
                <rect x="27" y="11.5" width="3" height="2.5" fill="currentColor" stroke="none" />
                <rect x="10" y="16" width="16" height="2.5" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Perforated 12x12 Speaker Grille Module */}
        <div className="flex flex-col">
          <div
            className="speaker-module-housing relative w-full aspect-square rounded-[9px] p-[7px] flex items-center justify-center overflow-hidden"
            title="Study Buddy Offline TTS Speaker & Voice Context Microphone"
          >
            {/* Underlying circular acoustic driver cone visible behind center holes */}
            <div
              className={`absolute w-[66%] h-[66%] rounded-full bg-[#151618] transition-transform duration-100 pointer-events-none ${
                isSpeaking || isRecordingAudio ? "scale-105" : "scale-100"
              }`}
            />

            {/* 12x12 Perforated Hole Matrix */}
            <div className="relative z-10 w-full h-full grid grid-cols-12 gap-[3px] items-center justify-items-center">
              {grilleRows.map((_, rIdx) =>
                grilleCols.map((__, cIdx) => {
                  const dist = Math.hypot(rIdx - 5.5, cIdx - 5.5);
                  const overDriverCone = dist < 4.1;
                  return (
                    <span
                      key={`${rIdx}-${cIdx}`}
                      className={`w-[5.5px] h-[5.5px] rounded-full ${
                        overDriverCone
                          ? "bg-[#121315] shadow-[inset_0_1px_1px_rgba(0,0,0,0.95)]"
                          : "bg-[#5C5E61] shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.65),0_0.5px_0_rgba(255,255,255,0.35)]"
                      }`}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Chassis Brand Lockup: Exact Double-Outlined "STUDY BUDDY" Logo from IMG_8382.jpeg */}
      <div className="mt-7 mb-1 flex flex-col items-center justify-center">
        <svg
          viewBox="0 0 280 112"
          className="w-[150px] h-auto select-none"
          aria-label="STUDY BUDDY"
        >
          <g
            fontFamily="'Fredoka', 'Plus Jakarta Sans', sans-serif"
            fontWeight="700"
            textAnchor="middle"
            letterSpacing="2"
          >
            {/* Thick black outer silhouette */}
            <text
              x="140"
              y="50"
              fontSize="44"
              fill="#111214"
              stroke="#111214"
              strokeWidth="22"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              STUDY
            </text>
            <text
              x="140"
              y="93"
              fontSize="44"
              fill="#111214"
              stroke="#111214"
              strokeWidth="22"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              BUDDY
            </text>

            {/* Inner chassis-colored cutout ring */}
            <text
              x="140"
              y="50"
              fontSize="44"
              fill="#CACBCD"
              stroke="#CACBCD"
              strokeWidth="10"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              STUDY
            </text>
            <text
              x="140"
              y="93"
              fontSize="44"
              fill="#CACBCD"
              stroke="#CACBCD"
              strokeWidth="10"
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              BUDDY
            </text>

            {/* Core bold black letterforms */}
            <text x="140" y="50" fontSize="44" fill="#111214">
              STUDY
            </text>
            <text x="140" y="93" fontSize="44" fill="#111214">
              BUDDY
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
};
