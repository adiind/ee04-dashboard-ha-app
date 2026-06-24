import { useEffect, useState } from "react";
import { validateLayout } from "../layout/validate.mjs";
import type { LayoutDocument } from "../layout/types";
import { fetchEntityCatalog, fetchLayout, putLayout, refreshBoard, refreshBoardUrl } from "./api";
import { PageList } from "./PageList";
import { PreviewPane } from "./PreviewPane";
import { Inspector } from "./Inspector";
import { Confirm } from "./Confirm";
import type { EntityCatalog } from "../lib/useEntityCatalog";

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; saved: LayoutDocument };

type SaveStatus = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; error: string };

export function Builder() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = useState<LayoutDocument | null>(null);
  const [catalog, setCatalog] = useState<EntityCatalog | undefined>(undefined);
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLayout().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setLoad({ status: "ready", saved: result.layout });
        setDraft(result.layout);
      } else {
        setLoad({ status: "error", error: result.error });
      }
    });
    fetchEntityCatalog().then((c) => {
      if (!cancelled) setCatalog(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saved = load.status === "ready" ? load.saved : null;
  const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));

  // Manual save only — warn before navigating away with unsaved changes.
  useEffect(() => {
    function handler(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (load.status === "loading" || !draft) {
    return (
      <div className="builder">
        <div className="builder-bar">
          <div className="builder-title">
            Layout Builder
            <small>Loading /builder/layout...</small>
          </div>
        </div>
      </div>
    );
  }

  if (load.status === "error") {
    return (
      <div className="builder">
        <div className="builder-bar">
          <div className="builder-title">
            Layout Builder
            <small>Failed to load layout</small>
          </div>
        </div>
        <div className="pane">
          <div className="errors-box">
            Could not load <code>/builder/layout</code>: {load.error}
            <br />
            Make sure the control server (port 5174) is running and the dev/preview proxy is configured.
          </div>
        </div>
      </div>
    );
  }

  const page = draft.pages[selectedPageIndex];
  const widget = page?.widgets.find((w) => w.id === selectedWidgetId);

  function applyChange(next: LayoutDocument) {
    setDraft(next);
    setSaveStatus({ kind: "idle" });
  }

  function handleRemoveWidget(widgetId: string) {
    if (!draft || !page) return;
    const pages = draft.pages.map((p) =>
      p.id === page.id ? { ...p, widgets: p.widgets.filter((w) => w.id !== widgetId) } : p
    );
    applyChange({ ...draft, pages });
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null);
  }

  async function handleSave() {
    if (!draft) return;
    const result = validateLayout(draft);
    if (!result.ok || !result.layout) {
      setValidationErrors(result.errors);
      setSaveStatus({ kind: "error", error: "Fix validation errors before saving." });
      return;
    }
    setValidationErrors([]);
    setSaveStatus({ kind: "saving" });
    const putResult = await putLayout(result.layout);
    if (putResult.ok) {
      setLoad({ status: "ready", saved: result.layout });
      setSaveStatus({ kind: "saved" });
    } else {
      setSaveStatus({ kind: "error", error: putResult.error });
    }
  }

  async function performDiscard() {
    setConfirmDiscard(false);
    setSaveStatus({ kind: "idle" });
    setValidationErrors([]);
    const result = await fetchLayout();
    if (result.ok) {
      setLoad({ status: "ready", saved: result.layout });
      setDraft(result.layout);
      setSelectedWidgetId(null);
      if (selectedPageIndex >= result.layout.pages.length) {
        setSelectedPageIndex(Math.max(0, result.layout.pages.length - 1));
      }
    } else {
      setSaveStatus({ kind: "error", error: result.error });
    }
  }

  function handleDiscard() {
    if (dirty) {
      setConfirmDiscard(true);
    } else {
      void performDiscard();
    }
  }

  function handleExportPreview() {
    window.open("/eink/dashboard-spectra.png", "_blank", "noopener");
  }

  async function performRefresh() {
    setConfirmRefresh(false);
    const result = await refreshBoard();
    if (!result.ok) {
      setSaveStatus({ kind: "error", error: `Refresh failed: ${result.error}` });
    }
  }

  return (
    <div className="builder">
      <div className="builder-bar">
        <div className="builder-title">
          Layout Builder
          <small>
            public/data/layout.json{dirty && <span className="dirty-dot" title="Unsaved changes" />}
          </small>
        </div>
        <span className="save-status" aria-live="polite">
          {saveStatus.kind === "saving" && "Saving..."}
          {saveStatus.kind === "saved" && <span className="ok">Saved</span>}
          {saveStatus.kind === "error" && <span className="error">{saveStatus.error}</span>}
          {saveStatus.kind === "idle" && (dirty ? "Unsaved changes" : "Up to date")}
        </span>
        <button type="button" className="primary" onClick={handleSave} disabled={!dirty || saveStatus.kind === "saving"}>
          Save
        </button>
        <button type="button" onClick={handleDiscard} disabled={saveStatus.kind === "saving"}>
          Discard
        </button>
        <button type="button" onClick={handleExportPreview}>
          Export Preview
        </button>
        <button type="button" className="danger" onClick={() => setConfirmRefresh(true)}>
          Refresh Board
        </button>
      </div>

      <div className="builder-panes">
        <PageList
          layout={draft}
          selectedPageIndex={selectedPageIndex}
          selectedWidgetId={selectedWidgetId}
          onSelectPage={setSelectedPageIndex}
          onSelectWidget={setSelectedWidgetId}
          onChange={applyChange}
        />
        <PreviewPane layout={draft} selectedPageIndex={selectedPageIndex} onSelectPage={setSelectedPageIndex} />
        <Inspector
          layout={draft}
          page={page}
          widget={widget}
          catalog={catalog}
          onChange={applyChange}
          onRemoveWidget={handleRemoveWidget}
        />
      </div>

      {validationErrors.length > 0 && (
        <div className="errors-box" style={{ position: "fixed", bottom: 12, left: 12, right: 12, zIndex: 40 }}>
          <strong>Layout validation failed:</strong>
          <ul>
            {validationErrors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {confirmDiscard && (
        <Confirm
          title="Discard changes"
          body="Discard all unsaved changes and reload the saved layout from public/data/layout.json?"
          confirmLabel="Discard"
          danger
          onConfirm={() => void performDiscard()}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}

      {confirmRefresh && (
        <Confirm
          title="Refresh board"
          body={`This triggers a real e-ink panel refresh (${refreshBoardUrl()}), which costs battery. Saved layout changes are not affected by Save alone — only this action refreshes the physical display. Continue?`}
          confirmLabel="Refresh board"
          danger
          onConfirm={() => void performRefresh()}
          onCancel={() => setConfirmRefresh(false)}
        />
      )}
    </div>
  );
}
