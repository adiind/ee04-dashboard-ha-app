import { useMemo, useState, type CSSProperties } from "react";
import type { WledGroupsDocument } from "./api";

type EdgeId = "top" | "right" | "bottom" | "left" | "all";
type CornerId = keyof WledGroupsDocument["table"]["corners"];

type EdgePath = {
  id: Exclude<EdgeId, "all">;
  name: string;
  leds: number[];
};

type NativeSegment = {
  start: number;
  stop: number;
  reverse?: boolean;
};

type NativeOption = {
  id: number;
  name: string;
};

type AnimationLabProps = {
  brightness: number;
  document: WledGroupsDocument;
  effects: string[];
  palettes: string[];
  onApply: (input: {
    segments: NativeSegment[];
    brightness: number;
    effect: number;
    palette: number;
    speed: number;
    intensity: number;
    colorA: string;
    colorB: string;
    accent: string;
  }) => Promise<boolean>;
  onRestore: () => Promise<void>;
};

const RECOMMENDED_EFFECTS = [
  "Loading",
  "Percent",
  "Aurora",
  "Pacifica",
  "Flow",
  "Flow Stripe",
  "Meteor Smooth",
  "Multi Comet",
  "Scanner Dual",
  "Ripple Rainbow",
  "Fireworks Starburst",
  "Twinklecat",
  "Pride 2015",
  "Colorwaves",
  "Plasma",
  "Polar Lights",
  "Akemi"
];

const FALLBACK_EFFECTS: NativeOption[] = [
  { id: 47, name: "Loading" },
  { id: 98, name: "Percent" },
  { id: 38, name: "Aurora" },
  { id: 101, name: "Pacifica" },
  { id: 110, name: "Flow" },
  { id: 179, name: "Flow Stripe" },
  { id: 77, name: "Meteor Smooth" },
  { id: 59, name: "Multi Comet" },
  { id: 60, name: "Scanner Dual" },
  { id: 99, name: "Ripple Rainbow" },
  { id: 89, name: "Fireworks Starburst" },
  { id: 81, name: "Twinklecat" },
  { id: 63, name: "Pride 2015" },
  { id: 67, name: "Colorwaves" },
  { id: 97, name: "Plasma" },
  { id: 174, name: "Polar Lights" },
  { id: 186, name: "Akemi" }
];

const RECOMMENDED_PALETTES = [
  "Default",
  "* Colors 1&2",
  "* Color Gradient",
  "Party",
  "Ocean",
  "Sunset",
  "Tiamat",
  "Aurora",
  "Candy",
  "Toxy Reaf",
  "Temperature",
  "Fire",
  "Icefire",
  "Yelblu Hot"
];

const FALLBACK_PALETTES: NativeOption[] = [
  { id: 0, name: "Default" },
  { id: 3, name: "* Colors 1&2" },
  { id: 4, name: "* Color Gradient" },
  { id: 6, name: "Party" },
  { id: 9, name: "Ocean" },
  { id: 13, name: "Sunset" },
  { id: 45, name: "Tiamat" },
  { id: 50, name: "Aurora" },
  { id: 57, name: "Candy" },
  { id: 58, name: "Toxy Reaf" },
  { id: 54, name: "Temperature" },
  { id: 35, name: "Fire" },
  { id: 36, name: "Icefire" },
  { id: 64, name: "Yelblu Hot" }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLed(value: number, ledCount: number) {
  const wrapped = value % ledCount;
  return wrapped < 0 ? wrapped + ledCount : wrapped;
}

function ledWalk(start: number, end: number, ledCount: number) {
  const safeStart = normalizeLed(start, ledCount);
  const safeEnd = normalizeLed(end, ledCount);
  const leds = [safeStart];
  let cursor = safeStart;
  while (cursor !== safeEnd && leds.length <= ledCount) {
    cursor = (cursor + 1) % ledCount;
    leds.push(cursor);
  }
  return leds;
}

function edgeBetween(from: CornerId, to: CornerId): EdgePath["id"] | undefined {
  const pair = `${from}:${to}`;
  if (pair === "topRight:topLeft" || pair === "topLeft:topRight") return "top";
  if (pair === "topLeft:bottomLeft" || pair === "bottomLeft:topLeft") return "left";
  if (pair === "bottomLeft:bottomRight" || pair === "bottomRight:bottomLeft") return "bottom";
  if (pair === "bottomRight:topRight" || pair === "topRight:bottomRight") return "right";
  return undefined;
}

function buildEdges(document: WledGroupsDocument): EdgePath[] {
  const ledCount = document.wled.ledCount;
  const sorted = (Object.entries(document.table.corners) as Array<[CornerId, number]>)
    .map(([corner, led]) => ({ corner, led: normalizeLed(led, ledCount) }))
    .sort((a, b) => a.led - b.led);
  const edgeMap: Partial<Record<EdgePath["id"], EdgePath>> = {};

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[(index + 1) % sorted.length];
    const edge = edgeBetween(current.corner, next.corner);
    if (!edge) continue;
    edgeMap[edge] = {
      id: edge,
      name: edge[0].toUpperCase() + edge.slice(1),
      leds: ledWalk(current.led, next.led, ledCount)
    };
  }

  return [
    edgeMap.top,
    edgeMap.right,
    edgeMap.bottom,
    edgeMap.left
  ].filter((edge): edge is EdgePath => Boolean(edge));
}

