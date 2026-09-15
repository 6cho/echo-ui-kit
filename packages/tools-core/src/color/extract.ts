import { clampChroma, formatHex, type Oklab, oklab, oklch } from "culori";

export interface RgbSample {
  r: number;
  g: number;
  b: number;
  /** How many real image pixels this one sample stands in for — defaults to 1. Lets a caller
   *  downsample unevenly (e.g. keeping nearly every colorful pixel but heavily thinning out a
   *  huge neutral background) without losing the ability to report an honest, unbiased `share`
   *  afterward: a sample with weight 50 counts as 50 toward both cluster assignment and the
   *  final percentage, so the *reported* proportions still reflect the true image even though
   *  the *sampled* pool doesn't. */
  weight?: number;
}

export interface ExtractedColor {
  hex: string;
  /** True share of the image's pixels whose nearest cluster this is, 0-1 — how much of the
   *  image the color actually covers, correctly weighted even if the caller's sample pool
   *  itself was unevenly downsampled (see RgbSample.weight). Not the same thing results are
   *  ranked by (see the module doc comment on extractPaletteFromSamples) — a vivid, eye-catching
   *  color with a small share can still rank ahead of a larger but visually "quiet" one, while
   *  this field keeps reporting its true, honest area. */
  share: number;
}

const MAX_ITERATIONS = 12;

function chromaOf(color: Oklab): number {
  const a = color.a ?? 0;
  const b = color.b ?? 0;
  return Math.sqrt(a * a + b * b);
}

// Merge threshold scales with how saturated the pair being compared is — hue is visually
// meaningless on a near-neutral color (a pixel with chroma ~0 "looks white/gray" regardless of
// what hue the math assigns it, the same reasoning PaletteGenerator's own isBaseGrayscale check
// already uses), so two near-white/near-gray clusters that only differ in that meaningless hue
// should merge far more readily than two clusters that are both genuinely saturated, where a
// hue difference is real and worth keeping as two separate colors. Both constants were tuned
// against representative pastel pairs (avg chroma 0.01-0.06, real distances 0.019-0.084 — all
// need to merge) versus genuinely distinct saturated colors like olive/golden (chroma 0.07-0.10,
// distance 0.053 — must NOT merge): a flat threshold can't satisfy both at once, since raising it
// enough to catch the pastel pairs also swallows the olive/golden pair.
const LOW_CHROMA = 0.03;
const HIGH_CHROMA = 0.08;
const LOOSE_MERGE_DISTANCE = 0.095;
const TIGHT_MERGE_DISTANCE = 0.05;

function mergeDistance(a: Oklab, b: Oklab): number {
  const avgChroma = (chromaOf(a) + chromaOf(b)) / 2;
  if (avgChroma <= LOW_CHROMA) return LOOSE_MERGE_DISTANCE;
  if (avgChroma >= HIGH_CHROMA) return TIGHT_MERGE_DISTANCE;
  const t = (avgChroma - LOW_CHROMA) / (HIGH_CHROMA - LOW_CHROMA);
  return (
    LOOSE_MERGE_DISTANCE + t * (TIGHT_MERGE_DISTANCE - LOOSE_MERGE_DISTANCE)
  );
}

interface Cluster {
  centroid: Oklab;
  weight: number;
}

function mergeNearDuplicateClusters(clusters: Cluster[]): Cluster[] {
  // Most prominent (by total weight) first, so a big cluster always "wins" the merge (absorbs a
  // smaller near-duplicate into itself) rather than the outcome depending on array order. This
  // is about which centroid is the more statistically stable one to keep, which is a different
  // question from visual-prominence ranking (see visualProminence below) — total weight is the
  // right criterion here regardless of how the final list gets ordered.
  const sorted = [...clusters].sort((a, b) => b.weight - a.weight);
  const merged: Cluster[] = [];
  for (const cluster of sorted) {
    const match = merged.find((kept) => {
      const threshold = mergeDistance(kept.centroid, cluster.centroid);
      return (
        distanceSquared(kept.centroid, cluster.centroid) < threshold * threshold
      );
    });
    if (match) {
      match.weight += cluster.weight;
    } else {
      merged.push({ centroid: cluster.centroid, weight: cluster.weight });
    }
  }
  return merged;
}

