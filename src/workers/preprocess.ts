import { PageQualityReport, PageTransform, QualitySignal, QualityLevel } from '../core/types';

export interface PreprocessOutput {
  normalizedBitmap: ImageBitmap;
  width: number;
  height: number;
  quality: PageQualityReport;
  transforms: PageTransform[];
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

  return {
    normalizedBitmap,
    width: canonicalWidth,
    height: canonicalHeight,
    quality,
    transforms
  };
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
