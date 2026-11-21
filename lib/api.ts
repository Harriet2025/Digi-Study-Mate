/**
 * Browser-side client for the Python API. Requests go to relative /api URLs, which Next.js
 * forwards to the backend (see next.config.ts). Types mirror backend/app responses.
 */

import { redirectToLogin, redirectToSignup } from "./auth";
import type { AudioSegment } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LessonStyle = "standard" | "recap" | "deep_dive" | "exam_cram";
export type LessonLevel = "beginner" | "intermediate" | "advanced";
export type LessonLanguage = "en" | "fr" | "es" | "pt" | "de";
export type EpisodeStatus = "queued" | "processing" | "ready" | "failed";

export interface UploadedDocument {
  documentId: string;
  filename: string;
  sourceType: "pdf" | "pptx";
  pageCount: number;
  chunkCount?: number;
  totalTokens?: number;
  createdAt: string | null;
}

export interface EpisodeSummary {
  scriptId: string;
  documentId: string | null;
  title: string;
  status: EpisodeStatus;
  stage: string;
  stageLabel: string;
  progress: number;
  error: string | null;
  style: LessonStyle;
  level: LessonLevel;
  language: LessonLanguage;
  targetMinutes: number;
  pageStart: number | null;
  pageEnd: number | null;
  totalDurationSec: number;
  createdAt: string | null;
  flashcardCount: number;
  listening: { positionSec: number; completed: boolean; updatedAt: string | null };
}

export interface EpisodeManifest extends EpisodeSummary {
  version: 1;
  provider: string;
  manifestUrl: string;
  downloadUrl: string | null;
  segments: AudioSegment[];
}

export interface DeckStats {
  total: number;
  due: number;
  learned: number;
  nextDueAt: string | null;
}

export type Rating = "again" | "hard" | "good" | "easy";

export interface Flashcard {
  id: number;
  episodeId: string | null;
  guideId: string | null;
  lessonTitle: string | null;
  front: string;
  back: string;
  source: "checkpoint" | "generated";
  dueAt: string;
  repetitions: number;
  lapses: number;
  intervalDays: number;
  nextIntervals: Record<Rating, number>;
}

export interface QuestionSetSummary {
  setId: string;
  documentId?: string | null;
  title: string | null;
  createdAt: string;
  questionCount: number;
  answeredCount: number;
  averageBest: number | null;
}

export interface LibraryData {
  continueListening: EpisodeSummary[];
  flashcards: DeckStats;
  documents: (UploadedDocument & { guides: GuideSummary[]; episodes: EpisodeSummary[]; questionSets: QuestionSetSummary[] })[];
  looseQuestionSets: QuestionSetSummary[];
}

export type QuestionCategory = "logical_gap" | "methodology" | "assumption" | "evidence" | "limitations" | "technical_depth";
export type Importance = "core" | "important" | "supporting";
export type PointStatus = "covered" | "partial" | "missing";
export type Grade = "excellent" | "good" | "partial" | "insufficient";

export interface Rubric {
  idealAnswerSummary: string;
  keyPoints: { id: string; point: string; importance: Importance; technicalDetail: string }[];
  redFlags: string[];
  followUpQuestion: string;
}

export interface Evaluation {
  attemptId: string;
  setId: string;
  questionId: string;
  inputMode: "typed" | "spoken";
  answer: string;
  score: number;
  grade: Grade;
  keyPointResults: { keyPointId: string; point: string; importance: Importance; status: PointStatus; evidence: string | null; comment: string }[];
  missingTechnicalDetails: string[];
  misconceptions: string[];
  strengths: string[];
  feedback: string;
  improvedAnswerOutline: string[];
  followUpQuestion: string;
  rubric: Rubric;
}

export interface PracticeQuestion {
  id: string;
  question: string;
  category: QuestionCategory;
  targetsWeakness: string;
  sourceReference: string;
  attemptCount: number;
  bestScore: number | null;
  latest: Evaluation | null;
  history: { score: number; grade: Grade; createdAt: string }[];
}

export interface PracticeSet {
  setId: string;
  documentId: string | null;
  title: string | null;
  createdAt: string;
  overallWeaknesses: string[];
  questions: PracticeQuestion[];
}

