import {
  contrastFromLuminance,
  relativeLuminance,
  toRgb255,
} from "@echo-ui-kit/tools-core";

// Lower than imagePalette's cap: palette extraction hunts for small accent colors that a
// downscale can erase, whereas this only ever asks "how bright is the area under this text,"
// which survives a modest downscale intact. Capping smaller keeps getImageData and the per-drag
// region scans cheap enough to stay responsive while dragging.
const MAX_SOURCE_DIMENSION = 1600;

// Contrast is evaluated against *opaque* background pixels; a mostly-transparent pixel shows
// whatever is behind the image, which this can't know about.
const MIN_ALPHA = 200;

// Enough samples to find the genuinely worst pixel under the text without scanning every one of
// what can be hundreds of thousands in a large region. Sampling is a uniform stride in both
// axes, so a dark band crossing the text is hit regardless of where it falls.
const MAX_REGION_SAMPLES = 4000;

/** Normalized (0–1) rectangle within the image, so callers can work in layout percentages
 *  without knowing the image's pixel dimensions. */
export interface NormalizedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RegionContrastStats {
  /** The single worst pixel under the text — what actually decides whether the text is readable,
   *  since one unreadable patch makes the whole word unreadable regardless of the average. */
  min: number;
  max: number;
  average: number;
  /** Share of sampled pixels (0–1) below the caller's pass threshold. */
  failingShare: number;
  sampleCount: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the image"));
    image.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/** Decodes an image file into raw pixels once, up front — every subsequent contrast check reads
 *  this buffer rather than re-decoding, which is what makes dragging the text stay smooth. */
export async function loadImagePixels(file: File): Promise<ImageData> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const scale = Math.min(
    1,
    MAX_SOURCE_DIMENSION / Math.max(image.width, image.height),
  );
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable");
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Scores a text color against every (sampled) background pixel it would sit on top of.
 *
 * A single ratio can't describe text over a photo — the background varies per pixel, so the
 * honest answer is a distribution. `min` is the number that matters: WCAG is about whether the
 * text can be read, and the letters crossing the brightest part of a sky are unreadable no matter
 * how good the average over the whole word is.
 */
export function regionContrastStats(
  pixels: ImageData,
  region: NormalizedRegion,
  textColor: string,
  passThreshold: number,
): RegionContrastStats | null {
  const { r, g, b } = toRgb255(textColor);
  const textLuminance = relativeLuminance(r, g, b);

  // Clamped to the image so text dragged partly past an edge still scores the part that's
  // actually over the image, instead of reading out of bounds or returning nothing.
  const left = Math.max(0, Math.floor(region.x * pixels.width));
  const top = Math.max(0, Math.floor(region.y * pixels.height));
  const right = Math.min(
    pixels.width,
    Math.ceil((region.x + region.width) * pixels.width),
  );
  const bottom = Math.min(
    pixels.height,
    Math.ceil((region.y + region.height) * pixels.height),
  );
  const regionWidth = right - left;
  const regionHeight = bottom - top;
  if (regionWidth <= 0 || regionHeight <= 0) return null;

  // One stride for both axes keeps the sample grid square — striding each axis independently
  // would oversample the short axis on a wide, thin text box.
  const stride = Math.max(
    1,
    Math.floor(Math.sqrt((regionWidth * regionHeight) / MAX_REGION_SAMPLES)),
  );

  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let total = 0;
  let failing = 0;
  let count = 0;

  for (let y = top; y < bottom; y += stride) {
    for (let x = left; x < right; x += stride) {
      const i = (y * pixels.width + x) * 4;
      if ((pixels.data[i + 3] as number) < MIN_ALPHA) continue;
      const ratio = contrastFromLuminance(
        textLuminance,
        relativeLuminance(
          pixels.data[i] as number,
          pixels.data[i + 1] as number,
          pixels.data[i + 2] as number,
        ),
      );
      if (ratio < min) min = ratio;
      if (ratio > max) max = ratio;
      if (ratio < passThreshold) failing++;
      total += ratio;
      count++;
    }
  }

  if (count === 0) return null;
  return {
    min,
    max,
    average: total / count,
    failingShare: failing / count,
    sampleCount: count,
  };
}
