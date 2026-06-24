import { TopBar } from "./TopBar";
import { PageRenderer } from "./PageRenderer";
import type { EntityCatalog } from "../lib/useEntityCatalog";
import type { BoardStatus, DashboardData, DashboardPageId } from "../types";
import type { LayoutDocument } from "../layout/types";

export function Dashboard({
  data,
  board,
  pageId,
  source,
  layout,
  layoutFallback,
  catalog
}: {
  data: DashboardData;
  board: BoardStatus;
  pageId: DashboardPageId;
  source: "live" | "mock";
  layout: LayoutDocument;
  layoutFallback: boolean;
  catalog: EntityCatalog | undefined;
}) {
  const enabledPages = layout.pages.filter((item) => item.enabled);
  const page = enabledPages.find((item) => item.id === pageId) ?? enabledPages[0] ?? layout.pages[0];

  if (!page) return null;

  const ctx = { data, board, source, catalog };

  return (
    <main className={`epaper-screen page-${page.id}`} aria-label="Home Assistant ePaper dashboard">
      <TopBar data={data} board={board} page={page} source={source} />
      <section className="page-body" aria-label={`${page.label} page`}>
        {page.id === "systems" && layoutFallback && <span className="layout-fallback-badge">Layout Fallback</span>}
        <PageRenderer page={page} ctx={ctx} />
      </section>
    </main>
  );
}
