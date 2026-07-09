/**
 * Deterministic document-type classification.
 *
 * Given recognized text plus structural signals (MRZ / barcode detection),
 * pick the extraction profile the engine should use. The function is pure and
 * deterministic: the same input always yields the same result.
 */

export type ExtractionDocType =
  | 'passport'
  | 'id_card'
  | 'invoice'
  | 'receipt'
  | 'bank_statement'
  | 'payslip'
  | 'utility_bill'
  | 'generic';

export interface ClassifyInput {
  texts: string[];
  hasMrz: boolean;
  hasBarcode?: boolean;
}

export interface ClassifyResult {
  type: ExtractionDocType;
  confidence: number;
  reasons: string[];
}

type ScoredType = Exclude<ExtractionDocType, 'generic'>;

/** Keyword sets per candidate type. Each matched keyword adds +1. */
const KEYWORDS: Record<ScoredType, string[]> = {
  passport: [
    'passport',
    'passeport',
    'nationality',
    'place of birth',
    'date of issue',
    'authority',
  ],
  id_card: [
    'identity card',
    'id card',
    'id no',
    'resident identity',
    'national id',
  ],
  invoice: [
    'invoice',
    'bill to',
    'invoice number',
    'amount due',
    'subtotal',
    'tax',
    'total due',
    'vendor',
  ],
  receipt: [
    'receipt',
    'subtotal',
    'change due',
    'cash',
    'card',
    'merchant',
    'thank you',
  ],
  bank_statement: [
    'bank statement',
    'statement period',
    'opening balance',
    'closing balance',
    'account holder',
    'total credits',
    'total debits',
  ],
  payslip: [
    'payslip',
    'pay slip',
    'pay period',
    'gross pay',
    'net pay',
    'total deductions',
    'employee id',
    'earnings',
  ],
  utility_bill: [
    'utility bill',
    'total due',
    'due date',
    'billing period',
    'current charges',
    'previous balance',
    'meter',
    'account number',
  ],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Classify a document from its recognized text and structural signals.
 */
export function classifyDocument(input: ClassifyInput): ClassifyResult {
  const normalized = input.texts.map((t) => (t ?? '').toLowerCase());
  const haystack = normalized.join('\n');

  const scores: Record<ScoredType, number> = {
    passport: 0,
    id_card: 0,
    invoice: 0,
    receipt: 0,
    bank_statement: 0,
    payslip: 0,
    utility_bill: 0,
  };
  const reasons: string[] = [];

  // Keyword scoring.
  (Object.keys(KEYWORDS) as ScoredType[]).forEach((type) => {
    for (const keyword of KEYWORDS[type]) {
      if (haystack.includes(keyword)) {
        scores[type] += 1;
        reasons.push(`Matched ${type} keyword: "${keyword}".`);
      }
    }
  });

  // Structural signals.
  let strongSignal = false;
  if (input.hasMrz) {
    scores.passport += 3;
    scores.id_card += 1;
    strongSignal = true;
    reasons.push('MRZ zone detected (+3 passport, +1 id_card).');
  }

  const hasPassportKeyword =
    haystack.includes('passport') || haystack.includes('passeport');
  if (input.hasMrz && hasPassportKeyword) {
    reasons.push('MRZ combined with passport keyword: very high confidence.');
    strongSignal = true;
  }

  // All zero -> generic.
  const total = (Object.keys(scores) as ScoredType[]).reduce((s, k) => s + scores[k], 0);
  if (total === 0) {
    return {
      type: 'generic',
      confidence: 0.4,
      reasons: ['No strong document-type signals.'],
    };
  }

  // Rank candidate types.
  const ranked = (Object.keys(scores) as ScoredType[])
    .map((type) => ({ type, score: scores[type] }))
    .sort((a, b) => b.score - a.score);

  let topType: ScoredType = ranked[0].type;
  const topScore = ranked[0].score;
  const runnerUp = ranked[1]?.score ?? 0;

  // CORROBORATION LAW (live-caught by the v6-small universe burst): a LONE
  // keyword match is prose, not a classification — "we confirm receipt of
  // your application" classified every LETTER as a receipt, routing it to
  // the curated receipt registry (no `reference` spec) and silencing the
  // universal layer. v5 only escaped by misreading the word. One generic
  // English word proves nothing; curated registries activate on ≥2
  // independent signals or a structural one (MRZ). Single-signal pages go
  // GENERIC, where the universal extractor + self-labeling do the work.
  if (!strongSignal && topScore < 2) {
    return {
      type: 'generic',
      confidence: 0.4,
      reasons: [
        ...reasons,
        `Single keyword match ("${ranked[0].type}") lacks corroboration — generic (universal layer).`,
      ],
    };
  }

  // MRZ-driven tie-breaking between passport and id_card.
  const hasIdentitySignal = haystack.includes('identity');
  if (input.hasMrz) {
    if (hasPassportKeyword) {
      topType = 'passport';
      reasons.push('MRZ combined with passport keyword -> passport.');
    } else if (hasIdentitySignal) {
      topType = 'id_card';
      reasons.push('MRZ combined with identity signal -> id_card.');
    } else if (scores.passport >= scores.id_card) {
      topType = 'passport';
      reasons.push(
        'MRZ present and passport score >= id_card score -> passport.'
      );
    }
  }

  let confidence = clamp(topScore / (topScore + runnerUp + 1), 0, 1);
  if (strongSignal) {
    confidence = Math.max(confidence, 0.5);
  }
  // A passport confirmed by MRZ + keyword is very high.
  if (topType === 'passport' && input.hasMrz && hasPassportKeyword) {
    confidence = Math.max(confidence, 0.8);
  }

  return {
    type: topType,
    confidence,
    reasons,
  };
}
