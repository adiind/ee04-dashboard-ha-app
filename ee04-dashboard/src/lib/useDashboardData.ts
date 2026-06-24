import { useEffect, useState } from "react";
import { mockDashboard } from "../data/mockDashboard";
import type { BoardStatus, DashboardData, DashboardPageId, DisplayState } from "../types";

type LoadState = {
  data: DashboardData;
  source: "live" | "mock";
};

const PAGE_IDS = new Set<DashboardPageId>(["home", "rooms", "climate", "security", "agenda", "systems"]);

function pageFromQuery(): DashboardPageId | undefined {
  const query = new URLSearchParams(window.location.search);
  const page = query.get("page") as DashboardPageId | null;
  return page && PAGE_IDS.has(page) ? page : undefined;
}

export function useDashboardData(): LoadState {
  const [state, setState] = useState<LoadState>({ data: mockDashboard, source: "mock" });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("source") === "mock") {
      return;
    }

    fetch("/data/live-home.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<DashboardData>;
      })
      .then((data) => setState({ data, source: "live" }))
      .catch(() => setState({ data: mockDashboard, source: "mock" }));
  }, []);

  return state;
}

export function useDisplayState(): DisplayState {
  const override = pageFromQuery();
  const [state, setState] = useState<DisplayState>({
    page: override ?? "home",
    updatedAt: new Date().toISOString(),
    reason: override ? "query" : "default"
  });

  useEffect(() => {
    if (override) return;

    fetch("/data/page-state.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<DisplayState>;
      })
      .then((data) => {
        if (PAGE_IDS.has(data.page)) {
          setState(data);
        }
      })
      .catch(() => {
        setState({
          page: "home",
          updatedAt: new Date().toISOString(),
          reason: "fallback"
        });
      });
  }, [override]);

  return state;
}

export function useBoardStatus(): BoardStatus {
  const [state, setState] = useState<BoardStatus>({
    generatedAt: new Date().toISOString(),
    host: "ee04-spectra-dashboard.local",
    ok: false,
    error: "not loaded",
    sensors: {},
    binarySensors: {},
    buttons: []
  });

  useEffect(() => {
    fetch("/data/board-status.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<BoardStatus>;
      })
      .then((data) => setState(data))
      .catch((error) => {
        setState({
          generatedAt: new Date().toISOString(),
          host: "ee04-spectra-dashboard.local",
          ok: false,
          error: error.message,
          sensors: {},
          binarySensors: {},
          buttons: []
        });
      });
  }, []);

  return state;
}
