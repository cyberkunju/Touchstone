/**
 * @file mrz-partial.ts
 *
 * P7 — Offset-tomographic partial-MRZ recovery.
 *
 * A frame-cropped MRZ loses characters off one edge; the observed fragment
 * sits at an UNKNOWN offset inside the canonical 44-char TD3 line 2. The
 * old pipeline padded/refused and every machine-verifiable field died with
 * it (live-caught: French pages with the MRZ cut by the photo edge).
 *
 * LAW: absent pixels are never fillers. A field is recovered ONLY when
 *  1. its complete data window AND its dedicated check digit lie fully
 *     inside the observed fragment at a candidate alignment,
 *  2. the check digit passes there (with ICAO position-class sanity —
 *     letters can never satisfy a date window),
 *  3. every VIABLE alignment (one whose covered fields all pass) yields
 *     the IDENTICAL value — ambiguity across alignments is refusal.
 *
 * Recovered values are checksum-verified but NOT beam-proven: callers must
 * surface them as review-capped gap-fill, never as authoritative.
 */

import { computeCheckDigit } from './mrz';

export interface PartialMrzField {
  canonicalLabel: string;
  label: string;
  value: string;
  valueType: 'id_number' | 'date';
}

interface FieldWindow {
  canonicalLabel: string;
  label: string;
  valueType: 'id_number' | 'date';
  start: number;
  end: number; // exclusive
  checkPos: number;
  /** 'n' = digits/fillers only; 'm' = alphanumeric. */
  charClass: 'n' | 'm';
  /** Convert the raw window (fillers stripped) into the emitted value. */
  render: (data: string) => string | null;
}

const TD3_LINE2_LENGTH = 44;

/** YYMMDD → ISO with the ICAO pivot (>= 50 → 19xx). Null when non-calendar. */
function icaoDateToIso(yymmdd: string, kind: 'birth' | 'expiry'): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const century = kind === 'birth' ? (yy >= 50 ? 1900 : 2000) : (yy >= 80 ? 1900 : 2000);
  return `${century + yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

const TD3_LINE2_FIELDS: FieldWindow[] = [
  {
    canonicalLabel: 'passport_number',
    label: 'Passport Number',
    valueType: 'id_number',
    start: 0,
    end: 9,
    checkPos: 9,
    charClass: 'm',
    render: (data) => {
      const v = data.replace(/</g, '').trim();
      return v.length >= 5 ? v : null;
    },
  },
  {
    canonicalLabel: 'date_of_birth',
    label: 'Date of Birth',
    valueType: 'date',
    start: 13,
    end: 19,
    checkPos: 19,
    charClass: 'n',
    render: (data) => icaoDateToIso(data, 'birth'),
  },
  {
    canonicalLabel: 'date_of_expiry',
    label: 'Date of Expiry',
    valueType: 'date',
    start: 21,
    end: 27,
    checkPos: 27,
    charClass: 'n',
    render: (data) => icaoDateToIso(data, 'expiry'),
  },
  {
    canonicalLabel: 'personal_number',
    label: 'Personal Number',
    valueType: 'id_number',
    start: 28,
    end: 42,
    checkPos: 42,
    charClass: 'm',
    render: (data) => {
      const v = data.replace(/</g, '').trim();
      return v.length >= 3 ? v : null;
    },
  },
];

/** Character legality for a window's class ('<' is legal everywhere). */
function classLegal(s: string, cls: 'n' | 'm'): boolean {
  return cls === 'n' ? /^[0-9<]*$/.test(s) : /^[A-Z0-9<]*$/.test(s);
}

/**
 * Recover checksum-verifiable fields from a TD3 line-2 FRAGMENT observed at
 * an unknown offset.
 *
 * @param fragment Cleaned fragment (uppercase, no spaces, `[A-Z0-9<]+`).
 * @param edge Which image edge cropped the line: 'left' → the fragment is
 *             the line's RIGHT part (offset fixed at 44−len); 'right' → the
 *             LEFT part (offset 0); 'unknown' → all offsets are candidates.
 * @returns Fields whose value is invariant across every viable alignment.
 */
export function recoverFromPartialTd3Line2(
  fragment: string,
  edge: 'left' | 'right' | 'unknown',
): PartialMrzField[] {
  const clean = fragment.toUpperCase().replace(/[^A-Z0-9<]/g, '');
  const len = clean.length;
  // Too short to cover any window+check, or long enough to parse normally.
  if (len < 8 || len >= TD3_LINE2_LENGTH) return [];

  const offsets: number[] =
    edge === 'left'
      ? [TD3_LINE2_LENGTH - len]
      : edge === 'right'
        ? [0]
        : Array.from({ length: TD3_LINE2_LENGTH - len + 1 }, (_, i) => i);

  interface Candidate { offset: number; values: Map<string, string> }
  const viable: Candidate[] = [];

  for (const offset of offsets) {
    const values = new Map<string, string>();
    let coveredCount = 0;
    let allPass = true;
    for (const fw of TD3_LINE2_FIELDS) {
      // Window + its check digit must sit FULLY inside the fragment.
      if (fw.start < offset || fw.checkPos >= offset + len) continue;
      const data = clean.slice(fw.start - offset, fw.end - offset);
      const check = clean[fw.checkPos - offset];
      if (!classLegal(data, fw.charClass) || !/^[0-9]$/.test(check)) {
        allPass = false;
        break;
      }
      if (String(computeCheckDigit(data)) !== check) {
        allPass = false;
        break;
      }
      const rendered = fw.render(data);
      if (rendered === null) {
        allPass = false;
        break;
      }
      coveredCount += 1;
      values.set(fw.canonicalLabel, rendered);
    }
    if (allPass && coveredCount > 0) viable.push({ offset, values });
  }

  if (viable.length === 0) return [];

  // Invariance across viable alignments: a field recovers only when every
  // viable offset that covers it agrees on the value, and at least one does.
  const out: PartialMrzField[] = [];
  for (const fw of TD3_LINE2_FIELDS) {
    const seen = new Set<string>();
    let covered = 0;
    for (const cand of viable) {
      const v = cand.values.get(fw.canonicalLabel);
      if (v !== undefined) {
        covered += 1;
        seen.add(v);
      }
    }
    if (covered > 0 && seen.size === 1) {
      out.push({
        canonicalLabel: fw.canonicalLabel,
        label: fw.label,
        value: [...seen][0],
        valueType: fw.valueType,
      });
    }
  }
  return out;
}
