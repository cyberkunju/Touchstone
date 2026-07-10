/**
 * Verifier — the trust engine of the Edge DocGraph Engine.
 *
 * The Verifier evaluates evidence + validator results and assigns each field
 * hypothesis a status. It is the single authority for trust. It never extracts
 * evidence and never fabricates values.
 *
 * Status precedence (highest first):
 *   rejected > missing > conflict > invalid > needs_review > confirmed
 *
 * See mini-doc/06_VERIFICATION.md.
 */

import {
  DocGraph,
  FieldHypothesis,
  FieldStatus,
  FieldValueType,
  ValidationResult,
} from '../core/types';
import { runValidators, ValidatorContext, ValidationOutcome } from './validators';
import { parseDate } from '../parsers/scalars';
import { normalizeId } from '../parsers/scalars';
import { MrzParseResult } from '../parsers/mrz';

export interface VerifierOptions {
  /** Default confidence threshold for confirmation. */
  confidenceThreshold?: number;
  /** Optional per-field configuration keyed by hypothesis id. */
  fieldConfig?: Record<string, Record<string, unknown>>;
}

/** Per-value-type confirmation thresholds. Critical types require more. */
const TYPE_THRESHOLDS: Partial<Record<FieldValueType, number>> = {
  id_number: 0.7,
  date: 0.7,
  amount: 0.7,
  mrz: 0.7,
};

