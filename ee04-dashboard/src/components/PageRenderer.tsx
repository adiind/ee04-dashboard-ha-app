import { WidgetRenderer, type WidgetContext } from "../widgets/Widgets";
import type { LayoutPage } from "../layout/types";

/**
 * Renders one page's template grid and its widgets, each placed into its
 * declared slot via CSS `grid-area`.
 */
export function PageRenderer({ page, ctx }: { page: LayoutPage; ctx: WidgetContext }) {
  return (
    <div className={`template-${page.template}`}>
      {page.widgets.map((widget) => (
        <WidgetRenderer widget={widget} ctx={ctx} key={widget.id} />
      ))}
    </div>
  );
}
