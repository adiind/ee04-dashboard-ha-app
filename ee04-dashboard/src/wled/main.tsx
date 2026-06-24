import { StrictMode, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { Check, CirclePlus, Eye, Lightbulb, RotateCcw, Save, Trash2 } from "lucide-react";
import { applyWledItems, fetchWledContext, restoreWledState, saveWledGroups, type WledGroup, type WledGroupsDocument, type WledRange } from "./api";
import "./wled.css";

const COLORS = ["#00e5ff", "#ff9f1c", "#6ee7b7", "#ff4d6d", "#f5e642", "#8b5cf6", "#ffffff"];

function uid() {
  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLedRange(range: WledRange, ledCount: number): WledRange {
  const start = clamp(Math.trunc(range.start), 0, ledCount - 1);
  const end = clamp(Math.trunc(range.end), 0, ledCount - 1);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function normalizeGroup(group: WledGroup, ledCount: number): WledGroup {
  const ranges = (group.ranges?.length ? group.ranges : [{ start: group.start ?? 0, end: group.end ?? 0 }])
    .map((range) => normalizeLedRange(range, ledCount));
  const firstRange = ranges[0] ?? { start: 0, end: 0 };
  return { ...group, start: firstRange.start, end: firstRange.end, ranges };
}

function nextGroupName(groups: WledGroup[]) {
  const letter = String.fromCharCode(65 + (groups.length % 26));
  return `Group ${letter}`;
}

function makeGroup(groups: WledGroup[], ledCount: number, start = 0, end = Math.min(ledCount - 1, 9)): WledGroup {
  return {
    id: uid(),
    name: nextGroupName(groups),
    start,
    end,
    ranges: [{ start, end }],
    color: COLORS[groups.length % COLORS.length],
    enabled: true
  };
}

function rangeLabel(group: WledGroup) {
  return group.ranges
    .map((range) => range.start === range.end ? `${range.start}` : `${range.start}-${range.end}`)
    .join(", ");
}

function groupToItems(group: WledGroup) {
  return group.ranges.map((range) => ({ start: range.start, end: range.end, color: group.color }));
}

function edgeLabel(from: number, to: number, lastLed: number) {
  if (from <= to) return `${from}-${to}`;
  return `${from}-${lastLed}, 0-${to}`;
}

function tableDefaults(ledCount: number) {
  const lastLed = Math.max(0, ledCount - 1);
  return {
    corners: {
      topLeft: 0,
      topRight: Math.round(lastLed * 0.25),
      bottomRight: Math.round(lastLed * 0.5),
      bottomLeft: Math.round(lastLed * 0.75)
    }
  };
}

function normalizeDocument(document: WledGroupsDocument): WledGroupsDocument {
  const ledCount = document.wled.ledCount;
  const defaults = tableDefaults(ledCount);
  const corners = document.table?.corners ?? defaults.corners;
  return {
    ...document,
    table: {
      corners: {
        topLeft: clamp(Math.trunc(corners.topLeft ?? defaults.corners.topLeft), 0, ledCount - 1),
        topRight: clamp(Math.trunc(corners.topRight ?? defaults.corners.topRight), 0, ledCount - 1),
        bottomRight: clamp(Math.trunc(corners.bottomRight ?? defaults.corners.bottomRight), 0, ledCount - 1),
        bottomLeft: clamp(Math.trunc(corners.bottomLeft ?? defaults.corners.bottomLeft), 0, ledCount - 1)
      }
    },
    groups: document.groups.map((group) => normalizeGroup(group, ledCount))
  };
}

function WledMapper() {
  const [document, setDocument] = useState<WledGroupsDocument | undefined>();
  const [baselineState, setBaselineState] = useState<Record<string, unknown> | undefined>();
  const [activeId, setActiveId] = useState<string | undefined>();
  const [activeRangeIndex, setActiveRangeIndex] = useState(0);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [brightness, setBrightness] = useState(128);
  const [live, setLive] = useState(true);
  const [dragStart, setDragStart] = useState<number | undefined>();
  const [status, setStatus] = useState("Loading WLED...");
  const liveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetchWledContext().then((result) => {
      if (!result.ok) {
        setStatus(result.error);
        return;
      }

      setDocument(normalizeDocument(result.groups));
      setBaselineState(result.state);
      const first = result.groups.groups[0];
      if (first) {
        setActiveId(first.id);
        setCheckedIds(new Set([first.id]));
      }
      setStatus(result.info?.error ? result.info.error : "Connected");
    });
  }, []);

  const ledCount = document?.wled.ledCount ?? 0;
  const groups = document?.groups ?? [];
  const activeGroup = groups.find((group) => group.id === activeId);
  const activeRange = activeGroup?.ranges[activeRangeIndex] ?? activeGroup?.ranges[0];
  const checkedGroups = groups.filter((group) => checkedIds.has(group.id));
  const lastLed = Math.max(0, ledCount - 1);
  const tableCorners = document?.table.corners ?? tableDefaults(ledCount).corners;
  const tableEdges = {
    top: edgeLabel(tableCorners.topLeft, tableCorners.topRight, lastLed),
    right: edgeLabel(tableCorners.topRight, tableCorners.bottomRight, lastLed),
    bottom: edgeLabel(tableCorners.bottomRight, tableCorners.bottomLeft, lastLed),
    left: edgeLabel(tableCorners.bottomLeft, tableCorners.topLeft, lastLed)
  };

  const cellColors = useMemo(() => {
    return Array.from({ length: ledCount }, (_, index) => {
      const owners = groups.filter((group) =>
        group.enabled && group.ranges.some((range) => index >= range.start && index <= range.end)
      );
      return owners.at(-1)?.color;
    });
  }, [groups, ledCount]);

  function updateDocument(nextGroups: WledGroup[]) {
    if (!document) return;
    setDocument({
      ...document,
      updatedAt: new Date().toISOString(),
      groups: nextGroups.map((group) => normalizeGroup(group, document.wled.ledCount))
    });
  }

  function updateTableCorner(corner: keyof WledGroupsDocument["table"]["corners"], value: number) {
    if (!document) return;
    const nextValue = clamp(Math.trunc(value), 0, document.wled.ledCount - 1);
    setDocument({
      ...document,
      updatedAt: new Date().toISOString(),
      table: {
        corners: {
          ...document.table.corners,
          [corner]: nextValue
        }
      }
    });
  }

  function queueLiveApply(items: WledGroup[], nextBrightness = brightness) {
    if (!live || !items.length) return;
    window.clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => {
      setStatus("Coloring...");
      applyWledItems(items.flatMap(groupToItems), nextBrightness).then((result) => {
        setStatus(result.ok ? "Color sent" : result.error);
      });
    }, 180);
  }

  function updateGroup(id: string, patch: Partial<WledGroup>, liveApply = true) {
    const nextGroups = groups.map((group) => group.id === id ? normalizeGroup({ ...group, ...patch }, ledCount) : group);
    updateDocument(nextGroups);
    const changed = nextGroups.find((group) => group.id === id);
    if (liveApply && changed && id === activeId) queueLiveApply([changed]);
  }

  function addGroup() {
    if (!document) return;
    const group = makeGroup(
      groups,
      document.wled.ledCount,
      activeRange?.start ?? 0,
      activeRange?.end ?? Math.min(9, document.wled.ledCount - 1)
    );
    updateDocument([...groups, group]);
    setActiveId(group.id);
    setActiveRangeIndex(0);
    setCheckedIds(new Set([...checkedIds, group.id]));
  }

  function removeGroup(id: string) {
    const next = groups.filter((group) => group.id !== id);
    updateDocument(next);
    setCheckedIds(new Set([...checkedIds].filter((checkedId) => checkedId !== id)));
    if (activeId === id) setActiveId(next[0]?.id);
    if (activeId === id) setActiveRangeIndex(0);
  }

  function setActiveRange(start: number, end: number) {
    if (!activeGroup) return;
    const nextRanges = activeGroup.ranges.map((range, index) =>
      index === activeRangeIndex ? { start, end } : range
    );
    updateGroup(activeGroup.id, { ranges: nextRanges });
  }

  function updateRange(index: number, patch: Partial<WledRange>) {
    if (!activeGroup) return;
    const nextRanges = activeGroup.ranges.map((range, rangeIndex) =>
      rangeIndex === index ? { ...range, ...patch } : range
    );
    updateGroup(activeGroup.id, { ranges: nextRanges });
  }

  function addRange() {
    if (!activeGroup) return;
    const seed = activeRange ?? activeGroup.ranges.at(-1) ?? { start: 0, end: Math.min(9, ledCount - 1) };
    const start = clamp(seed.end + 1, 0, ledCount - 1);
    const end = clamp(start + Math.max(0, seed.end - seed.start), 0, ledCount - 1);
    const nextRanges = [...activeGroup.ranges, { start, end }];
    setActiveRangeIndex(nextRanges.length - 1);
    updateGroup(activeGroup.id, { ranges: nextRanges });
  }

  function removeRange(index: number) {
    if (!activeGroup || activeGroup.ranges.length <= 1) return;
    const nextRanges = activeGroup.ranges.filter((_, rangeIndex) => rangeIndex !== index);
    setActiveRangeIndex(Math.max(0, Math.min(activeRangeIndex, nextRanges.length - 1)));
    updateGroup(activeGroup.id, { ranges: nextRanges });
  }

  function applyItems(items: WledGroup[]) {
    if (!items.length) {
      setStatus("Select a group first");
      return;
    }

    setStatus("Coloring...");
    applyWledItems(items.flatMap(groupToItems), brightness).then((result) => {
      setStatus(result.ok ? "Color sent" : result.error);
    });
  }

  useEffect(() => () => window.clearTimeout(liveTimer.current), []);

  function saveGroups() {
    if (!document) return;
    setStatus("Saving...");
    saveWledGroups(document).then((result) => {
      if (result.ok) {
        setDocument(result.groups);
        setStatus("Saved");
      } else {
        setStatus(result.error);
      }
    });
  }

  function restoreStart() {
    if (!baselineState) {
      setStatus("No startup state captured");
      return;
    }
    setStatus("Restoring...");
    restoreWledState(baselineState).then((result) => {
      setStatus(result.ok ? "Restored" : result.error);
    });
  }

  function pointerDown(index: number) {
    setDragStart(index);
    setActiveRange(index, index);
  }

  function pointerEnter(index: number) {
    if (dragStart === undefined) return;
    setActiveRange(Math.min(dragStart, index), Math.max(dragStart, index));
  }

  function pointerUp() {
    setDragStart(undefined);
  }

  if (!document) {
    return (
      <main className="wled-app">
        <section className="empty-state">
          <Lightbulb size={24} />
          <p>{status}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="wled-app" onPointerUp={pointerUp} onPointerLeave={pointerUp}>
      <header className="wled-topbar">
        <div>
          <h1>WLED LED Mapper</h1>
          <p>{document.wled.name} · {document.wled.ip} · {document.wled.ledCount} LEDs</p>
        </div>
        <div className="top-actions">
          <label className="brightness">
            <span>Brightness</span>
            <input
              type="range"
              min="1"
              max="255"
              value={brightness}
              onChange={(event) => {
                const nextBrightness = Number(event.target.value);
                setBrightness(nextBrightness);
                if (activeGroup) queueLiveApply([activeGroup], nextBrightness);
              }}
            />
            <b>{brightness}</b>
          </label>
          <label className="live-toggle">
            <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} />
            <span>Live</span>
          </label>
          <button type="button" onClick={restoreStart} title="Restore startup state">
            <RotateCcw size={17} />
            Restore
          </button>
          <button type="button" className="primary" onClick={saveGroups} title="Save groups">
            <Save size={17} />
            Save
          </button>
        </div>
      </header>

      <section className="workbench">
        <div className="range-panel">
          <div className="panel-title">
            <strong>Active Group</strong>
            <span>{activeGroup ? `${activeGroup.name} · ${rangeLabel(activeGroup)}` : "No group"}</span>
          </div>

          {activeGroup ? (
            <>
              <input
                className="group-name-input"
                value={activeGroup.name}
                onChange={(event) => updateGroup(activeGroup.id, { name: event.target.value }, false)}
              />
              <div className="ranges-header">
                <strong>Ranges</strong>
                <button type="button" onClick={addRange}>
                  <CirclePlus size={15} />
                  Add Range
                </button>
              </div>
              <div className="range-list">
                {activeGroup.ranges.map((range, index) => (
                  <div className={`range-row${index === activeRangeIndex ? " selected" : ""}`} key={index}>
                    <button
                      type="button"
                      className="range-select"
                      onClick={() => setActiveRangeIndex(index)}
                      title={`Edit range ${index + 1}`}
                    >
                      {index + 1}
                    </button>
                    <label>
                      <span>Start</span>
                      <input
                        type="number"
                        min="0"
                        max={ledCount - 1}
                        value={range.start}
                        onFocus={() => setActiveRangeIndex(index)}
                        onChange={(event) => updateRange(index, { start: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span>End</span>
                      <input
                        type="number"
                        min="0"
                        max={ledCount - 1}
                        value={range.end}
                        onFocus={() => setActiveRangeIndex(index)}
                        onChange={(event) => updateRange(index, { end: Number(event.target.value) })}
                      />
                    </label>
                    <button
                      type="button"
                      className="range-delete"
                      onClick={() => removeRange(index)}
                      disabled={activeGroup.ranges.length <= 1}
                      title="Remove range"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="color-row">
                <label>
                  <span>Color</span>
                  <input
                    type="color"
                    value={activeGroup.color}
                    onChange={(event) => updateGroup(activeGroup.id, { color: event.target.value })}
                  />
                </label>
              </div>
              <div className="swatches">
                {COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    className={activeGroup.color === color ? "selected" : ""}
                    style={{ "--swatch": color } as CSSProperties}
                    title={color}
                    onClick={() => updateGroup(activeGroup.id, { color })}
                  />
                ))}
              </div>
              <button type="button" className="primary wide" onClick={() => applyItems([activeGroup])}>
                <Lightbulb size={17} />
                Color Active Group
              </button>
            </>
          ) : (
            <button type="button" className="primary wide" onClick={addGroup}>
              <CirclePlus size={17} />
              Add Group
            </button>
          )}
        </div>

        <div className="strip-panel">
          <div className="panel-title">
            <strong>LED Numbers</strong>
            <span>{status}</span>
          </div>
          <div className="led-strip">
            {Array.from({ length: ledCount }, (_, index) => {
              const inActive = Boolean(activeRange && index >= activeRange.start && index <= activeRange.end);
              return (
                <button
                  type="button"
                  key={index}
                  className={`led-cell${inActive ? " active" : ""}${index % 10 === 0 ? " tick" : ""}`}
                  style={{ "--cell-color": cellColors[index] || "#22252b" } as CSSProperties}
                  title={`LED ${index}`}
                  onPointerDown={() => pointerDown(index)}
                  onPointerEnter={() => pointerEnter(index)}
                >
                  {index}
                </button>
              );
            })}
          </div>
        </div>

        <div className="groups-panel">
          <div className="panel-title">
            <strong>Groups</strong>
            <button type="button" onClick={addGroup}>
              <CirclePlus size={16} />
              Add
            </button>
          </div>
          <div className="group-list">
            {groups.map((group) => (
              <div className={`group-row${group.id === activeId ? " current" : ""}`} key={group.id}>
                <button
                  type="button"
                  className={`check-button${checkedIds.has(group.id) ? " checked" : ""}`}
                  onClick={() => {
                    const next = new Set(checkedIds);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    setCheckedIds(next);
                  }}
                  title="Toggle selected group"
                >
                  {checkedIds.has(group.id) ? <Check size={14} /> : null}
                </button>
                <button
                  type="button"
                  className="group-main"
                  onClick={() => {
                    setActiveId(group.id);
                    setActiveRangeIndex(0);
                  }}
                >
                  <span className="group-color" style={{ "--group-color": group.color } as CSSProperties} />
                  <span>
                    <b>{group.name || "Unnamed"}</b>
                    <small>{rangeLabel(group)}</small>
                  </span>
                </button>
                <button type="button" onClick={() => applyItems([group])} title="Color this group">
                  <Eye size={15} />
                </button>
                <button type="button" onClick={() => removeGroup(group.id)} title="Delete group">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="primary wide" onClick={() => applyItems(checkedGroups)}>
            <Eye size={17} />
            Show Selected Groups
          </button>
        </div>

        <div className="table-panel">
          <div className="panel-title">
            <strong>Table Simulator</strong>
            <span>Last LED {lastLed} returns to Top Left</span>
          </div>
          <div className="table-layout">
            <div className="corner-input top-left">
              <label>
                <span>Top Left</span>
                <input
                  type="number"
                  min="0"
                  max={lastLed}
                  value={tableCorners.topLeft}
                  onChange={(event) => updateTableCorner("topLeft", Number(event.target.value))}
                />
              </label>
            </div>
            <div className="corner-input top-right">
              <label>
                <span>Top Right</span>
                <input
                  type="number"
                  min="0"
                  max={lastLed}
                  value={tableCorners.topRight}
                  onChange={(event) => updateTableCorner("topRight", Number(event.target.value))}
                />
              </label>
            </div>
            <div className="corner-input bottom-right">
              <label>
                <span>Bottom Right</span>
                <input
                  type="number"
                  min="0"
                  max={lastLed}
                  value={tableCorners.bottomRight}
                  onChange={(event) => updateTableCorner("bottomRight", Number(event.target.value))}
                />
              </label>
            </div>
            <div className="corner-input bottom-left">
              <label>
                <span>Bottom Left</span>
                <input
                  type="number"
                  min="0"
                  max={lastLed}
                  value={tableCorners.bottomLeft}
                  onChange={(event) => updateTableCorner("bottomLeft", Number(event.target.value))}
                />
              </label>
            </div>
            <div className="table-board">
              <span className="edge-label edge-top">{tableEdges.top}</span>
              <span className="edge-label edge-right">{tableEdges.right}</span>
              <span className="edge-label edge-bottom">{tableEdges.bottom}</span>
              <span className="edge-label edge-left">{tableEdges.left}</span>
              <span className="corner-dot dot-top-left">{tableCorners.topLeft}</span>
              <span className="corner-dot dot-top-right">{tableCorners.topRight}</span>
              <span className="corner-dot dot-bottom-right">{tableCorners.bottomRight}</span>
              <span className="corner-dot dot-bottom-left">{tableCorners.bottomLeft}</span>
              <span className="return-label">{lastLed} {"->"} {tableCorners.topLeft}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const rootElement = document.getElementById("wled-root")! as HTMLElement & {
  __wledRoot?: ReturnType<typeof createRoot>;
};
rootElement.__wledRoot ??= createRoot(rootElement);
rootElement.__wledRoot.render(
  <StrictMode>
    <WledMapper />
  </StrictMode>
);
