import { useBoardStatus, useDashboardData, useDisplayState } from "./lib/useDashboardData";
import { useLayout } from "./lib/useLayout";
import { useEntityCatalog } from "./lib/useEntityCatalog";
import { Dashboard } from "./components/Dashboard";
import { CalibrationScreen } from "./components/CalibrationScreen";

const query = new URLSearchParams(window.location.search);
const view = query.get("view") ?? "dashboard";

export function App() {
  const { data, source } = useDashboardData();
  const display = useDisplayState();
  const board = useBoardStatus();
  const { layout, fallback } = useLayout();
  const { catalog } = useEntityCatalog();

  if (view === "calibration") {
    return <CalibrationScreen generatedAt={data.generatedAt} />;
  }

  return (
    <Dashboard
      data={data}
      board={board}
      pageId={display.page}
      source={source}
      layout={layout}
      layoutFallback={fallback}
      catalog={catalog}
    />
  );
}
