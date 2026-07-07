/**
 * AAMVA DL/ID barcode payload parser (Dataset Factory W1 / Tier-1 licenses).
 *
 * US/CA driving licenses duplicate the printed data inside a PDF417 barcode
 * (AAMVA DL/ID Card Design Standard). zxing's decode is Reed-Solomon error
 * corrected — a successful decode IS the payload, bit-for-bit. That makes
 * parsed fields the strongest evidence tier (Documentation/04: "a decode is
 * ground truth, the strongest attestor") — the barcode↔VIZ cross-check is
 * this family's verification anchor.
 *
 * Scope: the universal core element IDs (DAQ/DCS/DAC/DAD/DBB/DBA/DBC/DAG/
 * DAI/DAJ/DAK/DCG). Unknown elements are preserved raw for provenance.
 */

export interface AamvaField {
  /** Three-letter AAMVA element id, e.g. 'DAQ'. */
  elementId: string;
  value: string;
}

export interface AamvaParseResult {
  /** True when the payload carries the AAMVA compliance header. */
  isAamva: boolean;
  issuerId: string | null;
  aamvaVersion: string | null;
  /** All subfile elements in document order. */
  elements: AamvaField[];
  fields: {
    documentNumber?: string;
    surname?: string;
    givenNames?: string;
    /** ISO YYYY-MM-DD (AAMVA dates are MMDDCCYY). */
    dateOfBirth?: string;
    /** ISO YYYY-MM-DD. */
    expiryDate?: string;
    /** 'M' | 'F' | 'X' (AAMVA DBC: 1=male, 2=female, 9=unknown). */
    sex?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
}

/** AAMVA dates are MMDDCCYY (US). Returns ISO or undefined when implausible. */
function aamvaDateToIso(v: string): string | undefined {
  if (!/^\d{8}$/.test(v)) return undefined;
  const mm = Number(v.slice(0, 2));
  const dd = Number(v.slice(2, 4));
  const yyyy = Number(v.slice(4, 8));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100) return undefined;
  return `${v.slice(4, 8)}-${v.slice(0, 2)}-${v.slice(2, 4)}`;
}

/**
 * Parses a decoded PDF417 text payload as AAMVA. Returns `isAamva: false`
 * (with empty fields) for non-AAMVA payloads — callers must treat that as
 * "this barcode is not a license", never as an error.
 */
export function parseAamva(payload: string): AamvaParseResult {
  const none: AamvaParseResult = {
    isAamva: false,
    issuerId: null,
    aamvaVersion: null,
    elements: [],
    fields: {},
  };
  if (typeof payload !== 'string' || payload.length < 20) return none;

  // Compliance header: '@' LF RS CR 'ANSI ' IIN(6) version(2)…
  const header = /@\s*\x1e?\s*ANSI\s?(\d{6})(\d{2})/.exec(payload);
  if (!header) return none;

  // Subfile body: everything after the LAST designator block. Element lines
  // are separated by LF; the subfile terminates with CR.
  const dlStart = payload.indexOf('DL', header.index + header[0].length);
  const idStart = payload.indexOf('ID', header.index + header[0].length);
  const start = dlStart === -1 ? idStart : idStart === -1 ? dlStart : Math.min(dlStart, idStart);
  if (start === -1) return none;

  // Skip subfile designators (repeats of 'DL'/'ID' + offsets) to the first
  // element id (3 uppercase chars starting with D).
  const body = payload.slice(start);
  const firstElem = body.search(/D[A-Z]{2}/);
  if (firstElem === -1) return none;
  let seg = body.slice(firstElem);
  // The subfile DATA itself begins with its 2-char type designator ('DL'/'ID')
  // immediately followed by the first element ("DLDAQ…") — strip it, or the
  // first element id would mis-parse as 'DLD'.
  if (/^(DL|ID)D[A-Z]{2}/.test(seg)) seg = seg.slice(2);

  const elements: AamvaField[] = [];
  for (const rawLine of seg.split(/\n/)) {
    const line = rawLine.replace(/\r.*$/, '').trim();
    const m = /^(D[A-Z]{2})(.*)$/.exec(line);
    if (m && m[2].length > 0) elements.push({ elementId: m[1], value: m[2].trim() });
  }
  if (elements.length === 0) return none;

  const get = (id: string): string | undefined =>
    elements.find((e) => e.elementId === id)?.value;

  const sexRaw = get('DBC');
  const fields: AamvaParseResult['fields'] = {
    documentNumber: get('DAQ'),
    surname: get('DCS'),
    givenNames: [get('DAC'), get('DAD')].filter(Boolean).join(' ') || undefined,
    dateOfBirth: get('DBB') ? aamvaDateToIso(get('DBB')!) : undefined,
    expiryDate: get('DBA') ? aamvaDateToIso(get('DBA')!) : undefined,
    sex: sexRaw === '1' ? 'M' : sexRaw === '2' ? 'F' : sexRaw === '9' ? 'X' : undefined,
    address: get('DAG'),
    city: get('DAI'),
    state: get('DAJ'),
    postalCode: get('DAK'),
  };

  return {
    isAamva: true,
    issuerId: header[1],
    aamvaVersion: header[2],
    elements,
    fields,
  };
}