export interface Insights {
  streak: { current: number; longest: number; activeToday: boolean };
  calendar: {
    date: string;
    listenMinutes: number;
    reviews: number;
    defense: number;
    quizzes: number;
    questionsAsked: number;
    exams: number;
    battles: number;
    active: boolean;
  }[];
  totals: {
    listenMinutes: number;
    lessons: number;
    documents: number;
    cardsReviewed: number;
    defenseAnswers: number;
    studySpaces: number;
    quizzesTaken: number;
    questionsAsked: number;
  };
  flashcards: DeckStats;
  weakSpots: {
    flashcards: { id: number; front: string; lapses: number; episodeId: string | null; guideId: string | null; lessonTitle: string }[];
    defense: { setId: string; questionId: string; question: string; bestScore: number; attempts: number; title: string | null }[];
  };
}


// --- Study spaces ------------------------------------------------------------

export interface GuideSummary {
  guideId: string;
  documentId: string;
  title: string;
  status: EpisodeStatus;
  stage: string;
  stageLabel: string;
  progress: number;
  error: string | null;
  level: LessonLevel;
  language: LessonLanguage;
  pageStart: number | null;
  pageEnd: number | null;
  createdAt: string | null;
  sectionCount: number;
  flashcardCount: number;
  quizQuestionCount: number;
  bestQuizScore: number | null;
}

export interface GuideSection {
  id: number;
  position: number;
  title: string;
  explanation: string;
  analogy: string | null;
  example: string | null;
  keyTerms: { term: string; definition: string }[];
  diagram: string | null;
  diagramCaption: string | null;
  checkQuestion: string | null;
  checkAnswer: string | null;
  sourcePages: string | null;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  pages: number[];
  createdAt: string;
}

export interface GuideResource {
  kind: "video" | "video_search" | "reading";
  title: string;
  url: string;
  description: string | null;
  source: string | null;
  thumbnailUrl: string | null;
}

export interface GuideDetail extends GuideSummary {
  overview: string | null;
  objectives: string[];
  sections: GuideSection[];
  quiz: { position: number; question: string; options: string[]; difficulty: "easy" | "medium" | "hard" }[];
  quizAttempts: { attemptId: string; score: number; rating: string; createdAt: string }[];
  resources: GuideResource[];
  messages: ChatMessage[];
  audio: { scriptId: string; status: EpisodeStatus; progress: number; stageLabel: string } | null;
}

export interface QuizResult {
  attemptId: string;
  score: number;
  correct: number;
  total: number;
  rating: string;
  previousBest: number | null;
  results: {
    position: number;
    question: string;
    options: string[];
    chosenIndex: number;
    correctIndex: number;
    correct: boolean;
    explanation: string;
    difficulty: string;
  }[];
}

// --- Projects ----------------------------------------------------------------

export type SlideLayout = "bullets" | "two_column" | "process" | "timeline" | "stats" | "quote" | "section";

export interface DeckSlide {
  layout: SlideLayout;
  title: string;
  subtitle: string;
  bullets: string[];
  columns: { heading: string; bullets: string[] }[];
  steps: { label: string; detail: string }[];
  stats: { value: string; label: string }[];
  quote: string;
  speakerNotes: string;
}

export interface Deck {
  title: string;
  subtitle: string;
  titleNotes: string;
  slides: DeckSlide[];
  closingMessage: string;
  closingNotes: string;
}

export interface DefensePack {
  openingLine: string;
  script: { slideNumber: number; title: string; talkingPoints: string; seconds: number; transition: string }[];
  closingLine: string;
  strategy: string[];
  likelyQuestions: { question: string; why: string; modelAnswer: string; tip: string }[];
  weakSpots: string[];
}

export interface ProjectSummary {
  projectId: string;
  title: string;
  course: string | null;
  status: EpisodeStatus;
  stage: string;
  stageLabel: string;
  progress: number;
  error: string | null;
  slideCount: number;
  durationMinutes: number;
  sourceFilename: string | null;
  createdAt: string | null;
  questionSetId: string | null;
}

export interface ProjectDetail extends ProjectSummary {
  deck: Deck | null;
  defense: DefensePack | null;
  downloadUrl: string | null;
}

// --- Exam focus ----------------------------------------------------------------

export interface SummarySheet {
  status: "ready";
  guideId: string;
  title: string;
  pages: string | null;
  bigIdea: string;
  sections: { heading: string; points: string[] }[];
  keyTerms: { term: string; definition: string }[];
  rules: string[];
  mistakes: string[];
  quickCheck: { question: string; answer: string }[];
}

export interface ExamTopic {
  name: string;
  summary: string;
  papersAppeared: number;
  questionCount: number;
  totalMarks: number;
  trend: "rising" | "steady" | "falling" | "new";
  priority: "high" | "medium" | "low";
  sampleQuestions: string[];
}

export interface PredictedQuestion {
  question: string;
  topic: string;
  marks: number;
  likelihood: "high" | "medium";
  reason: string;
}

