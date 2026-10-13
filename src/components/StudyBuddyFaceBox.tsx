import React, { useEffect, useState } from "react";
import { BuddyMood } from "../types/studyBuddy";

interface StudyBuddyFaceBoxProps {
  mood: BuddyMood;
  isSpeaking: boolean;
  speechPulse: number;
  onPokeBuddy: () => void;
  statusCaption?: string;
}

export const StudyBuddyFaceBox: React.FC<StudyBuddyFaceBoxProps> = ({
  mood,
  isSpeaking,
  speechPulse,
  onPokeBuddy,
  statusCaption,
}) => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [thinkTick, setThinkTick] = useState(0);

  // Natural periodic eye blink
  useEffect(() => {
    const interval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, 3600);
    return () => clearInterval(interval);
  }, []);

  // Animation tick for thinking/scanning/talking micro-movements
  useEffect(() => {
    if (mood === "resting" && !isSpeaking) return;
    const timer = setInterval(() => {
      setThinkTick((t) => (t + 1) % 60);
    }, 90);
    return () => clearInterval(timer);
  }, [mood, isSpeaking]);

  const activeMood: BuddyMood = isSpeaking ? "talking" : mood;

  // Eye offsets for thinking / scanning / curious
  const eyeOffsetX =
    activeMood === "thinking"
      ? Math.sin(thinkTick * 0.35) * 6
      : activeMood === "scanning"
      ? Math.sin(thinkTick * 0.5) * 9
      : activeMood === "curious"
      ? 3
      : 0;

  const eyeOffsetY =
    activeMood === "thinking"
      ? -4 + Math.cos(thinkTick * 0.35) * 3
      : activeMood === "listening"
      ? -2
      : 0;

  // Eye height for blinking or happy squint
  const leftEyeHeight = isBlinking
    ? 4
    : activeMood === "happy"
    ? 18
    : activeMood === "scanning"
    ? 16
    : 22;

  const rightEyeHeight = isBlinking
    ? 4
    : activeMood === "curious"
    ? 26
    : activeMood === "happy"
    ? 18
    : activeMood === "scanning"
    ? 16
    : 22;

  return (
    <button
      type="button"
      onClick={onPokeBuddy}
      title="Tap Study Buddy for a friendly pep talk or math hint!"
      aria-label={`Study Buddy animated face (${activeMood}). Tap to interact.`}
      className="buddy-face-housing relative w-full aspect-square rounded-[10px] border border-[#0E1520] flex flex-col items-center justify-center select-none cursor-pointer group overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EF5B14] active:scale-[0.985] transition-transform duration-150"
    >
      {/* Subtle scanning laser sweep when in scanning mode */}
      {activeMood === "scanning" && (
        <div
          className="absolute inset-x-2 h-0.5 bg-[#EF5B14]/70 pointer-events-none transition-transform duration-100"
          style={{
            transform: `translateY(${Math.sin(thinkTick * 0.4) * 42}px)`,
          }}
        />
      )}

      {/* Subtle listening soundwave ring when recording voice note */}
      {activeMood === "listening" && (
        <div className="absolute inset-2 rounded-[7px] border border-[#EF5B14]/45 animate-pulse pointer-events-none" />
      )}

      {/* SVG Face matching exact proportions of IMG_8382.jpeg */}
      <svg
        viewBox="0 0 140 140"
        className="w-[82%] h-[82%] overflow-visible"
        aria-hidden="true"
      >
        {/* Optional expressive eyebrows when thinking / curious / happy */}
        {activeMood === "thinking" && (
          <>
            <line
              x1={32 + eyeOffsetX * 0.6}
              y1={36}
              x2={54 + eyeOffsetX * 0.6}
              y2={32}
              stroke="#FFFFFF"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <line
              x1={86 + eyeOffsetX * 0.6}
              y1={30}
              x2={108 + eyeOffsetX * 0.6}
              y2={35}
              stroke="#FFFFFF"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          </>
        )}

        {activeMood === "curious" && (
          <path
            d="M 84 31 Q 96 23 108 31"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        )}

        {/* Left Rounded-Square Eye (exact position & radius from reference photo) */}
        <rect
          x={32 + eyeOffsetX}
          y={44 + eyeOffsetY + (22 - leftEyeHeight) / 2}
          width={22}
          height={leftEyeHeight}
          rx={4.5}
          fill="#FFFFFF"
        />

        {/* Right Rounded-Square Eye */}
        <rect
          x={86 + eyeOffsetX}
          y={44 + eyeOffsetY + (22 - rightEyeHeight) / 2}
          width={22}
          height={rightEyeHeight}
          rx={4.5}
          fill="#FFFFFF"
        />

        {/* Mouth Geometry by Mood */}
        {activeMood === "talking" ? (
          // Animated talking mouth synced with speech syllables
          (() => {
            const openAmount = 6 + ((speechPulse + thinkTick) % 4) * 5;
            return (
              <path
                d={`M 36 86 Q 70 ${106 + openAmount} 104 86 Q 70 ${
                  92 - openAmount * 0.35
                } 36 86 Z`}
                fill="#FFFFFF"
              />
            );
          })()
        ) : activeMood === "thinking" ? (
          // Thoughtful wavy/pursed mouth
          <path
            d={`M 48 94 Q 60 ${89 + Math.sin(thinkTick * 0.5) * 4} 72 94 T 94 92`}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="8"
            strokeLinecap="round"
          />
        ) : activeMood === "listening" ? (
          // Attentive "O" mouth while listening to student's audio note
          <ellipse
            cx={70}
            cy={93}
            rx={12 + (thinkTick % 3) * 1.5}
            ry={9 + (thinkTick % 2) * 1.5}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="7.5"
          />
        ) : activeMood === "happy" ? (
          // Big beaming smile
          <path
            d="M 32 84 C 44 114, 96 114, 108 84"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="10"
            strokeLinecap="round"
          />
        ) : (
          // Default signature Study Buddy smile matching IMG_8382.jpeg
          <path
            d="M 35 85 C 47 110, 93 110, 105 85"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="9.5"
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Quiet bottom state caption inside the face pad on hover or active task */}
      <span className="absolute bottom-1.5 inset-x-2 text-center text-[9px] font-mono tracking-wider uppercase text-white/45 group-hover:text-white/80 transition-colors truncate">
        {statusCaption || activeMood}
      </span>
    </button>
  );
};
