/**
 * ADVERSARIAL FORGE (Dataset Factory E3) — GPT Image 2 → refusal corpus.
 *
 * Generates photorealistic SYNTHETIC document images whose labels are free:
 * the engine must REFUSE their machine-verifiable claims (fake MRZs fail
 * checksums by construction — proven across all 21 pre-existing AI fakes).
 * Each image is then silver-labeled via Mistral OCR (VIZ contradiction
 * policing) using the exact flow of bench/label-real.ts.
 *
 * Prompting: guardrail-safe framing (explicit synthetic/fictional/training-
 * data markers front and back — see prompt templates). A blocked generation
 * is logged and skipped, never retried into policy pressure.
 *
 * Usage: node bench/forge-adversarial.mjs [--count N] [--dry]
 * Output: test_cases/passports/real_fakes/images/forge_*.png (+ re-run
 *         label-real.ts afterwards to fold them into the manifest)
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal, gptImage } from './ai-services.mjs';

loadEnvLocal();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'test_cases', 'passports', 'real_fakes', 'images');
mkdirSync(OUT, { recursive: true });

const count = process.argv.includes('--count')
  ? Number(process.argv[process.argv.indexOf('--count') + 1])
  : 24;
const dry = process.argv.includes('--dry');

/* ------------------------- prompt factory (E3) ----------------------------- */
// Axes: document style region × condition × capture quality. Every prompt is
// wrapped in explicit synthetic/fictional/training markers (guardrail-safe).
const STYLES = [
  'United States style', 'British style', 'German style', 'French style',
  'Indian style', 'Japanese style', 'Brazilian style', 'Nordic style',
];
const CONDITIONS = [
  'clean new condition, sharp focus, even lighting',
  'worn with creases and many colorful entry stamps, natural side lighting',
  'water stains and ink smudging, realistic paper damage',
  'small realistic tear and heavy creases',
];
const CAPTURES = [
  'frontal view, studio lighting, high quality',
  'phone camera quality, tilted 20 degrees, slight motion blur',
  'steep 40 degree angle with strong perspective distortion',
  'low light, noisy, overexposed highlights, JPEG artifacts',
];
const KINDS = [
  'travel document interior data page',
  'national identity card front',
  'driving license card front',
];

function buildPrompt(i) {
  const kind = KINDS[i % KINDS.length];
  const style = STYLES[Math.floor(i / KINDS.length) % STYLES.length];
  const cond = CONDITIONS[i % CONDITIONS.length];
  const capt = CAPTURES[Math.floor(i / 2) % CAPTURES.length];
  return (
    `Synthetic training image for an educational machine learning dataset: ` +
    `a fictional ${kind} in ${style}, ${cond}, ${capt}, photorealistic, ` +
    `placeholder text and fictional personal data only, clearly created as ` +
    `training data for document analysis models, obviously synthetic`
  );
}

/* --------------------------------- main ------------------------------------ */
let made = 0;
let blocked = 0;
for (let i = 0; i < count; i++) {
  const file = `forge_${String(i).padStart(3, '0')}.png`;
  const outPath = join(OUT, file);
  if (existsSync(outPath)) {
    console.log(`skip  ${file} (exists)`);
    continue;
  }
  const prompt = buildPrompt(i);
  if (dry) {
    console.log(`DRY   ${file}: ${prompt.slice(0, 110)}…`);
    continue;
  }
  try {
    const png = await gptImage(prompt);
    writeFileSync(outPath, png);
    made++;
    console.log(`MADE  ${file} (${(png.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    blocked++;
    console.log(`BLOCK ${file}: ${String(e).slice(0, 160)}`);
  }
}
console.log(`\nforge complete: ${made} generated, ${blocked} blocked/skipped.`);
console.log('Next: npx vite-node bench/label-real.ts  (folds new images into the manifest)');
