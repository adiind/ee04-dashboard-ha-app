import { formatDate, formatTime } from "../lib/format";

export function CalibrationScreen({ generatedAt }: { generatedAt: string }) {
  const swatches = [
    ["White", "#ffffff"],
    ["Black", "#111111"],
    ["Red", "#d71920"],
    ["Yellow", "#f7c600"],
    ["Green", "#1f9d55"],
    ["Blue", "#1261a6"]
  ];

  return (
    <main className="epaper-screen calibration-screen">
      <header>
        <h1>Spectra 6 Calibration</h1>
        <span>{formatDate(generatedAt)} · {formatTime(generatedAt)}</span>
      </header>
      <div className="swatch-grid">
        {swatches.map(([name, color]) => (
          <div className="swatch-card" key={name}>
            <div className="swatch" style={{ backgroundColor: color }} />
            <strong>{name}</strong>
            <span>{color}</span>
          </div>
        ))}
      </div>
      <footer>
        If red and blue are swapped on-panel, use the generated <strong>dashboard-spectra-rb-swap.png</strong> URL.
      </footer>
    </main>
  );
}