export interface BankSummary {
  bankId: string;
  course: string;
  status: EpisodeStatus;
  stage: string;
  stageLabel: string;
  progress: number;
  error: string | null;
  paperCount: number;
  topicCount: number;
  topTopics: string[];
  createdAt: string | null;
}

export interface MockSummary {
  mockId: string;
  title: string;
  mode: "exam" | "practice";
  status: "queued" | "processing" | "ready" | "failed" | "in_progress" | "submitted";
  progress: number;
  error: string | null;
  bankId: string | null;
  guideId: string | null;
  questionCount: number;
  durationMinutes: number;
  percent: number | null;
  createdAt: string | null;
  submittedAt: string | null;
}

export interface BankDetail extends BankSummary {
  guideIds: string[];
  papers: { paperId: string; filename: string; year: string | null; questionCount: number }[];
  overview: string | null;
  topics: ExamTopic[];
  predicted: PredictedQuestion[];
  mocks: MockSummary[];
}

export interface MockQuestion {
  id: string;
  type: "mcq" | "short";
  topic: string;
  question: string;
  marks: number;
  options: string[];
  correctIndex?: number;
  explanation?: string;
  modelAnswer?: string;
  markingPoints?: string[];
}

export interface MockResult {
  score: number;
  total: number;
  percent: number;
  late: boolean;
  topics: { topic: string; awarded: number; available: number; lost: number; percent: number }[];
  questions: { id: string; awarded: number; marks: number; feedback: string }[];
}

export interface MockDetail extends MockSummary {
  questions: MockQuestion[];
  totalMarks: number;
  startedAt: string | null;
  remainingSeconds: number | null;
  answers: Record<string, number | string | null> | null;
  result: MockResult | null;
}

export type MockAnswer = number | string | null;

// --- Social: study rooms and quiz battles ------------------------------------------

export interface RoomSummary {
  roomId: string;
  name: string;
  course: string | null;
  memberCount: number;
  shareCount: number;
  isOwner: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  points: number;
  streak: number;
  rank: number;
  badges: { id: "top" | "streak3" | "streak7" | "battle" | "exam" | "cards"; label: string }[];
}

export interface BattleSummary {
  battleId: string;
  code: string;
  title: string;
  status: "lobby" | "live" | "finished";
  questionCount: number;
  playerCount: number;
  roomId: string | null;
  createdAt: string | null;
  winner: string | null;
}

export interface RoomDetail {
  roomId: string;
  name: string;
  course: string | null;
  joinCode: string;
  isOwner: boolean;
  onLeaderboard: boolean;
  members: { userId: string; name: string; isOwner: boolean; isMe: boolean }[];
  shares: { shareId: string; title: string; sharedBy: string; isMine: boolean; saved: boolean; saveCount: number; createdAt: string | null }[];
  leaderboard: LeaderboardEntry[];
  battles: BattleSummary[];
}

