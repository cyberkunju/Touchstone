import { PageQualityReport, PageTransform, QualitySignal, QualityLevel } from '../core/types';

export interface PreprocessOutput {
  normalizedBitmap: ImageBitmap;
  width: number;
  height: number;
  quality: PageQualityReport;
  transforms: PageTransform[];
  /** Estimated page skew in degrees (0 when undetectable — never guessed). */
  skewDeg: number;
}

/**
 * Normalizes an ImageBitmap using OffscreenCanvas.
 * Measures blur, glare, and resolution, and deskews/corrects orientation.
 */
export async function preprocessPage(
  imageBitmap: ImageBitmap,
  _pageIndex: number
): Promise<PreprocessOutput> {
  const originalWidth = imageBitmap.width;
  const originalHeight = imageBitmap.height;

  // 1. Establish Canonical coordinate constraints (canonical_width = 1000)
  const canonicalWidth = 1000;
  const aspectRatio = originalHeight / originalWidth;
  const canonicalHeight = Math.round(canonicalWidth * aspectRatio);

  // 2. Initialize OffscreenCanvas
  const canvas = new OffscreenCanvas(canonicalWidth, canonicalHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get OffscreenCanvas 2D context');
  }

  // Draw original image scaled to canonical dimensions
  ctx.drawImage(imageBitmap, 0, 0, canonicalWidth, canonicalHeight);

  // 3. Extract pixel data for quality analysis
  const imageData = ctx.getImageData(0, 0, canonicalWidth, canonicalHeight);
  
  // Quality Checks
  const blurSignal = checkBlur(imageData);
  const glareSignal = checkGlare(imageData);
  const contrastSignal = checkContrast(imageData);
  const resolutionSignal = checkResolution(originalWidth, originalHeight);

  const safeToExtract =
    blurSignal.level !== 'bad' &&
    glareSignal.level !== 'bad' &&
    resolutionSignal.level !== 'bad';

  const warnings: string[] = [];
  if (blurSignal.level === 'warning') warnings.push('Document text may be slightly blurry.');
  if (blurSignal.level === 'bad') warnings.push('Document is blurry. High risk of OCR failure.');
  if (glareSignal.level === 'warning') warnings.push('Minor reflection/glare detected.');
  if (glareSignal.level === 'bad') warnings.push('Heavy glare detected. Text may be obscured.');
  if (resolutionSignal.level === 'bad') warnings.push('Low resolution scan. Small text will be unreadable.');

  const quality: PageQualityReport = {
    blur: blurSignal,
    glare: glareSignal,
    contrast: contrastSignal,
    resolution: resolutionSignal,
    cropCompleteness: { score: 1.0, level: 'good' },
    perspective: { score: 1.0, level: 'good' },
    orientation: { score: 0.0, level: 'good' },
    safeToExtract,
    warnings
  };

  const transforms: PageTransform[] = [
    {
      type: 'scale',
      parameters: {
        fromWidth: originalWidth,
        fromHeight: originalHeight,
        toWidth: canonicalWidth,
        toHeight: canonicalHeight
      },
      timestamp: Date.now()
    }
  ];

  // Transfer canvas back to an ImageBitmap
  const normalizedBitmap = canvas.transferToImageBitmap();

  // 4. Skew estimation on the canonical thumbnail (P1.8a). Reported to the
  // caller; the App applies the rotation to the WORKING bitmap so the whole
  // pipeline (detection, recognition, MRZ band) sees level text.
  const skewDeg = estimateSkewDeg(imageData);
  if (Math.abs(skewDeg) >= 1.5) {
    quality.orientation = { score: Math.min(1, Math.abs(skewDeg) / 15), level: 'warning' };
    transforms.push({
      type: 'rotate',
      parameters: { angleDeg: skewDeg },
      timestamp: Date.now(),
    });
  }

  return {
    normalizedBitmap,
    width: canonicalWidth,
    height: canonicalHeight,
    quality,
    transforms,
    skewDeg,
  };
}

