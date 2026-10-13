export type BuddyMood =
  | "resting"
  | "thinking"
  | "talking"
  | "scanning"
  | "listening"
  | "happy"
  | "excited"
  | "curious";

export type ScreenMode =
  | "solver"
  | "camera"
  | "calculator"
  | "keyboard"
  | "chat";

export type ExplanationDepth = "concise" | "standard" | "deep-eli10";

export interface SolutionStep {
  stepNumber: number;
  title: string;
  mathExpression: string;
  explanation: string;
  spokenScript: string;
  buddyMood: BuddyMood;
  tip?: string;
}

export interface ComprehensionCheck {
  question: string;
  options: string[];
  correctIndex: number;
  encouragementOnCorrect: string;
  hintOnRetry: string;
}

export interface MathSolution {
  id: string;
  timestamp: string;
  detectedEquation: string;
  category: string;
  finalAnswer: string;
  audioContextInsight: string;
  buddyGreeting: string;
  steps: SolutionStep[];
  comprehensionCheck: ComprehensionCheck;
  engineUsed: string;
  voiceNoteAttached?: string;
  scannedImagePreview?: string;
}

export interface HandwrittenPreset {
  id: string;
  label: string;
  topic: string;
  equation: string;
  handwrittenLines: string[];
  defaultVoiceNote: string;
}

export interface StudentProfile {
  name: string;
  nickname: string;
  currentNeed: string;
  gradeLevel: string;
  favoriteSubject: string;
}

export interface ReadingAnalysis {
  mainIdea: string;
  facts: string[];
  vocabulary?: Array<{ term: string; definition: string }>;
  takeaway?: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "buddy";
  text: string;
  timestamp: string;
  spokenSummary?: string;
  attachmentPreview?: string;
  attachmentName?: string;
  readingAnalysis?: ReadingAnalysis;
}

export interface ReadingPreset {
  id: string;
  title: string;
  subject: string;
  authorOrSource: string;
  excerpt: string;
  mainIdea: string;
  facts: string[];
  vocabulary: Array<{ term: string; definition: string }>;
  takeaway: string;
}
