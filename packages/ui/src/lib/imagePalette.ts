import {
  type ExtractedColor,
  extractPaletteFromSamples,
  type RgbSample,
} from "@echo-ui-kit/tools-core";

// Read at (near) native resolution and cap only pathologically large sources — the previous
// approach shrank the whole image onto a small fixed canvas (64px, then 128px) before sampling,
// which crushes a small deliberate UI accent (a 30x14px colored text label, say) down to maybe
// one or two pixels in the sample grid. Whether nearest-neighbor sampling's one shot happens to
// land on the accent color versus the background around it is close to a coin flip — that's a
// sampling-odds problem no amount of resolution bumping within "small canvas" fixes, only
// avoiding the aggressive shrink in the first place does.
const MAX_SOURCE_DIMENSION = 2000;
// Below this alpha, a pixel is effectively transparent — including it would let a transparent
// PNG's "empty" regions get sampled as black, skewing extraction toward a color that was never
// actually visible.
const MIN_ALPHA = 200;

// A uniform stride sample (even a dense one) still treats a huge neutral background and a tiny
// colorful accent the same way — both get hit "once every N pixels," so an accent smaller than
// the stride spacing can be skipped entirely by bad luck. Classifying every pixel first (cheap:
// just the max-min RGB channel range, no color-space conversion) and keeping colorful pixels
// almost intact while aggressively thinning the neutral background instead means a small
// deliberate accent is found *because every one of its pixels was actually examined*, not
// because a stride happened to land on it. 30 empirically separates true neutrals — white,
// light gray, pale washed-out backgrounds (range 0-20) — from anything with real hue information
// (navy ~40+, a light-blue accent ~100+, saturated text colors 150+).
const COLORFUL_RGB_RANGE_THRESHOLD = 30;
// Independent budgets: colorful pixels are rare enough in a typical UI screenshot that this
// target is rarely even reached (everything found gets kept), while the neutral background is
// usually the overwhelming majority of pixels and doesn't need much resolution — it's going to
// cluster down to one or two "the background is light/dark" colors regardless of how many
// samples represent it.
const COLORFUL_SAMPLE_TARGET = 20000;
const NEUTRAL_SAMPLE_TARGET = 4000;

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

function sampleImage(image: HTMLImageElement): RgbSample[] {
  // Aspect-preserving this time (unlike the old fixed-square approach) — distorting the image
  // no longer matters less than before, since a stretched-then-strided read could skip a small
  // feature along the compressed axis more easily than an undistorted one would.
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
  // Disabled for the same reason as the resolution cap above — the browser's default downscale
  // filter averages source pixels together, which would still dilute a small accent color even
  // at this much higher resolution. Nearest-neighbor keeps each read pixel a real, unblended
  // source color.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  // First pass: classify *every* pixel (not strided — this is the whole point) as colorful or
  // neutral. Cheap enough to run unstrided even on a couple million pixels since it's just two
  // comparisons per pixel, no OKLab conversion — that more expensive step only happens later,
  // on the much smaller pool this produces.
  const colorfulIndices: number[] = [];
  const neutralIndices: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] as number;
    if (alpha < MIN_ALPHA) continue;
    const r = data[i] as number;
    const g = data[i + 1] as number;
    const b = data[i + 2] as number;
    const range = Math.max(r, g, b) - Math.min(r, g, b);
    (range >= COLORFUL_RGB_RANGE_THRESHOLD
      ? colorfulIndices
      : neutralIndices
    ).push(i);
  }

  return [
    ...sampleFromIndices(data, colorfulIndices, COLORFUL_SAMPLE_TARGET),
    ...sampleFromIndices(data, neutralIndices, NEUTRAL_SAMPLE_TARGET),
  ];
}

/** Thins a list of pixel-data offsets down toward `target` by taking an even stride through
 *  them, tagging each kept sample with a weight equal to that stride — see RgbSample.weight for
 *  why: it lets extractPaletteFromSamples report an honest share despite the uneven thinning. A
 *  pool already at or under budget is returned untouched (stride 1, weight 1 each). */
function sampleFromIndices(
  data: Uint8ClampedArray,
  indices: number[],
  target: number,
): RgbSample[] {
  const stride = Math.max(1, Math.floor(indices.length / target));
  const samples: RgbSample[] = [];
  for (let j = 0; j < indices.length; j += stride) {
    const i = indices[j] as number;
    samples.push({
      r: data[i] as number,
      g: data[i + 1] as number,
      b: data[i + 2] as number,
      weight: stride,
    });
  }
  return samples;
}

/** Extracts up to `count` dominant colors, ranked by prominence, from an image file (upload,
 *  drag-drop, or a pasted clipboard image all hand this the same File/Blob shape). */
export async function extractPaletteFromImageFile(
  file: File,
  count: number,
): Promise<ExtractedColor[]> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const samples = sampleImage(image);
  if (samples.length === 0) {
    throw new Error("This image has no visible pixels to sample");
  }
  return extractPaletteFromSamples(samples, count);
}
