/**
 * Shared helpers for bench scripts that use local AI-service credentials.
 * Credentials live ONLY in .env.local (gitignored) — never in code.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Loads KEY=VALUE pairs from .env.local into process.env (no overwrite). */
export function loadEnvLocal() {
  const file = join(root, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

/** OpenAI-compatible chat/responses call against the Azure deployment. */
export async function gptText(input, { system, maxTokens = 4096 } = {}) {
  const res = await fetch(`${process.env.OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'api-key': process.env.OPENAI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GPT_TEXT_DEPLOYMENT,
      input: system ? [{ role: 'system', content: system }, { role: 'user', content: input }] : input,
      max_output_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`gptText ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  // Responses API: output is an array of items; find the message text.
  const msg = (json.output ?? []).find((o) => o.type === 'message');
  const text = msg?.content?.find((c) => c.type === 'output_text')?.text;
  if (!text) throw new Error(`gptText: no output_text in response`);
  return text;
}

/** GPT Image 2 generation → PNG Buffer. */
export async function gptImage(prompt, { size = '1024x1024' } = {}) {
  const res = await fetch(`${process.env.OPENAI_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'api-key': process.env.OPENAI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GPT_IMAGE_DEPLOYMENT,
      prompt,
      n: 1,
      size,
    }),
  });
  if (!res.ok) throw new Error(`gptImage ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('gptImage: no b64_json in response');
  return Buffer.from(b64, 'base64');
}

/** Mistral OCR 4 → concatenated page markdown. */
export async function mistralOcr(imageBuffer, mime = 'image/png') {
  const res = await fetch(`${process.env.MISTRAL_OCR_ENDPOINT}/providers/mistral/azure/ocr`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MISTRAL_OCR_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-ocr-4-0',
      document: { type: 'image_url', image_url: `data:${mime};base64,${imageBuffer.toString('base64')}` },
    }),
  });
  if (!res.ok) throw new Error(`mistralOcr ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.pages.map((p) => p.markdown).join('\n');
}
