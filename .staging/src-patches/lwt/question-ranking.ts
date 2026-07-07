/**
 * Question ranking (P6.2 / I12) — which questions to ask, in what order,
 * and when to STOP asking. Pure; the question-cards component renders the
 * ranked list.
 *
 * Ranking law: a question is worth asking iff its answer can change an
 * export-relevant outcome. Order: critical unattested fields first, then
 * required, then column-visible, each tier by ascending confidence (the
 * least-certain field yields the most information). Per-doc question cap
 * keeps the flow humane; remaining fields stay in the review lane.
 *
 * DESTINATION: src/lwt/question-ranking.ts
 */

export interface QuestionCandidate {
  fieldId: string;
  label: string;
  status: 'confirmed' | 'needs_review' | 'conflict';
  confidence: number;           // [0,1]
  critical: boolean;
  required: boolean;
  column: boolean;
  /** Distinct candidate values in play (conflict cards show both). */
  candidates?: string[];
}

export interface RankedQuestion {
  fieldId: string;
  label: string;
  kind: 'conflict' | 'low_confidence';
  candidates: string[];
  priority: number;             // descending order of asking
}

export const MAX_QUESTIONS_PER_DOC = 3;

/** Tier weight: critical ≫ required ≫ column ≫ rest. */
function tier(c: QuestionCandidate): number {
  if (c.critical) return 3;
  if (c.required) return 2;
  if (c.column) return 1;
  return 0;
}

/**
 * Rank the questions worth asking for one document.
 *
 * Confirmed fields are never questioned (asking about proven values
 * TRAINS USERS TO IGNORE QUESTIONS — the worst outcome for N1's
 * human-in-the-loop layer). Conflicts outrank low-confidence within a
 * tier: a conflict card is answerable in one glance.
 */
export function rankQuestions(
  fields: QuestionCandidate[],
  cap: number = MAX_QUESTIONS_PER_DOC,
): RankedQuestion[] {
  const askable = fields.filter((f) => f.status !== 'confirmed');

  const scored = askable.map((f) => {
    const conflict = f.status === 'conflict' && (f.candidates?.length ?? 0) >= 2;
    // tier dominates; conflict bumps within tier; low confidence rises.
    const priority = tier(f) * 100 + (conflict ? 50 : 0) + (1 - f.confidence) * 40;
    return {
      fieldId: f.fieldId,
      label: f.label,
      kind: (conflict ? 'conflict' : 'low_confidence') as RankedQuestion['kind'],
      candidates: f.candidates ?? [],
      priority,
    };
  });

  scored.sort((a, b) => b.priority - a.priority || a.fieldId.localeCompare(b.fieldId));
  return scored.slice(0, Math.max(0, cap));
}

/** Rolling questions-per-doc metric (I12 target: monotone decline). */
export function foldQuestionsPerDoc(
  prevMean: number,
  prevDocs: number,
  askedThisDoc: number,
): { mean: number; docs: number } {
  const docs = prevDocs + 1;
  return { mean: prevMean + (askedThisDoc - prevMean) / docs, docs };
}
