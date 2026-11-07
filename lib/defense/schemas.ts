import { z } from "zod";

/**
 * Shapes Claude must return (enforced with structured outputs). IDs, scores
 * and grades are added by our code, not the model, so they stay consistent.
 * Array lengths are checked after parsing.
 */

const Category = z.enum(["logical_gap", "methodology", "assumption", "evidence", "limitations", "technical_depth"]);
const Importance = z.enum(["core", "important", "supporting"]);

export const GeneratedQuestionSetSchema = z.object({
  overallWeaknesses: z.array(z.string()),
  questions: z.array(
    z.object({
      question: z.string(),
      category: Category,
      targetsWeakness: z.string(),
      sourceReference: z.string(),
      rubric: z.object({
        idealAnswerSummary: z.string(),
        keyPoints: z.array(
          z.object({
            point: z.string(),
            importance: Importance,
            technicalDetail: z.string(),
          }),
        ),
        redFlags: z.array(z.string()),
        followUpQuestion: z.string(),
      }),
    }),
  ),
});

export const GeneratedEvaluationSchema = z.object({
  keyPointResults: z.array(
    z.object({
      keyPointId: z.string(),
      status: z.enum(["covered", "partial", "missing"]),
      evidence: z.string().nullable(),
      comment: z.string(),
    }),
  ),
  missingTechnicalDetails: z.array(z.string()),
  misconceptions: z.array(z.string()),
  strengths: z.array(z.string()),
  feedback: z.string(),
  improvedAnswerOutline: z.array(z.string()),
});

export type GeneratedQuestionSet = z.infer<typeof GeneratedQuestionSetSchema>;
export type GeneratedEvaluation = z.infer<typeof GeneratedEvaluationSchema>;