// Tuned against three cases together, all of which have to hold at once: (1) a landscape photo
// — hazy near-white sky at 52.6% share (chroma 0.005), olive mountain 26.3% (chroma 0.064),
// golden terrace 15.8% (chroma 0.133), a small vivid blue patch at only 5.3% share but chroma
// 0.197 — where the small vivid patch has to outrank the much larger olive mountain; (2) a UI
// screenshot — a white background covering 72% of the frame (chroma ~0) alongside a light-blue
// accent at only 9% share — where that white background has to lose even to small saturated
// accents, not just fail to win; (3) a genuinely monochrome image, where nothing has any chroma
// to differentiate on and ranking must fall back to plain area. A plain linear "share × (1 +
// weight × chroma)" model can satisfy none of these: it can never let a small vivid patch
// outrank a larger, moderately-saturated one no matter the weight (the larger one's own share
// and chroma advantage compounds faster than any finite linear bonus), and giving neutral colors
// a multiplier of exactly 1 (neither boosted nor penalized) still lets a big enough neutral area
// win on raw share alone, which is exactly what happened with the white background. Three
// changes together fix this: dampening share's influence (a fractional power compresses how much
// a raw area advantage is worth), rewarding chroma superlinearly (an exponent > 1 so genuinely
// vivid colors pull disproportionately ahead of merely "somewhat saturated" ones), and — new
// here — giving neutral colors a multiplier *below* 1 (NEUTRAL_FLOOR) instead of exactly 1, so a
// large flat-colored background is actively discounted rather than just left unboosted. Case (3)
// still resolves correctly because every neutral cluster gets the *same* floor multiplier, so
// relative order among them is untouched — only case (2)'s specific problem (a neutral outranking
// a saturated color) goes away.
const VIBRANCY_REFERENCE_CHROMA = 0.15;
const VIBRANCY_WEIGHT = 4;
const VIBRANCY_EXPONENT = 1.5;
const SHARE_DAMPENING_EXPONENT = 0.35;
const NEUTRAL_FLOOR = 0.25;

function visualProminence(share: number, centroid: Oklab): number {
  const normalizedChroma = Math.min(
    chromaOf(centroid) / VIBRANCY_REFERENCE_CHROMA,
    1,
  );
  return (
    share ** SHARE_DAMPENING_EXPONENT *
    (NEUTRAL_FLOOR + VIBRANCY_WEIGHT * normalizedChroma ** VIBRANCY_EXPONENT)
  );
}

function toOklabPoint(sample: RgbSample): Oklab {
  const converted = oklab({
    mode: "rgb",
    r: sample.r / 255,
    g: sample.g / 255,
    b: sample.b / 255,
  });
  if (!converted) throw new Error("Could not convert RGB sample to OKLab");
  return converted;
}

function distanceSquared(a: Oklab, b: Oklab): number {
  const dl = a.l - (b.l ?? 0);
  const da = (a.a ?? 0) - (b.a ?? 0);
  const db = (a.b ?? 0) - (b.b ?? 0);
  return dl * dl + da * da + db * db;
}

// k-means++ seeding: each new centroid is the point farthest from every centroid picked so
// far, rather than a random pick — this spreads the initial centroids across the image's real
// color spread instead of risking two random seeds landing in the same dominant color and
// starving a genuinely distinct one of its own cluster.
function seedCentroids(points: Oklab[], k: number): Oklab[] {
  const centroids: Oklab[] = [];
  const first = points[Math.floor(Math.random() * points.length)];
  if (!first) return centroids;
  centroids.push(first);

  while (centroids.length < k && centroids.length < points.length) {
    let farthestPoint: Oklab | undefined;
    let farthestDistance = -1;
    for (const point of points) {
      let nearest = Number.POSITIVE_INFINITY;
      for (const centroid of centroids) {
        const d = distanceSquared(point, centroid);
        if (d < nearest) nearest = d;
      }
      if (nearest > farthestDistance) {
        farthestDistance = nearest;
        farthestPoint = point;
      }
    }
    if (!farthestPoint) break;
    centroids.push(farthestPoint);
  }
  return centroids;
}

