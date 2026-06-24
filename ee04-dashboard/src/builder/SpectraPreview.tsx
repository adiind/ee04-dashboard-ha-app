import { useEffect, useRef } from "react";
import { quantizeImageData } from "./spectraPalette";

const WIDTH = 800;
const HEIGHT = 480;

/**
 * "Spectra preview" overlay. Snapshots the live 800x480 preview DOM by
 * serializing it into an SVG `<foreignObject>` data URL, draws that into a
 * canvas, and quantizes the pixels to the strict six-color Spectra palette
 * with the same Floyd-Steinberg dithering as
 * `scripts/control-server.mjs`/`scripts/export-dashboard.mjs`.
 *
 * This is a pure-browser-API approximation of `html2canvas` (no new
 * dependencies). It works well for this dashboard because the markup uses
 * only inline SVG icons (lucide-react) and system fonts — no external
 * stylesheets, web fonts, or background images to inline. If the
 * foreignObject canvas snapshot fails for any reason (e.g. the canvas is
 * marked tainted by the browser), this falls back to a CSS-filter
 * approximation on the live DOM (`.spectra-fallback` in builder.css), which
 * is honestly *not* a true per-pixel six-color quantization.
 */
export function SpectraPreview({
  source,
  version,
  onFallback
}: {
  source: HTMLElement | null;
  version: number;
  onFallback: (reason: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const collectStyles = () => {
        let css = "";
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules)) {
              css += `${rule.cssText}\n`;
            }
          } catch {
            // Cross-origin stylesheet; skip (none expected for this app).
          }
        }
        return css;
      };

      const clone = source.cloneNode(true) as HTMLElement;
      clone.style.transform = "none";
      const style = document.createElement("style");
      style.textContent = collectStyles();
      clone.insertBefore(style, clone.firstChild);

      const serialized = new XMLSerializer().serializeToString(clone);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
        <foreignObject width="100%" height="100%">${serialized}</foreignObject>
      </svg>`;

      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.width = WIDTH;
      img.height = HEIGHT;
      img.onload = () => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          onFallback("2D canvas context unavailable");
          URL.revokeObjectURL(url);
          return;
        }
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);
        try {
          const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
          quantizeImageData(imageData);
          ctx.putImageData(imageData, 0, 0);
        } catch (err) {
          // Some browsers (notably Chromium) treat a canvas drawn from an
          // SVG `<foreignObject>` image as tainted regardless of origin, so
          // `getImageData` throws a SecurityError here even though
          // everything is same-origin. Fall back to the CSS-filter
          // approximation in that case.
          onFallback(String((err as Error)?.message ?? err));
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        if (cancelled) return;
        onFallback("foreignObject snapshot failed to load");
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (err) {
      onFallback(String((err as Error)?.message ?? err));
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version]);

  return <canvas ref={canvasRef} aria-label="Spectra six-color preview" />;
}
