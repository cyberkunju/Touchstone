/**
 * Small, dependency-free fuzzy string utilities for tolerant label matching.
 *
 * Real-world OCR garbles labels ("Date of Birth" -> "Date ofBith",
 * "Nationality" -> "Natinaliy"). Exact/substring matching then fails, so a
 * field's label is neither recognized nor excluded from the value pool. These
 * helpers let the extractors match a label to its canonical form by edit
 * distance, while still preferring the closest (best) match so similar labels
 * like "Place of Birth" vs "Date of Birth" are not confused.
 */

/**
 * Levenshtein edit distance between two strings (insertions, deletions,
 * substitutions each cost 1). Iterative two-row implementation, O(n*m) time and
 * O(min(n,m)) space.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure `b` is the shorter for the row buffer.
  if (b.length > a.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    const t = prev;
    prev = curr;
    curr = t;
  }
  return prev[b.length];
}

/**
 * Normalized similarity in [0,1]: `1 - distance / maxLen`. 1 means identical,
 * 0 means completely different.
 */
export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Best similarity between `needle` and any contiguous word-window of
 * `haystack` whose word-count is within +/-1 of `needle`'s word count. This
 * lets a synonym match inside a longer (possibly noisy) label string, e.g.
 * matching "date of birth" inside "date of birth janma tithi".
 */
export function bestWindowSimilarity(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  if (haystack === needle) return 1;

  const words = haystack.split(/\s+/).filter(Boolean);
  const needleWords = needle.split(/\s+/).filter(Boolean).length;
  if (words.length === 0) return 0;

  let best = similarity(haystack, needle);
  for (let w = Math.max(1, needleWords - 1); w <= needleWords + 1; w++) {
    for (let i = 0; i + w <= words.length; i++) {
      const window = words.slice(i, i + w).join(' ');
      const s = similarity(window, needle);
      if (s > best) best = s;
    }
  }
  return best;
}