/**
 * Clusters sampled pixels in OKLab space (weighted k-means) and returns up to `count`
 * representative colors — the closest thing to "the dominant colors of this image" without
 * pulling in a dedicated image library. OKLab rather than OKLCH for the clustering math
 * specifically because its a/b axes are plain Cartesian coordinates: OKLCH's hue is a wrap-around
 * angle, which would need special-cased distance math to avoid treating hues on opposite sides of
 * the 0/360 seam as maximally far apart when they're actually adjacent.
 *
 * Samples carry an optional `weight` (default 1) precisely so a caller can hand this an unevenly
 * downsampled pool — e.g. keeping nearly every colorful pixel found but heavily thinning a huge
 * neutral background — without that skew silently corrupting the reported `share` values;
 * weighted counting recovers the true proportions regardless of how the pool was assembled.
 *
 * Ranked by *visual* prominence, not raw pixel coverage — a small patch of vivid, saturated
 * color reads as more "part of the image's palette" to a human than its pixel count alone would
 * suggest (a vast pale, hazy sky is visually quiet; a small patch of vivid blue or green is what
 * actually catches the eye), so a cluster's rank blends its true pixel share with how saturated
 * it is. The reported `share` field stays the honest, unweighted-by-vibrancy pixel fraction
 * either way — only the *order* this function returns results in changes.
 */
export function extractPaletteFromSamples(
  samples: RgbSample[],
  count: number,
): ExtractedColor[] {
  if (samples.length === 0 || count <= 0) return [];

  const points = samples.map(toOklabPoint);
  const weights = samples.map((s) => s.weight ?? 1);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const k = Math.min(count, points.length);
  let centroids = seedCentroids(points, k);
  const assignments = new Array<number>(points.length).fill(0);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      const point = points[i] as Oklab;
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centroids.length; c++) {
        const d = distanceSquared(point, centroids[c] as Oklab);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = c;
        }
      }
      if (assignments[i] !== bestIndex) {
        assignments[i] = bestIndex;
        changed = true;
      }
    }

    const sums = centroids.map(() => ({ l: 0, a: 0, b: 0, weight: 0 }));
    for (let i = 0; i < points.length; i++) {
      const point = points[i] as Oklab;
      const w = weights[i] as number;
      const bucket = sums[assignments[i] as number];
      if (!bucket) continue;
      bucket.l += point.l * w;
      bucket.a += (point.a ?? 0) * w;
      bucket.b += (point.b ?? 0) * w;
      bucket.weight += w;
    }
    centroids = sums.map((bucket, i) =>
      bucket.weight > 0
        ? ({
            mode: "oklab",
            l: bucket.l / bucket.weight,
            a: bucket.a / bucket.weight,
            b: bucket.b / bucket.weight,
          } as Oklab)
        : (centroids[i] as Oklab),
    );

    if (!changed) break;
  }

  const clusterWeights = new Array(centroids.length).fill(0);
  for (let i = 0; i < assignments.length; i++) {
    const index = assignments[i] as number;
    clusterWeights[index] =
      (clusterWeights[index] ?? 0) + (weights[i] as number);
  }

  const clusters: Cluster[] = centroids
    .map((centroid, i) => ({ centroid, weight: clusterWeights[i] ?? 0 }))
    .filter((c) => c.weight > 0);

  return mergeNearDuplicateClusters(clusters)
    .map(({ centroid, weight }) => {
      // Routed through OKLCH (not clamped directly in OKLab) because clampChroma reduces a
      // cylindrical chroma channel that OKLab doesn't have — oklch()'s h/c are derived from
      // OKLab's a/b, so this is just making that derived channel explicit before clamping it.
      const hex = formatHex(clampChroma(oklch(centroid), "oklch"));
      const share = totalWeight > 0 ? weight / totalWeight : 0;
      return { hex, share, prominence: visualProminence(share, centroid) };
    })
    .sort((a, b) => b.prominence - a.prominence)
    .map(({ hex, share }) => ({ hex, share }));
}