export interface BattleState extends BattleSummary {
  phase: "lobby" | "countdown" | "question" | "reveal" | "finished";
  secondsLeft?: number;
  isHost: boolean;
  secondsPerQuestion: number;
  players: { name: string; score: number; isMe: boolean; answered: boolean }[];
  question?: {
    index: number;
    text: string;
    options: string[];
    myChoice: number | null;
    correctIndex?: number;
    explanation?: string;
    counts?: number[];
    myPoints?: number;
  };
  review?: { question: string; answer: string; myChoice: number | null }[];
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("Can't reach Study Mate. Check that the backend is running.", 0, "NETWORK");
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string } } | null)?.error;
    if (res.status === 401 && err?.code === "UNAUTHENTICATED") redirectToLogin();
    if (res.status === 403 && err?.code === "SIGN_UP_REQUIRED") redirectToSignup();
    const message =
      err?.message ??
      (res.status === 404 ? "Not found." : res.status >= 500 ? "The server ran into a problem. Please try again." : "Request failed.");
    throw new ApiError(message, res.status, err?.code ?? "UNKNOWN");
  }
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  library: () => request<LibraryData>("/api/library"),
  insights: () => request<Insights>("/api/insights"),

  document: (id: string) => request<UploadedDocument>(`/api/documents/${id}`),
  deleteDocument: (id: string) => request<void>(`/api/documents/${id}`, { method: "DELETE" }),

  createEpisode: (body: {
    documentId: string;
    pageStart?: number;
    pageEnd?: number;
    targetMinutes: number;
    title?: string;
    style: LessonStyle;
    level: LessonLevel;
    language: LessonLanguage;
    guideId?: string;
  }) => request<EpisodeSummary>("/api/episodes", json("POST", body)),
  episode: (id: string) => request<EpisodeManifest>(`/api/episodes/${id}`),
  deleteEpisode: (id: string) => request<void>(`/api/episodes/${id}`, { method: "DELETE" }),
  saveProgress: (id: string, body: { positionSec: number; listenedSec: number; completed: boolean }) =>
    request<{ positionSec: number; completed: boolean }>(`/api/episodes/${id}/progress`, { ...json("PUT", body), keepalive: true }),

  flashcards: (params: { episodeId?: string; guideId?: string; due?: boolean; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.episodeId) q.set("episodeId", params.episodeId);
    if (params.guideId) q.set("guideId", params.guideId);
    if (params.due === false) q.set("due", "false");
    if (params.limit) q.set("limit", String(params.limit));
    return request<{ cards: Flashcard[]; stats: DeckStats }>(`/api/flashcards?${q}`);
  },
  reviewCard: (id: number, rating: Rating) => request<Flashcard>(`/api/flashcards/${id}/review`, json("POST", { rating })),

  createGuide: (body: {
    documentId: string;
    pageStart?: number;
    pageEnd?: number;
    title?: string;
    level: LessonLevel;
    language: LessonLanguage;
  }) => request<GuideSummary>("/api/guides", json("POST", body)),
  guide: (id: string) => request<GuideDetail>(`/api/guides/${id}`),
  deleteGuide: (id: string) => request<void>(`/api/guides/${id}`, { method: "DELETE" }),
  submitQuiz: (id: string, answers: number[]) => request<QuizResult>(`/api/guides/${id}/quiz`, json("POST", { answers })),
  askTutor: (id: string, message: string) =>
    request<{ question: ChatMessage; answer: ChatMessage }>(`/api/guides/${id}/chat`, json("POST", { message })),
  remakePractice: (id: string) => request<GuideDetail>(`/api/guides/${id}/practice`, { method: "POST" }),

  projects: () => request<ProjectSummary[]>("/api/projects"),
  project: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  createProject: (form: FormData) => request<ProjectSummary>("/api/projects", { method: "POST", body: form }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  practiceProject: (id: string) => request<{ setId: string }>(`/api/projects/${id}/practice`, { method: "POST" }),

  /** Returns {status: "processing"} while the sheet is being written; poll until it's ready. */
  summary: (guideId: string) => request<SummarySheet | { status: "processing" }>(`/api/guides/${guideId}/summary`),
  summaryPdfUrl: (guideId: string) => `/api/guides/${guideId}/summary.pdf`,

  banks: () => request<BankSummary[]>("/api/exams/banks"),
  bank: (id: string) => request<BankDetail>(`/api/exams/banks/${id}`),
  createBank: (form: FormData) => request<BankSummary>("/api/exams/banks", { method: "POST", body: form }),
  addPapers: (id: string, form: FormData) => request<BankSummary>(`/api/exams/banks/${id}/papers`, { method: "POST", body: form }),
  reanalyseBank: (id: string) => request<BankSummary>(`/api/exams/banks/${id}/reanalyse`, { method: "POST" }),
  deleteBank: (id: string) => request<void>(`/api/exams/banks/${id}`, { method: "DELETE" }),
  mocks: () => request<MockSummary[]>("/api/exams/mocks"),
  mock: (id: string) => request<MockDetail>(`/api/exams/mocks/${id}`),
  createMock: (body: { bankId?: string; guideId?: string; mode: "exam" | "practice"; questionCount: number; durationMinutes: number; topic?: string }) =>
    request<MockSummary>("/api/exams/mocks", json("POST", body)),
  startMock: (id: string) => request<MockDetail>(`/api/exams/mocks/${id}/start`, { method: "POST" }),
  checkAnswer: (id: string, questionId: string) => request<MockQuestion>(`/api/exams/mocks/${id}/check/${questionId}`),
  submitMock: (id: string, answers: Record<string, MockAnswer>) => request<MockDetail>(`/api/exams/mocks/${id}/submit`, json("POST", { answers })),
  deleteMock: (id: string) => request<void>(`/api/exams/mocks/${id}`, { method: "DELETE" }),

  rooms: () => request<RoomSummary[]>("/api/rooms"),
  room: (id: string) => request<RoomDetail>(`/api/rooms/${id}`),
  createRoom: (body: { name: string; course?: string }) => request<RoomDetail>("/api/rooms", json("POST", body)),
  joinRoom: (code: string) => request<RoomDetail>("/api/rooms/join", json("POST", { code })),
  shareToRoom: (roomId: string, guideId: string) => request<RoomDetail>(`/api/rooms/${roomId}/shares`, json("POST", { guideId })),
  saveShare: (roomId: string, shareId: string) => request<{ guideId: string }>(`/api/rooms/${roomId}/shares/${shareId}/save`, { method: "POST" }),
  setOnLeaderboard: (roomId: string, onLeaderboard: boolean) =>
    request<RoomDetail>(`/api/rooms/${roomId}/leaderboard`, json("PUT", { onLeaderboard })),
  leaveRoom: (roomId: string) => request<void>(`/api/rooms/${roomId}/membership`, { method: "DELETE" }),

  battles: () => request<BattleSummary[]>("/api/battles"),
  createBattle: (body: { guideId: string; roomId?: string; secondsPerQuestion?: number }) => request<BattleSummary>("/api/battles", json("POST", body)),
  joinBattle: (code: string) => request<BattleState>(`/api/battles/${code}/join`, { method: "POST" }),
  startBattle: (code: string) => request<BattleState>(`/api/battles/${code}/start`, { method: "POST" }),
  battle: (code: string) => request<BattleState>(`/api/battles/${code}`),
  answerBattle: (code: string, index: number, choice: number) =>
    request<{ accepted: boolean }>(`/api/battles/${code}/answer`, json("POST", { index, choice })),

  practiceSets: () => request<QuestionSetSummary[]>("/api/defense/sets"),
  practiceSet: (id: string) => request<PracticeSet>(`/api/defense/sets/${id}`),
  createPracticeSet: (body: { documentId: string; pageStart?: number; pageEnd?: number; title?: string }) =>
    request<{ setId: string }>("/api/defense/questions", json("POST", body)),
  answerTyped: (body: { setId: string; questionId: string; answer: string }) =>
    request<Evaluation>("/api/defense/evaluate", json("POST", body)),
  answerSpoken: (setId: string, questionId: string, recording: Blob) => {
    const form = new FormData();
    form.append("setId", setId);
    form.append("questionId", questionId);
    form.append("audio", recording, `answer.${recording.type.includes("mp4") ? "mp4" : recording.type.includes("ogg") ? "ogg" : "webm"}`);
    return request<Evaluation>("/api/defense/evaluate", { method: "POST", body: form });
  },
};

