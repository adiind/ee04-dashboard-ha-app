import { Home, Wifi } from "lucide-react";
import { findBoardBattery } from "../lib/layoutPresets";
import { formatDate } from "../lib/format";
import type { BoardStatus, DashboardData } from "../types";
import type { LayoutPage } from "../layout/types";

export function TopBar({
  data,
  board,
  page,
  source
}: {
  data: DashboardData;
  board: BoardStatus;
  page: LayoutPage;
  source: "live" | "mock";
}) {
  // The ePaper image needs the instant it was rendered, not the older HA
  // snapshot timestamp that supplied its data.
  const renderedAt = new URLSearchParams(window.location.search).get("renderedAt");
  const now = new Date(renderedAt || data.generatedAt);
  const boardBattery = findBoardBattery(data, board);
  return (
    <header className="topbar">
      <div className="top-cluster brand">
        <Home size={19} strokeWidth={2.5} />
        <div>
          <strong>{timeOnly(now)} {meridiem(now)}</strong>
          <span>{formatDate(now)}</span>
        </div>
      </div>
      <div className="page-title">
        <span>{page.phrase}</span>
        <h1>{page.label}</h1>
      </div>
      <div className="top-cluster telemetry">
        <Wifi size={18} strokeWidth={2.5} />
        <div>
          <strong>{source === "live" ? `${data.entityCount} HA` : "Mock"}</strong>
          <span>{boardBattery ? `${boardBattery.state}${boardBattery.unit ?? "%"}` : board.ok ? "BAT waking" : "BAT pending"}</span>
        </div>
      </div>
    </header>
  );
}

function timeOnly(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
    .format(date)
    .replace(/\s?(AM|PM)$/i, "");
}

function meridiem(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: true
  })
    .format(date)
    .replace(/^\d+\s?/i, "");
}
