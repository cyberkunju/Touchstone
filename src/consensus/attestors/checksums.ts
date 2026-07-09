/**
 * Checksum mathematics core (08 §6) — every algorithm the attestor registry
 * stands on, as pure total functions over strings.
 *
 * LAWS OF THIS MODULE:
 *  - Input hygiene is the caller-visible contract: every function tolerates
 *    spaces/hyphens (documents print them) and rejects — never coerces —
 *    characters outside its alphabet. Malformed input returns `false`/null,
 *    it never throws (attestors must be total).
 *  - No function here "stretches": these are mathematical predicates, and a
 *    predicate that guesses is a lie wearing math's clothes.
 */

/** Strip the separators documents print inside identifiers. */
export function stripSeparators(s: string): string {
  return s.replace(/[\s\-–—.]/g, '');
}

/* ------------------------------- Luhn (mod 10) ---------------------------- */

/** Luhn mod-10 (ISO/IEC 7812): doubling from the right, digits only.
 *  Blind spot (mod-10 class): single-digit errors caught; some transpositions
 *  (09↔90) are invisible — callers must treat `proves` accordingly. */
export function luhnValid(input: string): boolean {
  const s = stripSeparators(input);
  if (!/^\d{2,}$/.test(s)) return false;
  let sum = 0;
  let doubleIt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = s.charCodeAt(i) - 48;
    if (doubleIt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    doubleIt = !doubleIt;
  }
  return sum % 10 === 0;
}

/* --------------------------- ISO 7064 mod 97-10 --------------------------- */

/** IBAN validity: rearrange (first 4 → end), base-36 expand, mod 97 === 1.
 *  Big-number-safe via chunked modular reduction. */
export function ibanValid(input: string): boolean {
  const s = stripSeparators(input).toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of v) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder === 1;
}

/* ------------------------------- Verhoeff --------------------------------- */

const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;

/** Verhoeff dihedral-D5 check (catches ALL single errors and adjacent
 *  transpositions — strictly stronger than mod-10). Digits only. */
export function verhoeffValid(input: string): boolean {
  const s = stripSeparators(input);
  if (!/^\d{2,}$/.test(s)) return false;
  let c = 0;
  for (let i = 0; i < s.length; i++) {
    const d = s.charCodeAt(s.length - 1 - i) - 48;
    c = V_D[c][V_P[i % 8][d]];
  }
  return c === 0;
}

/* --------------------------- weighted mod-11 family ------------------------ */

/** Generic weighted mod-11: Σ digit·weight, valid iff Σ % 11 === 0.
 *  `xForTen` lets a trailing 'X' stand for value 10 (ISBN-10). */
export function weightedMod11Valid(input: string, weights: number[], xForTen = false): boolean {
  const s = stripSeparators(input).toUpperCase();
  if (s.length !== weights.length) return false;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    let v: number;
    if (ch >= '0' && ch <= '9') v = ch.charCodeAt(0) - 48;
    else if (xForTen && ch === 'X' && i === s.length - 1) v = 10;
    else return false;
    sum += v * weights[i];
  }
  return sum % 11 === 0;
}

/** ISBN-10: weights 10..1, X allowed in the check position. */
export function isbn10Valid(input: string): boolean {
  return weightedMod11Valid(input, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], true);
}

/** UK NHS number: 10 digits, weights 10..2 over the first 9, check digit =
 *  11 − (Σ mod 11); result 11→0, result 10 ⇒ invalid number. */
export function nhsValid(input: string): boolean {
  const s = stripSeparators(input);
  if (!/^\d{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (s.charCodeAt(i) - 48) * (10 - i);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === s.charCodeAt(9) - 48;
}

/** IMO vessel number: 'IMO' optional, 7 digits, Σ(d_i · (7−i)) over the first
 *  six, last digit === Σ mod 10. */
export function imoValid(input: string): boolean {
  const s = stripSeparators(input).toUpperCase().replace(/^IMO/, '');
  if (!/^\d{7}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += (s.charCodeAt(i) - 48) * (7 - i);
  return sum % 10 === s.charCodeAt(6) - 48;
}

/* ------------------------------ mod-10 weights ----------------------------- */

/** EAN/UPC-style mod-10 with alternating weights (right-aligned).
 *  EAN-13/ISBN-13/EAN-8/UPC-A all reduce to this with weights (1,3). */
export function ean13Valid(input: string): boolean {
  return mod10Weighted(input, 13);
}
export function ean8Valid(input: string): boolean {
  return mod10Weighted(input, 8);
}
export function upcAValid(input: string): boolean {
  return mod10Weighted(input, 12);
}
function mod10Weighted(input: string, length: number): boolean {
  const s = stripSeparators(input);
  if (!new RegExp(`^\\d{${length}}$`).test(s)) return false;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    // Weight 3 on positions with odd distance from the check digit.
    const fromRight = s.length - 1 - i;
    sum += (s.charCodeAt(i) - 48) * (fromRight % 2 === 1 ? 3 : 1);
  }
  return sum % 10 === 0;
}

/* ---------------------------------- VIN ----------------------------------- */

const VIN_VALUES: Readonly<Record<string, number>> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** ISO 3779 VIN: transliterate, weighted sum, position 9 = mod-11 (10 → 'X').
 *  I/O/Q are illegal in a VIN — presence rejects outright. */
export function vinValid(input: string): boolean {
  const s = stripSeparators(input).toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = s[i];
    const v = ch >= '0' && ch <= '9' ? ch.charCodeAt(0) - 48 : VIN_VALUES[ch];
    sum += v * VIN_WEIGHTS[i];
  }
  const check = sum % 11;
  return s[8] === (check === 10 ? 'X' : String(check));
}

/* ---------------------------------- ISIN ---------------------------------- */

/** ISO 6166 ISIN: 2 letters + 9 alphanumerics + check digit; base-36 expand
 *  then Luhn over the digit string. */
export function isinValid(input: string): boolean {
  const s = stripSeparators(input).toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s)) return false;
  let expanded = '';
  for (const ch of s) {
    expanded += ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
  }
  return luhnValid(expanded);
}

/* ---------------------------- GSTIN (mod 36) ------------------------------- */

const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Indian GSTIN: 15 chars — 2-digit state, PAN(10), entity char, 'Z',
 *  ISO 7064-style mod-36 check char with alternating weights 1/2. */
export function gstinValid(input: string): boolean {
  const s = stripSeparators(input).toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = B36.indexOf(s[i]);
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = (36 - (sum % 36)) % 36;
  return s[14] === B36[check];
}

/** Indian PAN structural shape: AAAPL1234C — 4th char encodes holder type. */
const PAN_HOLDER_TYPES = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']);
export function panStructureValid(input: string): boolean {
  const s = stripSeparators(input).toUpperCase();
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(s) && PAN_HOLDER_TYPES.has(s[3]);
}

/* ------------------------------- SSN (structural) -------------------------- */

/** US SSN structural rules ONLY (no checksum exists): AAA-GG-SSSS with
 *  area ∉ {000, 666, 900-999}, group ≠ 00, serial ≠ 0000. Structural marks
 *  never confirm alone (08 §6 #16). */
export function ssnStructureValid(input: string): boolean {
  const s = stripSeparators(input);
  if (!/^\d{9}$/.test(s)) return false;
  const area = Number(s.slice(0, 3));
  const group = Number(s.slice(3, 5));
  const serial = Number(s.slice(5));
  if (area === 0 || area === 666 || area >= 900) return false;
  return group !== 0 && serial !== 0;
}
