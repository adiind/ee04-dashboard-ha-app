/**
 * Strict six-color Spectra palette, duplicated from `scripts/export-dashboard.mjs`
 * (`SPECTRA`) and `scripts/control-server.mjs` (`SPECTRA`). Kept here as plain
 * RGB tuples so the builder's "Spectra preview" toggle can quantize a canvas
 * snapshot client-side without importing a Node script into the browser bundle.
 *
 * If the source palette ever changes, update this list to match.
 */
export const SPECTRA_PALETTE: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: "white", rgb: [255, 255, 255] },
  { name: "black", rgb: [17, 17, 17] },
  { name: "red", rgb: [215, 25, 32] },
  { name: "yellow", rgb: [247, 198, 0] },
  { name: "green", rgb: [31, 157, 85] },
  { name: "blue", rgb: [18, 97, 166] }
];

/** Nearest-color match using the same weighted distance as the export script. */
export function nearestSpectraColor(r: number, g: number, b: number): [number, number, number] {
  let best = SPECTRA_PALETTE[0].rgb;
  let bestDistance = Infinity;
  for (const { rgb } of SPECTRA_PALETTE) {
    const [cr, cg, cb] = rgb;
    const distance = (r - cr) ** 2 * 0.3 + (g - cg) ** 2 * 0.59 + (b - cb) ** 2 * 0.11;
    if (distance < bestDistance) {
      best = rgb;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Quantize an `ImageData` in place to the strict Spectra six-color palette
 * using Floyd-Steinberg dithering, mirroring `quantizeSpectra` in
 * `scripts/control-server.mjs`.
 */
export function quantizeImageData(image: ImageData): void {
  const { width, height, data } = image;
  const buffer = new Float32Array(data.length);
  buffer.set(data);

  const diffuse = (x: number, y: number, er: number, eg: number, eb: number, factor: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const index = (y * width + x) * 4;
    buffer[index] += er * factor;
    buffer[index + 1] += eg * factor;
    buffer[index + 2] += eb * factor;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const oldR = Math.max(0, Math.min(255, buffer[index]));
      const oldG = Math.max(0, Math.min(255, buffer[index + 1]));
      const oldB = Math.max(0, Math.min(255, buffer[index + 2]));
      const [newR, newG, newB] = nearestSpectraColor(oldR, oldG, oldB);
      data[index] = newR;
      data[index + 1] = newG;
      data[index + 2] = newB;
      data[index + 3] = 255;

      const er = oldR - newR;
      const eg = oldG - newG;
      const eb = oldB - newB;
      diffuse(x + 1, y, er, eg, eb, 7 / 16);
      diffuse(x - 1, y + 1, er, eg, eb, 3 / 16);
      diffuse(x, y + 1, er, eg, eb, 5 / 16);
      diffuse(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }
}