function formatLed(value: number, ledCount: number) {
  return value === 0 ? `0/${ledCount}` : String(value);
}

function edgeLabel(edge: EdgePath, ledCount: number) {
  const first = edge.leds[0] ?? 0;
  const last = edge.leds.at(-1) ?? first;
  return `${formatLed(first, ledCount)} -> ${formatLed(last, ledCount)}`;
}

function nativeSegmentsForEdge(edge: EdgePath, reverse: boolean): NativeSegment[] {
  const segments: NativeSegment[] = [];
  let start: number | undefined;
  let previous: number | undefined;

  function closeRun() {
    if (start === undefined || previous === undefined) return;
    segments.push({ start, stop: previous + 1, reverse });
    start = undefined;
    previous = undefined;
  }

  for (const led of edge.leds) {
    if (start === undefined) {
      start = led;
      previous = led;
      continue;
    }
    if (previous !== undefined && led === previous + 1) {
      previous = led;
      continue;
    }
    closeRun();
    start = led;
    previous = led;
  }

  closeRun();
  return segments;
}

function optionsFromLiveList(live: string[], recommended: string[], fallback: NativeOption[]) {
  if (!live.length) return fallback;
  const byName = new Map(live.map((name, index) => [name.toLowerCase(), { id: index, name }]));
  const options = recommended
    .map((name) => byName.get(name.toLowerCase()))
    .filter((option): option is NativeOption => Boolean(option))
    .filter((option) => option.name !== "RSVD" && option.name !== "-");
  return options.length > 0 ? options : fallback;
}

