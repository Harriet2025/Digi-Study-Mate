/**
 * Public types for the exam & project defense module.
 * Everything the API returns matches one of these interfaces exactly.
 */

export type QuestionCategory =
  | "logical_gap" // a conclusion that doesn't follow from what was shown
  | "methodology" // why this method/design, and not an alternative
  | "assumption" // an unstated or unjustified assumption
  | "evidence" // a claim without sufficient data, citation or validation
  | "limitations" // threats to validity, scope, edge cases, scalability
  | "technical_depth"; // whether the student truly understands a concept they used

/** How much a key point counts toward the score. */
export type KeyPointImportance = "core" | "important" | "supporting";

export interface RubricKeyPoint {
  /** e.g. "q2-k3" */
  id: string;
  /** What a strong answer must establish. */
  point: string;
  importance: KeyPointImportance;
  /** The specific technical detail, term, figure or mechanism the examiner listens for. */
  technicalDetail: string;
}

export interface Rubric {
  /** 2–4 sentences describing an ideal answer. */
  idealAnswerSummary: string;
  keyPoints: RubricKeyPoint[];
  /** Typical weak or evasive answers that should lose marks. */
  redFlags: string[];
  /** What the panel would ask next if the answer is good. */
  followUpQuestion: string;
}

/** A question as shown to the student before they answer (no rubric). */
export interface DefenseQuestionPublic {
  /** "q1" … "q5" */
  id: string;
  question: string;
  category: QuestionCategory;
  /** The weak point in the slides this question probes. */
  targetsWeakness: string;
  /** Where in the material it comes from, e.g. "Slides 7–8". */
  sourceReference: string;
}

/** A question with its marking rubric (kept server-side until the student has answered). */
export interface DefenseQuestion extends DefenseQuestionPublic {
  rubric: Rubric;
}

export interface DefenseQuestionSet {
  setId: string;
  documentId: string | null;
  createdAt: string;
  /** Short summary of the biggest weaknesses found across the whole presentation. */
  overallWeaknesses: string[];
  questions: DefenseQuestionPublic[];
}

export type KeyPointStatus = "covered" | "partial" | "missing";

export interface KeyPointResult {
  keyPointId: string;
  point: string;
  importance: KeyPointImportance;
  status: KeyPointStatus;
  /** Short quote from the student's answer supporting the judgement, or null if missing. */
  evidence: string | null;
  comment: string;
}

export type Grade = "excellent" | "good" | "partial" | "insufficient";

export interface AnswerEvaluation {
  attemptId: string;
  setId: string;
  questionId: string;
  inputMode: "typed" | "spoken";
  /** The answer that was graded (the transcript, for spoken answers). */
  answer: string;
  /** 0–100, computed from key-point coverage weighted by importance. */
  score: number;
  grade: Grade;
  keyPointResults: KeyPointResult[];
  missingTechnicalDetails: string[];
  /** Statements in the answer that are wrong or misleading. */
  misconceptions: string[];
  strengths: string[];
  /** Constructive, examiner-style feedback addressed to the student. */
  feedback: string;
  /** Bullet outline of how a stronger answer would be structured. */
  improvedAnswerOutline: string[];
  /** The panel's likely next question. */
  followUpQuestion: string;
  /** Revealed after answering so the student can study it. */
  rubric: Rubric;
}