/**
 * Estimates page skew (degrees, positive = content rotated clockwise) via the
 * projection-profile method: binarize a downscaled grayscale, then for each
 * candidate angle compute the variance of row ink-sums after shearing rows by
 * that angle. Level text concentrates ink into few rows → maximum variance at
 * the true skew. Deterministic, dependency-free, ~ms at 400px width.
 *
 * Search space ±12° (typical photo skew); step 0.5° then 0.1° refinement.
 * Returns 0 for content without usable line structure (blank/noise pages) —
 * the variance peak must beat the 0° baseline by 8% to be believed, so the
 * method NEVER rotates a page it does not understand (N1 applies to
 * preprocessing too: a wrong rotation is worse than none).
 */
export function estimateSkewDeg(imageData: ImageData): number {
  const { data, width, height } = imageData;
  // Downscale to ~400px wide grid for speed (nearest sampling).
  const gw = Math.min(400, width);
  const gh = Math.max(1, Math.round((gw * height) / width));
  const stepX = width / gw;
  const stepY = height / gh;

  // Grayscale + global threshold (mean - 0.25σ: ink is darker than paper).
  const gray = new Float32Array(gw * gh);
  let mean = 0;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const sx = Math.min(width - 1, Math.floor(x * stepX));
      const sy = Math.min(height - 1, Math.floor(y * stepY));
      const i = (sy * width + sx) * 4;
      const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[y * gw + x] = v;
      mean += v;
    }
  }
  mean /= gw * gh;
  let variance = 0;
  for (let i = 0; i < gray.length; i++) variance += (gray[i] - mean) ** 2;
  const sigma = Math.sqrt(variance / gray.length);
  const threshold = mean - 0.25 * sigma;

  const ink: number[][] = [];
  // Text glyphs are SHORT dark runs (≤8px at 400px width); backgrounds,
  // photo boxes and border art are long runs — without this filter a dark
  // backdrop drowns the profile and the estimator refuses on real photos
  // (observed live on the corpus rot-7 rung).
  const MAX_TEXT_RUN = 12;
  let inkCount = 0;
  for (let y = 0; y < gh; y++) {
    const row: number[] = [];
    let runStart = -1;
    for (let x = 0; x <= gw; x++) {
      const dark = x < gw && gray[y * gw + x] < threshold;
      if (dark && runStart < 0) runStart = x;
      if (!dark && runStart >= 0) {
        const runLen = x - runStart;
        if (runLen <= MAX_TEXT_RUN) {
          for (let rx = runStart; rx < x; rx++) row.push(rx);
        }
        runStart = -1;
      }
    }
    inkCount += row.length;
    ink.push(row);
  }
  // Degenerate ink mass (blank page or saturated noise): refuse to guess.
  const inkFrac = inkCount / (gw * gh);
  if (inkFrac < 0.005 || inkFrac > 0.4) return 0;

  const profileVariance = (angleDeg: number): number => {
    // Content rotated by +θ has lines along y = y0 + x·tan(θ); shearing by
    // −tan(θ) re-levels them (sign verified by the synthetic-angle tests —
    // the first cut used +tan and reported every angle negated).
    const t = -Math.tan((angleDeg * Math.PI) / 180);
    const bins = new Float64Array(gh + gw); // sheared y can exceed gh
    for (let y = 0; y < gh; y++) {
      const row = ink[y];
      for (let j = 0; j < row.length; j++) {
        const sy = Math.round(y + row[j] * t) + Math.floor(gw / 2);
        if (sy >= 0 && sy < bins.length) bins[sy]++;
      }
    }
    let m = 0;
    for (let i = 0; i < bins.length; i++) m += bins[i];
    m /= bins.length;
    let v = 0;
    for (let i = 0; i < bins.length; i++) v += (bins[i] - m) ** 2;
    return v;
  };

  const base = profileVariance(0);
  let bestAngle = 0;
  let bestVar = base;
  for (let a = -12; a <= 12; a += 0.5) {
    if (a === 0) continue;
    const v = profileVariance(a);
    if (v > bestVar) {
      bestVar = v;
      bestAngle = a;
    }
  }
  // Refinement around the coarse peak.
  for (let a = bestAngle - 0.4; a <= bestAngle + 0.4; a += 0.1) {
    const v = profileVariance(a);
    if (v > bestVar) {
      bestVar = v;
      bestAngle = a;
    }
  }

  // Believe the peak only when clearly better than level — never guess.
  if (bestVar < base * 1.08) return 0;
  return Math.round(bestAngle * 10) / 10;
}

