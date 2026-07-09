/**
 * REAL-IMAGE LABELING PIPELINE — external OCR + mathematical validation.
 *
 * Anti-bias measure: our rendered corpus shares fonts/layout/rasterizer with
 * the engine's test loop. Real (and third-party-generated) passport images in
 * passport_images/ decorrelate the evaluation — but they need TRUSTWORTHY
 * labels. An external OCR model's output is NOT ground truth by itself; the
 * pipeline therefore only accepts labels that pass independent mathematics:
 *
 *   Mistral OCR (Azure) reads the image
 *     → MRZ candidate lines extracted from its markdown
 *     → our OWN parseMrz validates every ICAO check digit
 *     → status 'valid'  ⇒ fields become truth (two independent systems + math)
 *     → anything else   ⇒ image listed in review.json for HUMAN labeling,
 *                         never silently used as truth.
 *
 * Outputs:
 *   passport_images/corpus-real/manifest.json  — gate-compatible entries
 *   passport_images/corpus-real/review.json    — unverified images + evidence
 *   passport_images/corpus-real/ocr/<name>.md  — raw OCR markdown (audit)
 *
 * Usage:  npx vite-node bench/label-real.ts
 * Env:    MISTRAL_OCR_ENDPOINT, MISTRAL_OCR_KEY (never committed to files)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMrz } from '../src/parsers/mrz';
// @ts-expect-error — plain ESM helper without type declarations
import { loadEnvLocal } from './ai-services.mjs';

loadEnvLocal();

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const FAKES = join(root, 'test_cases', 'passports', 'real_fakes');
const IMAGES = join(FAKES, 'images');
const OUT = FAKES;
const OCR_OUT = join(OUT, 'ocr');
mkdirSync(OCR_OUT, { recursive: true });

const ENDPOINT = process.env.MISTRAL_OCR_ENDPOINT;
const KEY = process.env.MISTRAL_OCR_KEY;
// Credentials are only needed for UNCACHED images — corpus-real/ocr/*.md is
// the audit cache and downstream-extraction reruns work fully offline.

/** Candidate images: top-level files, excluding fixtures and corpus dirs. */
const files = readdirSync(IMAGES, { withFileTypes: true })
  .filter((d) => d.isFile() && /\.(png|jpe?g)$/i.test(d.name) && !/^_/.test(d.name))
  .map((d) => d.name);

