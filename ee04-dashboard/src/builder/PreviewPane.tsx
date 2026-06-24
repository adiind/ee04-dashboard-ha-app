import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dashboard } from "../components/Dashboard";
import { useBoardStatus, useDashboardData } from "../lib/useDashboardData";
import { useEntityCatalog } from "../lib/useEntityCatalog";
import { SpectraPreview } from "./SpectraPreview";
import type { LayoutDocument } from "../layout/types";
import type { DashboardPageId } from "../types";

const SCALE_TARGET = 800;

export function PreviewPane({
  layout,
  selectedPageIndex,
  onSelectPage
}: {
  layout: LayoutDocument;
  selectedPageIndex: number;
  onSelectPage: (index: number) => void;
}) {
  const { data, source } = useDashboardData();
  const board = useBoardStatus();
  const { catalog } = useEntityCatalog();
  const [spectra, setSpectra] = useState(false);
  const [spectraFallback, setSpectraFallback] = useState<string | undefined>();
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [version, setVersion] = useState(0);

  const page = layout.pages[selectedPageIndex] ?? layout.pages[0];

  useEffect(() => {
    function updateScale() {
      const stage = stageRef.current;
      if (!stage) return;
      const width = stage.clientWidth;
      setScale(Math.min(1, width / SCALE_TARGET));
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  // Bump a version counter whenever the page (or its widgets) changes so the
  // Spectra snapshot re-renders after edits, and on a short delay after
  // mount/page-switch to let live data settle in.
  useEffect(() => {
    setVersion((v) => v + 1);
    const timeout = window.setTimeout(() => setVersion((v) => v + 1), 250);
    return () => window.clearTimeout(timeout);
  }, [layout, selectedPageIndex, data, board, catalog]);

  useEffect(() => {
    if (!spectra) setSpectraFallback(undefined);
  }, [spectra]);

  if (!page) {
    return (
      <div className="pane preview-pane">
        <div className="inspector-empty">No pages in the draft layout.</div>
      </div>
    );
  }

  const pageCount = layout.pages.length;

  return (
    <div className="pane preview-pane">
      <div className="preview-toolbar">
        <div className="page-nav">
          <button
            type="button"
            onClick={() => onSelectPage((selectedPageIndex - 1 + pageCount) % pageCount)}
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="page-name">
            {page.label || page.id} ({selectedPageIndex + 1}/{pageCount})
          </span>
          <button
            type="button"
            onClick={() => onSelectPage((selectedPageIndex + 1) % pageCount)}
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <button type="button" className={spectra ? "active" : ""} onClick={() => setSpectra((v) => !v)} style={{ marginLeft: "auto" }}>
          {spectra ? "Spectra preview: on" : "Spectra preview: off"}
        </button>
      </div>

      <div className="preview-stage" ref={stageRef}>
        <div
          className={`preview-host${spectra && spectraFallback ? " spectra-fallback" : ""}`}
          ref={hostRef}
          style={{
            transform: `scale(${scale})`,
            visibility: spectra && !spectraFallback ? "hidden" : "visible"
          }}
        >
          {/* `Dashboard.pageId` is typed to the 6 canonical page ids, but its
              implementation does a plain string `===` lookup against
              `layout.pages`. The cast lets the preview render pages with
              custom (builder-added) ids too. */}
          <Dashboard
            data={data}
            board={board}
            pageId={page.id as DashboardPageId}
            source={source}
            layout={layout}
            layoutFallback={false}
            catalog={catalog}
          />
        </div>
        {spectra && !spectraFallback && (
          <SpectraPreview
            source={hostRef.current?.firstElementChild as HTMLElement | null}
            version={version}
            onFallback={setSpectraFallback}
          />
        )}
      </div>

      <div className="preview-note">
        {spectra && spectraFallback ? (
          <>
            Spectra canvas snapshot unavailable ({spectraFallback}); showing a CSS-filter
            approximation instead of a true six-color quantization. Toggle off for the real-data preview.
          </>
        ) : (
          <>
            Bound to live data ({source}) and the in-memory draft layout. "Spectra preview" snapshots
            this view and quantizes it to the strict six-color panel palette with the same dithering as
            the export pipeline.
          </>
        )}
      </div>
    </div>
  );
}
