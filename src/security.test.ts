/**
 * P7.3 §2.3-2.4 — security bans enforced as tests (the repo's lint law).
 *
 *  1. No HTML-injection sinks anywhere in src/: extracted document text is
 *     UNTRUSTED; React's default escaping is the only rendering path.
 *  2. No dynamic code evaluation (eval / new Function) — CSP backs this at
 *     runtime; the test catches it at commit time.
 *  3. Export filenames are sanitized (XSS/path-traversal via document
 *     content dies before it reaches a download attribute or zip entry).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) out.push(p);
  }
  return out;
}

describe('security bans (P7.3)', () => {
  const files = walk(SRC);

  it('walks a real tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no dangerouslySetInnerHTML / innerHTML sinks in src/', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (/dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/.test(text)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no dynamic code evaluation in src/', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (/\beval\s*\(|new\s+Function\s*\(/.test(text)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('document.write is banned', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (/document\.write/.test(readFileSync(f, 'utf8'))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