/** Uploads with progress events (fetch can't report upload progress). */
export function uploadDocument(file: File, onProgress: (fraction: number) => void): Promise<UploadedDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as UploadedDocument);
      else {
        const err = (data as { error?: { message?: string; code?: string } } | null)?.error;
        if (xhr.status === 401 && err?.code === "UNAUTHENTICATED") redirectToLogin();
        if (xhr.status === 403 && err?.code === "SIGN_UP_REQUIRED") redirectToSignup();
        reject(new ApiError(err?.message ?? "The upload failed. Please try again.", xhr.status, err?.code ?? "UNKNOWN"));
      }
    };
    xhr.onerror = () => reject(new ApiError("Can't reach Study Mate. Check that the backend is running.", 0, "NETWORK"));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

// ---------------------------------------------------------------------------
// Labels & formatting
// ---------------------------------------------------------------------------

export const STYLE_OPTIONS: { value: LessonStyle; label: string; hint: string }[] = [
  { value: "standard", label: "Standard", hint: "Balanced explanation with checkpoints" },
  { value: "recap", label: "Quick recap", hint: "Just the key ideas, fast" },
  { value: "deep_dive", label: "Deep dive", hint: "Slower, more examples and edge cases" },
  { value: "exam_cram", label: "Exam cram", hint: "Likely exam questions and traps" },
];

export const LEVEL_OPTIONS: { value: LessonLevel; label: string; hint: string }[] = [
  { value: "beginner", label: "New to this", hint: "Every term explained" },
  { value: "intermediate", label: "Know the basics", hint: "Focus on understanding" },
  { value: "advanced", label: "Confident", hint: "Faster, more depth" },
];

export const LANGUAGE_OPTIONS: { value: LessonLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "de", label: "Deutsch" },
];

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  logical_gap: "Logical gap",
  methodology: "Methodology",
  assumption: "Assumption",
  evidence: "Evidence",
  limitations: "Limitations",
  technical_depth: "Technical depth",
};

export function styleLabel(style: LessonStyle): string {
  return STYLE_OPTIONS.find((s) => s.value === style)?.label ?? style;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return s < 60 ? `${s}s` : `${Math.round(s / 60)} min`;
}

export function formatInterval(days: number): string {
  const minutes = days * 24 * 60;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  if (days < 1) return `${Math.round(minutes / 60)} h`;
  if (days < 30) return `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString();
}