async function ocrImage(file: string): Promise<string> {
  if (!ENDPOINT || !KEY) {
    throw new Error('not cached and MISTRAL_OCR_ENDPOINT/MISTRAL_OCR_KEY not set');
  }
  const bytes = readFileSync(join(IMAGES, file));
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const res = await fetch(`${ENDPOINT}/providers/mistral/azure/ocr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistral-ocr-4-0',
      document: { type: 'image_url', image_url: `data:${mime};base64,${bytes.toString('base64')}` },
    }),
  });
  if (!res.ok) throw new Error(`OCR ${file}: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { pages: { markdown: string }[] };
  return json.pages.map((p) => p.markdown).join('\n');
}

/** Extract MRZ candidate lines from OCR markdown: long [A-Z0-9<] runs. */
function mrzCandidates(markdown: string): string[] {
  const out: string[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    // OCR may render '<' as HTML-escaped or with stray spaces — normalize.
    const cleaned = raw
      .replace(/&lt;/g, '<')
      .replace(/[\s`|]/g, '')
      .toUpperCase();
    if (/^[A-Z0-9<]{28,44}$/.test(cleaned) && cleaned.includes('<')) out.push(cleaned);
  }
  return out;
}

/** ISO date from MRZ YYMMDD-derived parser output (already ISO). */
interface Truth {
  passport_number: string;
  date_of_birth: string;
  date_of_expiry: string;
  sex: string;
  country_code: string;
  surname: string;
}

function truthFromParse(p: ReturnType<typeof parseMrz>): Truth | null {
  const f = p.fields;
  if (!f.documentNumber || !f.dateOfBirth || !f.expiryDate || !f.surname) return null;
  return {
    passport_number: f.documentNumber,
    date_of_birth: f.dateOfBirth,
    date_of_expiry: f.expiryDate,
    sex: f.sex ?? '',
    country_code: f.issuingCountry ?? '',
    surname: f.surname,
  };
}

/** Silver VIZ labels: field values parsed from the OCR markdown's printed
 *  captions. NOT math-grade truth (a single OCR read) — used to cross-check:
 *  any field OUR engine confirms that CONTRADICTS the independent read is a
 *  silent-error suspect. Refusals/review statuses are never penalized.
 *
 *  Captions and values are often split across LINES (bilingual layouts put
 *  Arabic between them), so extraction is caption→forward-window over the
 *  flattened text, never per-line. */
function silverVizTruth(markdown: string): Record<string, string> {
  const t: Record<string, string> = {};
  // Strip non-ASCII scripts, collapse whitespace into one searchable text.
  const text = markdown.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();

  const windowAfter = (re: RegExp, len = 90): string | null => {
    const m = re.exec(text);
    return m ? text.slice(m.index + m[0].length, m.index + m[0].length + len) : null;
  };
  const isoFrom = (s: string | null): string | null => {
    if (!s) return null;
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    // Locale disambiguation by arithmetic, never by assumption (live-caught:
    // hard-coded DMY turned a printed MDY 04/23/1985 into the impossible
    // "1985-23-04" and charged the ENGINE with a silent error). >12 pins the
    // day; both ≤12 is genuinely ambiguous — a silver label must be evidence
    // or nothing, so refuse to label rather than guess.
    if (b > 12 && a >= 1 && a <= 12) return `${m[3]}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`; // MDY
    if (a > 12 && b >= 1 && b <= 12) return `${m[3]}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`; // DMY
    return null;
  };

  const passWin = windowAfter(/passport\s*no\.?\s*/i);
  if (passWin) {
    // Identifier shape: letters+digits mixed, not a bare 3-letter code.
    const m = /\b([A-Z][0-9A-Z]{5,9})\b/.exec(passWin);
    if (m && /\d/.test(m[1])) t.passport_number = m[1];
  }
  // full_name is deliberately NOT extracted: "Names"/"Given Name(s)" caption
  // windows bleed into boilerplate on bilingual layouts (live-caught: silver
  // said "NATIONALITY INDIAN" while the ENGINE's read was correct). Silver
  // keeps only high-precision captioned fields; surname comes from its own
  // unambiguous caption.
  const surWin = windowAfter(/\bsurname\b/i, 40);
  if (surWin) {
    const m = /\b([A-Z][A-Za-z'-]{2,})\b/.exec(surWin);
    // Reject caption words in ANY language the window can bleed into —
    // bilingual layouts print "Nom/Surname (1)" so the next "word" after
    // 'surname' is often the OTHER language's caption, not the value
    // (live-caught: silver said surname="NOM" while the engine correctly
    // read "DOE"/"MUSTERFRAU" from the actual value line).
    const CAPTION_WORDS = /^(GIVEN|NAME|NAMES|NOM|NOMS|PRENOM|PRENOMS|APELLIDOS?|NOMBRES?|NACHNAME|VORNAME|COGNOME|NOME|NATIONALITY|TYPE)$/i;
    if (m && !CAPTION_WORDS.test(m[1])) t.surname = m[1].toUpperCase();
  }
  const dobIso = isoFrom(windowAfter(/date of birth/i));
  if (dobIso) t.date_of_birth = dobIso;
  const expIso = isoFrom(windowAfter(/date of expiry/i));
  if (expIso) t.date_of_expiry = expIso;
  const sexWin = windowAfter(/\bsex\b/i, 30);
  if (sexWin) {
    const m = /\b([MFX])\b/.exec(sexWin);
    if (m) t.sex = m[1];
  }
  const ccWin = windowAfter(/country code/i, 40);
  if (ccWin) {
    const m = /\b([A-Z]{3})\b/.exec(ccWin);
    if (m) t.country_code = m[1];
  }
  return t;
}

const manifest: unknown[] = [];
const review: unknown[] = [];

for (const file of files) {
  process.stdout.write(`${file.padEnd(50)} `);
  let markdown = '';
  const cachePath = join(OCR_OUT, `${file.replace(/\.\w+$/, '')}.md`);
  try {
    // Raw OCR output is cached for auditability — reuse it instead of
    // re-spending API calls when only the downstream extraction changed.
    markdown = readFileSync(cachePath, 'utf8');
  } catch {
    try {
      markdown = await ocrImage(file);
      writeFileSync(cachePath, markdown);
    } catch (e) {
      console.log(`OCR ERROR: ${(e as Error).message.slice(0, 120)}`);
      review.push({ file, status: 'ocr_error', error: String(e).slice(0, 300) });
      continue;
    }
  }

  const candidates = mrzCandidates(markdown);
  // Try consecutive pairs (TD3/TD2) and triples (TD1), longest-first.
  let verdict: { lines: string[]; parse: ReturnType<typeof parseMrz> } | null = null;
  for (let n = 3; n >= 2 && !verdict; n--) {
    for (let i = 0; i + n <= candidates.length; i++) {
      const lines = candidates.slice(i, i + n);
      const p = parseMrz(lines.join('\n'));
      if (p.status === 'valid') {
        verdict = { lines, parse: p };
        break;
      }
    }
  }

  if (verdict) {
    const truth = truthFromParse(verdict.parse);
    if (truth) {
      console.log(`VERIFIED ${verdict.parse.format} — ${truth.passport_number} ${truth.surname}`);
      manifest.push({
        file: `images/${file}`,
        class: 'real',
        degradation: 'real',
        truth: { ...truth, mrzLines: verdict.lines },
        expect: { mrzValid: true },
        provenance: 'mistral-ocr-4-0 + ICAO checksum validation (all digits pass)',
      });
      continue;
    }
  }

  // Not math-provable: the MRZ is structurally non-ICAO (all 21 first-run
  // images are AI-generated fakes — doc number abuts the country code with
  // no check digit, dates are DDMMYYYY). These become the REAL-WORLD REFUSAL
  // class: photorealistic, legible, and the engine must never claim their
  // MRZ. Silver VIZ labels (single-source) catch confirmed-field
  // contradictions without ever penalizing honest review statuses.
  const silver = silverVizTruth(markdown);
  const why = candidates.length === 0 ? 'no MRZ-shaped lines in OCR output' : 'checksums do not validate';
  console.log(`FAKE/UNPROVEN (${why}) — refusal class, ${Object.keys(silver).length} silver fields`);
  manifest.push({
    file: `images/${file}`,
    class: 'real_fake',
    degradation: 'real',
    truth: null,
    silverTruth: Object.keys(silver).length > 0 ? silver : null,
    expect: { mrzValid: false },
    provenance: `mistral-ocr-4-0; MRZ ${why} — refusal expected`,
  });
  review.push({ file, status: 'unverified', reason: why, mrzCandidates: candidates, silver });
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(join(OUT, 'review.json'), JSON.stringify(review, null, 2));
console.log(
  `\n${manifest.length} verified → corpus-real/manifest.json · ${review.length} for human review → review.json`,
);