export function AnimationLab({
  brightness,
  document,
  effects,
  palettes,
  onApply,
  onRestore
}: AnimationLabProps) {
  const edges = useMemo(() => buildEdges(document), [document]);
  const effectOptions = useMemo(
    () => optionsFromLiveList(effects, RECOMMENDED_EFFECTS, FALLBACK_EFFECTS),
    [effects]
  );
  const paletteOptions = useMemo(
    () => optionsFromLiveList(palettes, RECOMMENDED_PALETTES, FALLBACK_PALETTES),
    [palettes]
  );
  const [selectedEdge, setSelectedEdge] = useState<EdgeId>("bottom");
  const [effectId, setEffectId] = useState(effectOptions[0]?.id ?? 47);
  const [paletteId, setPaletteId] = useState(paletteOptions[0]?.id ?? 0);
  const [colorA, setColorA] = useState("#00e5ff");
  const [colorB, setColorB] = useState("#8b5cf6");
  const [accent, setAccent] = useState("#ffffff");
  const [speed, setSpeed] = useState(150);
  const [intensity, setIntensity] = useState(160);
  const [reverse, setReverse] = useState(false);
  const [applied, setApplied] = useState(false);
  const [stripStatus, setStripStatus] = useState("Ready");

  const selectedEdges = selectedEdge === "all"
    ? edges
    : edges.filter((edge) => edge.id === selectedEdge);
  const previewEdge = selectedEdges[0] ?? edges[0];
  const nativeSegments = selectedEdges.flatMap((edge) => nativeSegmentsForEdge(edge, reverse));
  const stripColumns = `repeat(${Math.max(1, previewEdge?.leds.length ?? 1)}, minmax(8px, 1fr))`;

  async function applyEffect() {
    setStripStatus("Applying...");
    const ok = await onApply({
      segments: nativeSegments,
      brightness,
      effect: effectId,
      palette: paletteId,
      speed,
      intensity,
      colorA,
      colorB,
      accent
    });
    setApplied(ok);
    setStripStatus(ok ? "Native effect running" : "WLED send failed");
  }

  async function restoreStart() {
    setStripStatus("Restoring...");
    await onRestore();
    setApplied(false);
    setStripStatus("Ready");
  }

  return (
    <section className="simple-lab">
      <div className="simple-lab-header">
        <div>
          <h2>Native WLED Effect Tester</h2>
          <p>{selectedEdge === "all" ? "All edges" : `${previewEdge?.name ?? "Edge"} edge`} · {stripStatus}</p>
        </div>
        <div className="run-actions">
          <button type="button" className="primary" onClick={applyEffect}>
            Apply to Strip
          </button>
          {applied ? (
            <button type="button" className="danger" onClick={restoreStart}>
              Restore Start
            </button>
          ) : null}
        </div>
      </div>

      <div className="simple-controls">
        <label>
          <span>Edge</span>
          <select value={selectedEdge} onChange={(event) => setSelectedEdge(event.target.value as EdgeId)}>
            {edges.map((edge) => (
              <option value={edge.id} key={edge.id}>{edge.name} ({edgeLabel(edge, document.wled.ledCount)})</option>
            ))}
            <option value="all">All Edges</option>
          </select>
        </label>
        <label>
          <span>Effect</span>
          <select value={effectId} onChange={(event) => setEffectId(Number(event.target.value))}>
            {effectOptions.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Palette</span>
          <select value={paletteId} onChange={(event) => setPaletteId(Number(event.target.value))}>
            {paletteOptions.map((item) => (
              <option value={item.id} key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Color A</span>
          <input type="color" value={colorA} onChange={(event) => setColorA(event.target.value)} />
        </label>
        <label>
          <span>Color B</span>
          <input type="color" value={colorB} onChange={(event) => setColorB(event.target.value)} />
        </label>
        <label>
          <span>Accent</span>
          <input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} />
        </label>
        <label>
          <span>Speed</span>
          <input
            type="range"
            min="0"
            max="255"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
          <b>{speed}</b>
        </label>
        <label>
          <span>Intensity</span>
          <input
            type="range"
            min="0"
            max="255"
            value={intensity}
            onChange={(event) => setIntensity(Number(event.target.value))}
          />
          <b>{intensity}</b>
        </label>
        <label className="checkbox-control">
          <span>Reverse</span>
          <input type="checkbox" checked={reverse} onChange={(event) => setReverse(event.target.checked)} />
        </label>
      </div>

      <div className="effect-note">
        Segments: {nativeSegments.map((segment) => `${segment.start}-${segment.stop - 1}`).join(", ")}
      </div>

      <div className="simple-strip" aria-label="Selected edge preview" style={{ gridTemplateColumns: stripColumns }}>
        <span className="strip-end start">{previewEdge ? formatLed(previewEdge.leds[0], document.wled.ledCount) : "?"}</span>
        {previewEdge?.leds.map((led, index) => (
          <span
            className="simple-led"
            key={`${previewEdge.id}-${led}`}
            style={{
              "--simple-led-color": index % 3 === 0 ? colorA : index % 3 === 1 ? colorB : accent
            } as CSSProperties}
            title={`LED ${led}`}
          />
        ))}
        <span className="strip-end end">{previewEdge ? formatLed(previewEdge.leds.at(-1) ?? 0, document.wled.ledCount) : "?"}</span>
      </div>
    </section>
  );
}
