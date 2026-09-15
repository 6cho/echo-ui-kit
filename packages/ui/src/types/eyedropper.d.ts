// The EyeDropper API isn't in TypeScript's bundled lib.dom.d.ts yet, despite being supported in
// every Chromium browser since Chrome 95 — this is the ambient declaration for it, narrowed to
// just what PaletteGenerator actually calls.
interface EyeDropperOpenResult {
  sRGBHex: string;
}

interface EyeDropper {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperOpenResult>;
}

declare const EyeDropper: {
  prototype: EyeDropper;
  new (): EyeDropper;
};