let validationCounter = 0;
function nextValidationId(validatorId: string): string {
  validationCounter += 1;
  return `val-${validatorId}-${validationCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export class VerifierService {
  /**
   * Verify a DocGraph in place and return it. Clears prior validations,
   * runs field-level validators, computes explainable confidence, assigns
   * status, then runs cross-field checks (MRZ↔visual, table totals).
   */
  public static verify(graph: DocGraph, options: VerifierOptions = {}): DocGraph {
    const baseThreshold = options.confidenceThreshold ?? 0.65;
    graph.validations = [];

    for (const hyp of graph.hypotheses) {
      this.verifyField(graph, hyp, baseThreshold, options.fieldConfig?.[hyp.id]);
    }

    this.runCrossFieldChecks(graph);

    // Document-level quality summary affects auto-confirm trust.
    let safe = true;
    for (const page of graph.pages) {
      if (page.quality && page.quality.safeToExtract === false) {
        safe = false;
        graph.quality.warnings.push(
          `Page ${page.pageIndex} quality is poor; downgrading auto-confirm trust.`,
        );
      }
    }
    graph.quality.safeToAutoConfirm = safe;

    graph.updatedAt = Date.now();
    return graph;
  }

  private static verifyField(
    graph: DocGraph,
    hyp: FieldHypothesis,
    baseThreshold: number,
    fieldConfig?: Record<string, unknown>,
  ): void {
    const reasons: string[] = [];

    // 1. Run applicable validators.
    const ctx: ValidatorContext = {
      targetId: hyp.id,
      documentId: graph.documentId,
      label: hyp.label,
      valueType: hyp.valueType,
      value: hyp.value,
      evidenceIds: hyp.evidenceIds,
      required: hyp.required ?? false,
      config: fieldConfig,
    };
    const outcomes = hyp.rejected ? [] : runValidators(ctx);

    let requiredMissing = false;
    let criticalInvalid = false;
    let warnReview = false;
    let fieldConflict = false;
    let conflictMessage = '';

    for (const o of outcomes) {
      const record = this.recordValidation(graph, hyp, o);
      if (o.status === 'fail') {
        reasons.push(o.message);
        if (o.suggestedStatus === 'missing') requiredMissing = true;
        else if (o.suggestedStatus === 'conflict') {
          hyp.confidence.penalties.push({ reason: o.message, amount: 0.4, severity: 'high' });
          fieldConflict = true;
          conflictMessage = o.message;
        } else {
          criticalInvalid = true;
        }
      } else if (o.status === 'warn') {
        reasons.push(o.message);
        warnReview = true;
      }
      void record;
    }

    // 2. Compute explainable confidence.
    const conf = this.computeConfidence(graph, hyp);
    hyp.confidence = conf;
    const threshold = TYPE_THRESHOLDS[hyp.valueType] ?? baseThreshold;

    // 3. Assign status by precedence (conflict from cross-field runs later).
    let status: FieldStatus;
    if (hyp.rejected) {
      status = 'rejected';
      reasons.push('Field rejected.');
    } else if (hyp.userEdited) {
      status = 'confirmed';
      reasons.unshift('User corrected and approved value.');
    } else if (requiredMissing) {
      status = 'missing';
    } else if (fieldConflict) {
      status = 'conflict';
      if (conflictMessage && !reasons.includes(conflictMessage)) reasons.push(conflictMessage);
    } else if (criticalInvalid) {
      status = 'invalid';
    } else if (warnReview || conf.overall < threshold) {
      status = 'needs_review';
      if (conf.overall < threshold) {
        reasons.push(
          `Confidence ${(conf.overall * 100).toFixed(0)}% is below the ${(threshold * 100).toFixed(0)}% threshold for ${hyp.valueType}.`,
        );
      }
    } else {
      // N1: OCR confidence and format validity describe a reading; they do
      // not prove that the reading matches the document. Confirmation is
      // reserved for user approval or the attestation bridge, which requires
      // an independent checksum, payload, arithmetic, or cross-channel proof.
      status = 'needs_review';
      reasons.push('No independent proof supports this reading; confidence alone cannot confirm it.');
    }

    // Review cap (N1): a hypothesis whose source cannot PROVE its value never
    // auto-confirms, regardless of confidence. User edits take precedence.
    if (status === 'confirmed' && hyp.reviewCap && !hyp.userEdited) {
      status = 'needs_review';
      reasons.push(hyp.reviewCap);
    }

    hyp.status = status;
    hyp.reasons = reasons;
    hyp.confidence.reasons = [...conf.reasons, ...reasons];
    hyp.updatedAt = Date.now();
  }

  private static recordValidation(
    graph: DocGraph,
    hyp: FieldHypothesis,
    o: ValidationOutcome,
  ): ValidationResult {
    const result: ValidationResult = {
      id: nextValidationId(o.validatorId),
      documentId: graph.documentId,
      targetId: hyp.id,
      validatorId: o.validatorId,
      status: o.status,
      severity: o.severity,
      message: o.message,
      details: o.details,
      evidenceIds: hyp.evidenceIds,
      createdAt: Date.now(),
    };
    graph.validations.push(result);
    if (!hyp.validationIds.includes(result.id)) hyp.validationIds.push(result.id);
    return result;
  }

  private static computeConfidence(graph: DocGraph, hyp: FieldHypothesis) {
    let ocr = 1;
    for (const id of hyp.valueNodeIds) {
      const node = graph.nodes.find((n) => n.id === id);
      if (node?.confidence !== undefined) ocr = Math.min(ocr, node.confidence);
    }
    let detector = 1;
    for (const id of hyp.assetNodeIds) {
      const node = graph.nodes.find((n) => n.id === id);
      if (node?.confidence !== undefined) detector = Math.min(detector, node.confidence);
    }

    const penalties: { reason: string; amount: number; severity: 'low' | 'medium' | 'high' | 'critical' }[] =
      [...(hyp.confidence?.penalties ?? [])];
    const reasons: string[] = [];

    const page = graph.pages.find((p) => p.id === hyp.pageId);
    if (page?.quality) {
      if (page.quality.blur.level === 'warning') {
        penalties.push({ reason: 'Slight blur over region', amount: 0.1, severity: 'low' });
      } else if (page.quality.blur.level === 'bad') {
        penalties.push({ reason: 'Heavy blur over region', amount: 0.3, severity: 'high' });
      }
      if (page.quality.glare.level === 'bad') {
        penalties.push({ reason: 'Glare overlaps region', amount: 0.2, severity: 'medium' });
      }
    }

    const hasValue = hyp.valueNodeIds.length > 0;
    const hasAsset = hyp.assetNodeIds.length > 0;
    let base: number;
    if (hasValue && hasAsset) base = (ocr + detector) / 2;
    else if (hasAsset) base = detector;
    else base = ocr;

    const penaltySum = penalties.reduce((s, p) => s + p.amount, 0);
    const overall = Math.max(0, Math.min(1, base - penaltySum));

    if (ocr < 1) reasons.push(`OCR confidence ${(ocr * 100).toFixed(0)}%.`);
    if (detector < 1) reasons.push(`Detector confidence ${(detector * 100).toFixed(0)}%.`);

    return {
      overall: hyp.userEdited ? 1 : overall,
      components: {
        ocr: hasValue ? ocr : undefined,
        detector: hasAsset ? detector : undefined,
        userCorrection: hyp.userEdited ? 1 : undefined,
      },
      penalties,
      reasons,
    };
  }

  /**
   * Cross-field consistency checks. Currently: MRZ↔visual (date of birth,
   * document number, expiry). Mismatches set the visible field to `conflict`
   * and add a failing validation; they never silently overwrite a value.
   */
  private static runCrossFieldChecks(graph: DocGraph): void {
    const mrzHyp = graph.hypotheses.find((h) => h.valueType === 'mrz');
    if (!mrzHyp || mrzHyp.value == null) return;
    const mrz = mrzHyp.value as MrzParseResult;
    if (!mrz || typeof mrz !== 'object' || !('fields' in mrz)) return;
    // An invalid MRZ cannot confirm anything; do not cross-confirm from it.
    if (mrz.status === 'invalid') return;
    const f = mrz.fields;

    const addConflict = (
      visual: FieldHypothesis,
      message: string,
      details: Record<string, unknown>,
    ) => {
      visual.status = 'conflict';
      if (!visual.reasons.includes(message)) visual.reasons.push(message);
      const result: ValidationResult = {
        id: nextValidationId('cross_field'),
        documentId: graph.documentId,
        targetId: visual.id,
        validatorId: 'mrz_visual_cross_check',
        status: 'fail',
        severity: 'high',
        message,
        details,
        evidenceIds: [...visual.evidenceIds, ...mrzHyp.evidenceIds],
        createdAt: Date.now(),
      };
      graph.validations.push(result);
      if (!visual.validationIds.includes(result.id)) visual.validationIds.push(result.id);
    };

    // Date of birth.
    if (f.dateOfBirth) {
      const dob = graph.hypotheses.find(
        (h) => h.valueType === 'date' && /birth|dob/i.test(h.label),
      );
      if (dob && typeof dob.value === 'string' && dob.value.trim() !== '') {
        const parsed = parseDate(dob.value);
        const iso = parsed.iso ?? parsed.candidates[0];
        if (iso && !parsed.ambiguous && iso !== f.dateOfBirth) {
          addConflict(
            dob,
            `MRZ date of birth (${f.dateOfBirth}) does not match the visible date of birth (${iso}).`,
            { mrz: f.dateOfBirth, visual: iso },
          );
        } else if (iso && parsed.candidates.includes(f.dateOfBirth)) {
          // MRZ disambiguates an ambiguous visible date — strengthen, no conflict.
          if (!dob.reasons.includes('Confirmed by MRZ date of birth.')) {
            dob.reasons.push('Confirmed by MRZ date of birth.');
          }
        }
      }
    }

    // Document / passport number. Check EVERY matching hypothesis — a wrong
    // duplicate must not escape because a correct twin was found first.
    if (f.documentNumber) {
      const docNos = graph.hypotheses.filter(
        (h) => h.valueType === 'id_number' && /passport|document|doc\s*no|number/i.test(h.label),
      );
      for (const docNo of docNos) {
        if (typeof docNo.value !== 'string' || docNo.value.trim() === '') continue;
        const a = normalizeId(docNo.value).normalized;
        const b = normalizeId(f.documentNumber).normalized;
        if (a !== b) {
          addConflict(
            docNo,
            `MRZ document number (${f.documentNumber}) does not match the visible value (${docNo.value}).`,
            { mrz: f.documentNumber, visual: docNo.value },
          );
        }
      }
    }

    // Expiry date.
    if (f.expiryDate) {
      const exp = graph.hypotheses.find(
        (h) => h.valueType === 'date' && /expir|expiry|valid until/i.test(h.label),
      );
      if (exp && typeof exp.value === 'string' && exp.value.trim() !== '') {
        const parsed = parseDate(exp.value);
        const iso = parsed.iso;
        if (iso && !parsed.ambiguous && iso !== f.expiryDate) {
          addConflict(
            exp,
            `MRZ expiry (${f.expiryDate}) does not match the visible expiry (${iso}).`,
            { mrz: f.expiryDate, visual: iso },
          );
        }
      }
    }

    // Issuing state / nationality codes (live-caught silent error class):
    // these MRZ positions have NO checksum coverage, so they are never
    // promoted authoritatively — but a valid MRZ still provides a second
    // reading. Disagreement between two independent reads of the same code
    // is exactly what review exists for. Only compared when both sides look
    // like 3-letter codes (the visible side may hold a full country name).
    const codePairs: Array<[string | undefined, RegExp]> = [
      [f.issuingCountry, /country\s*code/i],
      [f.nationality, /nationality/i],
    ];
    for (const [code, labelRe] of codePairs) {
      if (!code || !/^[A-Z]{3}$/.test(code)) continue;
      for (const hyp of graph.hypotheses) {
        if (hyp.valueType === 'mrz' || !labelRe.test(hyp.label)) continue;
        if (typeof hyp.value !== 'string') continue;
        const visual = hyp.value.trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(visual)) continue;
        if (visual !== code) {
          addConflict(
            hyp,
            `MRZ code (${code}) does not match the visible value (${hyp.value}).`,
            { mrz: code, visual: hyp.value },
          );
        }
      }
    }

    // Sex.
    if (f.sex === 'M' || f.sex === 'F' || f.sex === 'X') {
      for (const hyp of graph.hypotheses) {
        if (hyp.valueType === 'mrz' || !/^sex$|gender/i.test(hyp.label.trim())) continue;
        if (typeof hyp.value !== 'string') continue;
        const visual = hyp.value.trim().toUpperCase();
        if (!/^[MFX]$/.test(visual)) continue;
        if (visual !== f.sex) {
          addConflict(
            hyp,
            `MRZ sex (${f.sex}) does not match the visible value (${hyp.value}).`,
            { mrz: f.sex, visual: hyp.value },
          );
        }
      }
    }

    // Surname. Skipped when the MRZ-side name is degenerate (< 2 chars — an
    // OCR-shredded MRZ line 1 must not taint a clean visible surname).
    if (f.surname && f.surname.trim().length >= 2) {
      const mrzName = f.surname.trim().toUpperCase().replace(/[^A-Z ]/g, '');
      for (const hyp of graph.hypotheses) {
        if (hyp.valueType === 'mrz' || !/surname|last\s*name/i.test(hyp.label)) continue;
        if (typeof hyp.value !== 'string' || hyp.value.trim().length < 2) continue;
        const visual = hyp.value.trim().toUpperCase().replace(/[^A-Z ]/g, '');
        if (visual && mrzName && visual !== mrzName) {
          addConflict(
            hyp,
            `MRZ surname (${f.surname}) does not match the visible value (${hyp.value}).`,
            { mrz: f.surname, visual: hyp.value },
          );
        }
      }
    }
  }
}
