/**
 * Date attestors (08 §6 #17-18).
 *
 * `date-valid`: proleptic-Gregorian calendar validity + plausibility windows.
 * STRUCTURAL-ONLY by design — a well-formed date proves nothing about being
 * the RIGHT date (live-caught upstream: "04/23/1985" scored against
 * "1985-23-04"); it supports, never proves.
 *
 * `cross-date`: coherence across the document's date set (expiry > issue,
 * DOB < issue, MRZ↔VIZ equality). Agreement between INDEPENDENT channels is
 * a real proof (cross_channel kind); pure ordering coherence only supports.
 */

import type { Attestation, Attestor, DocContext, FieldCandidate } from '../types';

/** Plausible ISO readings of a printed date — no locale assumption, ever.
 *  When ctx.dateOrder is established document-globally, it narrows to one. */
export function plausibleIsoDates(
  value: string,
  dateOrder: DocContext['dateOrder'] = null,
): string[] {
  const out = new Set<string>();
  const m = /(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(value);
  if (!m) return [];
  const [, a, b, c] = m;
  const push = (y: string, mo: string, d: string) => {
    const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    if (isRealCalendarDate(iso)) out.add(iso);
  };
  if (a.length === 4) push(a, b, c);
  else if (c.length === 4) {
    if (dateOrder === 'DMY') push(c, b, a);
    else if (dateOrder === 'MDY') push(c, a, b);
    else {
      push(c, b, a);
      push(c, a, b);
    }
  }
  return [...out];
}

/** True proleptic-Gregorian validity (leap years, month lengths). */
export function isRealCalendarDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= lengths[mo - 1];
}

/** Plausibility window per canonical date role (08 §6 #17). */
function windowFor(canonicalLabel: string | null, now: Date): [Date, Date] | null {
  const y = now.getUTCFullYear();
  if (canonicalLabel === 'date_of_birth') {
    return [new Date(Date.UTC(y - 120, 0, 1)), now];
  }
  if (canonicalLabel === 'date_of_expiry' || canonicalLabel === 'due_date') {
    return [new Date(Date.UTC(y - 20, 0, 1)), new Date(Date.UTC(y + 20, 11, 31))];
  }
  return null; // no window knowledge — validity only
}

export const dateValidAttestor: Attestor = {
  id: 'structure.date-valid',

  appliesTo(field: FieldCandidate): boolean {
    return field.valueType === 'date';
  },

  attest(field: FieldCandidate, ctx: DocContext): Attestation | null {
    const readings = plausibleIsoDates(field.value, ctx.dateOrder);
    if (readings.length === 0) {
      return {
        attestorId: this.id,
        verdict: 'contradicts',
        strength: 1.0,
        evidence: [{
          kind: 'computation',
          ref: `no calendar-valid reading of "${field.value}"`,
          note: 'not a real date under any locale',
        }],
      };
    }
    const window = windowFor(field.canonicalLabel, ctx.now);
    if (window) {
      const [lo, hi] = window;
      const inWindow = readings.some((iso) => {
        const t = new Date(`${iso}T00:00:00Z`).getTime();
        return t >= lo.getTime() && t <= hi.getTime();
      });
      if (!inWindow) {
        return {
          attestorId: this.id,
          verdict: 'contradicts',
          strength: 0.9,
          evidence: [{
            kind: 'computation',
            ref: `${field.canonicalLabel}: ${readings.join('|')} outside plausibility window`,
            note: 'calendar-valid but implausible for this field role',
          }],
        };
      }
    }
    // Valid + plausible = SUPPORT only. A well-formed date is not proof of
    // being the right date — structural attestors never confirm alone.
    return {
      attestorId: this.id,
      verdict: 'supports',
      strength: 0.4,
      evidence: [{
        kind: 'computation',
        ref: `calendar-valid readings: ${readings.join('|')}`,
      }],
    };
  },
};

/** Normalized-date equality across independent channels ⇒ cross_channel
 *  proof; same-channel agreement proves nothing (correlated errors). */
export const crossDateAttestor: Attestor = {
  id: 'cross.date-channels',

  appliesTo(field: FieldCandidate): boolean {
    return field.valueType === 'date' && field.canonicalLabel !== null;
  },

  attest(field: FieldCandidate, ctx: DocContext): Attestation | null {
    const mine = new Set(plausibleIsoDates(field.value, ctx.dateOrder));
    if (mine.size === 0) return null;
    const peers = ctx.allCandidates.filter(
      (c) =>
        c.id !== field.id &&
        c.canonicalLabel === field.canonicalLabel &&
        c.channel !== field.channel,
    );
    for (const peer of peers) {
      const theirs = plausibleIsoDates(peer.value, ctx.dateOrder);
      const agreed = theirs.find((iso) => mine.has(iso));
      if (agreed) {
        return {
          attestorId: this.id,
          verdict: 'proves',
          strength: 0.98,
          evidence: [
            { kind: 'candidate', ref: field.id, note: `${field.channel} read` },
            { kind: 'candidate', ref: peer.id, note: `${peer.channel} read` },
            { kind: 'computation', ref: `both normalize to ${agreed}` },
          ],
        };
      }
      // A peer that CANNOT agree under any locale is a contradiction.
      if (theirs.length > 0) {
        return {
          attestorId: this.id,
          verdict: 'contradicts',
          strength: 0.9,
          evidence: [
            { kind: 'candidate', ref: field.id, note: `${field.channel}: ${[...mine].join('|')}` },
            { kind: 'candidate', ref: peer.id, note: `${peer.channel}: ${theirs.join('|')}` },
          ],
        };
      }
    }
    return null; // no independent peer — cannot judge
  },
};