/**
 * Calculates blur using the variance of Laplacian operator.
 * Grayscales image and applies a 3x3 Laplacian edge-detection kernel.
 */
function checkBlur(imageData: ImageData): QualitySignal {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  // Step 1: Grayscale conversion
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Step 2: Apply Laplacian Kernel
  // [ 0,  1,  0 ]
  // [ 1, -4,  1 ]
  // [ 0,  1,  0 ]
  const laplacian = new Float32Array(width * height);
  let N = 0;
  let sum = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      const val = 
        gray[idx - width] + // Top
        gray[idx - 1] +     // Left
        -4 * gray[idx] +    // Center
        gray[idx + 1] +     // Right
        gray[idx + width];  // Bottom
      
      laplacian[idx] = val;
      sum += val;
      N++;
    }
  }

  const mean = sum / N;

  // Step 3: Compute variance
  let varianceSum = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      varianceSum += Math.pow(laplacian[idx] - mean, 2);
    }
  }

  const variance = varianceSum / N;

  // Thresholds based on canonical 1000px width
  let level: QualityLevel = 'good';
  if (variance < 40) {
    level = 'bad';
  } else if (variance < 80) {
    level = 'warning';
  }

  return {
    score: Math.min(1.0, variance / 250),
    level,
    reason: level !== 'good' ? `Laplacian variance of ${Math.round(variance)} indicates blur.` : undefined
  };
}

/**
 * Checks for glare (regions of saturated white pixels).
 */
function checkGlare(imageData: ImageData): QualitySignal {
  const { data, width, height } = imageData;
  let whitePixels = 0;
  const totalPixels = width * height;

  // Saturated pixel threshold: RGB >= 250 in all channels
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r >= 250 && g >= 250 && b >= 250) {
      whitePixels++;
    }
  }

  const ratio = whitePixels / totalPixels;

  let level: QualityLevel = 'good';
  if (ratio > 0.05) {
    level = 'bad';
  } else if (ratio > 0.01) {
    level = 'warning';
  }

  const score = Math.max(0.0, 1.0 - ratio * 10);

  return {
    score,
    level,
    reason: level !== 'good' ? `${(ratio * 100).toFixed(1)}% of page is overexposed/glared.` : undefined
  };
}

/**
 * Evaluates image contrast using standard deviation of grayscale luminance.
 */
function checkContrast(imageData: ImageData): QualitySignal {
  const { data, width, height } = imageData;
  const total = width * height;
  let luminanceSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    luminanceSum += 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const meanLuminance = luminanceSum / total;

  let varianceSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    varianceSum += Math.pow(lum - meanLuminance, 2);
  }

  const stdDev = Math.sqrt(varianceSum / total);

  // Lower stdDev means lower contrast (closer to flat gray/white)
  let level: QualityLevel = 'good';
  if (stdDev < 25) {
    level = 'bad';
  } else if (stdDev < 45) {
    level = 'warning';
  }

  return {
    score: Math.min(1.0, stdDev / 80),
    level,
    reason: level !== 'good' ? `Low luminance contrast stdDev of ${Math.round(stdDev)}.` : undefined
  };
}

/**
 * Evaluates resolution based on physical pixel boundaries.
 */
function checkResolution(width: number, height: number): QualitySignal {
  const totalPixels = width * height;
  
  // 1.5 Megapixels is our minimum for reliable OCR
  const warningThreshold = 1500000;
  const badThreshold = 750000;

  let level: QualityLevel = 'good';
  if (totalPixels < badThreshold) {
    level = 'bad';
  } else if (totalPixels < warningThreshold) {
    level = 'warning';
  }

  const mp = totalPixels / 1000000;

  return {
    score: Math.min(1.0, totalPixels / 3000000),
    level,
    reason: level !== 'good' ? `Image has low resolution: ${mp.toFixed(2)} Megapixels.` : undefined
  };
}
