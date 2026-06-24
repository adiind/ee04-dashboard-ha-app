import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimationLab } from "./AnimationLab";
import {
  applyWledNativeEffect,
  fetchWledContext,
  restoreWledState,
  type WledGroupsDocument
} from "./api";
import "./effects.css";

function WledEffects() {
  const [document, setDocument] = useState<WledGroupsDocument | undefined>();
  const [baselineState, setBaselineState] = useState<Record<string, unknown> | undefined>();
  const [effects, setEffects] = useState<string[]>([]);
  const [palettes, setPalettes] = useState<string[]>([]);
  const [brightness, setBrightness] = useState(160);
  const [status, setStatus] = useState("Loading mapper...");

  useEffect(() => {
    fetchWledContext().then((result) => {
      if (!result.ok) {
        setStatus(result.error);
        return;
      }
      setDocument(result.groups);
      if (result.state && !("error" in result.state)) {
        setBaselineState(result.state);
      }
      setEffects(Array.isArray(result.effects) ? result.effects : []);
      setPalettes(Array.isArray(result.palettes) ? result.palettes : []);
      setStatus(result.info?.error ? result.info.error : "Ready");
    });
  }, []);

  const applyNativeEffect = useCallback(async (input: {
    segments: Array<{ start: number; stop: number; reverse?: boolean }>;
    brightness: number;
    effect: number;
    palette: number;
    speed: number;
    intensity: number;
    colorA: string;
    colorB: string;
    accent: string;
  }) => {
    const result = await applyWledNativeEffect(input);
    setStatus(result.ok ? "Applied native WLED effect" : result.error);
    return result.ok;
  }, []);

  const restoreStart = useCallback(async () => {
    if (!baselineState) {
      setStatus("No startup state captured");
      return;
    }
    const result = await restoreWledState(baselineState);
    setStatus(result.ok ? "Restored" : result.error);
  }, [baselineState]);

  return (
    <main className="effects-app">
      <header className="effects-header">
        <div>
          <h1>LED Animation Tester</h1>
          <p>{document ? `Using saved table map · ${document.wled.name} · ${status}` : status}</p>
        </div>
        <label className="brightness-control">
          <span>Brightness</span>
          <input
            type="range"
            min="1"
            max="255"
            value={brightness}
            onChange={(event) => setBrightness(Number(event.target.value))}
          />
          <b>{brightness}</b>
        </label>
      </header>

      {document ? (
        <AnimationLab
          brightness={brightness}
          document={document}
          effects={effects}
          palettes={palettes}
          onApply={applyNativeEffect}
          onRestore={restoreStart}
        />
      ) : (
        <section className="simple-lab">
          <div className="effect-note">{status}</div>
        </section>
      )}
    </main>
  );
}

const rootElement = document.getElementById("wled-effects-root")! as HTMLElement & {
  __wledEffectsRoot?: ReturnType<typeof createRoot>;
};
rootElement.__wledEffectsRoot ??= createRoot(rootElement);
rootElement.__wledEffectsRoot.render(
  <StrictMode>
    <WledEffects />
  </StrictMode>
);
