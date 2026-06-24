import { numberLabel, titleCase } from "./format";
import type { AgendaItem, BoardStatus, DashboardData, EntityRef } from "../types";

/**
 * Preset resolver for `binding: { kind: "preset", preset: "..." }`.
 *
 * Presets are short, named derivations against the summarized
 * `DashboardData` (plus board status / source for systems-only presets).
 * They mirror the inline calculations the original hard-coded pages used
 * to perform directly in `src/App.tsx`, so the layout-driven renderer
 * produces the same output as before.
 */

export type PresetContext = {
  data: DashboardData;
  board: BoardStatus;
  source: "live" | "mock";
};

export type StatTileValue = {
  label: string;
  value: string;
  tone?: "black" | "red" | "yellow" | "green" | "blue";
};

export type StatusStripValue = {
  eyebrow?: string;
  headline: string;
  body: string;
  tone?: "calm" | "warning";
};

export type EntityListValue = {
  items: EntityRef[];
  fallback?: string;
};

export type RoomsSignalValue =
  | { mode: "hero"; value: string; label: string }
  | { mode: "list"; items: EntityRef[]; fallback: string };

export type BoardHealthValue = {
  hasBoardTelemetry: boolean;
  voltage?: string;
  wifi?: string;
  uptime?: string;
  fallbackItems: EntityRef[];
  fallbackLabel: string;
};

function entityNames(items: EntityRef[], fallback: string, limit = 2) {
  if (items.length === 0) return fallback;
  return items
    .slice(0, limit)
    .map((item) => compactDisplayName(item.name))
    .join(" · ");
}

function compactDisplayName(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\bX2D\s+[A-Z0-9]{8,}\s*/gi, "")
    .replace(/\b20P9AJ611300484\b/gi, "")
    .replace(/\bHOBEIAN\s+/gi, "")
    .replace(/\b([A-Za-z]+)\s+\1\b/g, "$1")
    .replace(/\s+Update$/, "")
    .replace(/\s+Battery\s+Level$/, "")
    .replace(/\s+Temperature$/i, " Temp")
    .replace(/\s+Target Temp$/i, " Target")
    .replace(/\s+/g, " ")
    .trim();
}

function compactAgendaTitle(value: string) {
  return compactDisplayName(value)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+\[[^\]]+\]\s*$/g, "")
    .replace(/\s+-\s+Advanced Track.*$/i, " Advanced Track")
    .replace(/\s+-\s+Basic Track.*$/i, " Basic Track")
    .replace(/\s+/g, " ")
    .trim();
}

function printerValue(data: DashboardData) {
  if (typeof data.printer.progress === "number" && data.printer.progress > 0) {
    return `${Math.round(data.printer.progress)}%`;
  }
  return titleCase(data.printer.state || "idle");
}

function batteryValue(data: DashboardData) {
  const lowest = data.batteries.lowest;
  if (!lowest) return "--";
  const numeric = Number.parseFloat(lowest.state);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : lowest.state;
}

function runtimeValue(board: BoardStatus) {
  const hours = board.runtimeEstimate?.robustHours;
  if (!hours) return "--";
  return `${Math.round(hours.min)}-${Math.round(hours.max)}h`;
}

function runtimeTone(board: BoardStatus): "black" | "red" | "yellow" | "green" | "blue" {
  const hours = board.runtimeEstimate?.robustHours;
  if (!hours) return "black";
  if (hours.max < 24) return "red";
  if (hours.max < 48) return "yellow";
  return "green";
}

function boardBatteryValue(data: DashboardData, board?: BoardStatus) {
  const boardBattery = findBoardBattery(data, board);
  if (!boardBattery) return undefined;
  const numeric = Number.parseFloat(boardBattery.state);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}${boardBattery.unit ?? "%"}` : `${boardBattery.state}${boardBattery.unit ?? "%"}`;
}

function mcpValue(data: DashboardData) {
  if (!data.mcp?.ok) return "--";
  if (typeof data.mcp.liveContextCount === "number") return String(data.mcp.liveContextCount);
  return String(data.mcp.toolCount ?? 0);
}

function mcpServerLabel(data: DashboardData) {
  if (!data.mcp?.ok) return "offline";
  if (typeof data.mcp.liveContextCount === "number") {
    return `${data.mcp.liveContextCount} exposed`;
  }
  return `${data.mcp.toolCount ?? 0} tools`;
}

export function uptimeLabel(value: string | number | boolean) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return String(value);
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function homeHeadline(data: DashboardData) {
  const warm = typeof data.room.temperature === "number" && data.room.temperature >= 80;
  const active = data.lights.onCount > 0;
  const home = data.room.presence === "home";
  if (warm && home) return "Warm Home";
  if (home && active) return "Home Active";
  if (home) return "Home Base";
  if (active) return "Lights Active";
  return "Quiet Home";
}

function homeSummary(data: DashboardData, next?: AgendaItem) {
  const parts = [
    `Outside ${numberLabel(data.weather.temperature)}°`,
    `inside ${numberLabel(data.room.temperature, 1)}°`,
    `${data.lights.onCount}/${data.lights.total} lights on`
  ];
  if (next) parts.push(`next ${next.allDay ? "all day" : formatTimeShort(next.start)}: ${compactAgendaTitle(next.title)}`);
  return parts.join(" · ");
}

function formatTimeShort(value: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function roomsSummary(data: DashboardData, activeLightCount: number, unavailableCount: number) {
  if (data.printer.progress && data.printer.progress > 0) {
    return `Printer active: ${printerValue(data)}${data.printer.file ? ` · ${compactDisplayName(data.printer.file)}` : ""}`;
  }
  if (unavailableCount > 0) return `${activeLightCount} active lights · ${unavailableCount} unavailable signals`;
  if (activeLightCount > 0) return `${activeLightCount} active lights · room signals reachable`;
  return "No active lights · room signals reachable";
}

function roomClimateSensors(items: EntityRef[] = []) {
  const printerPattern = /x2d|bambu|hephaestus|ad5x|ams|bed|nozzle|chamber|extruder|spool|printer/i;
  return items.filter((item) => !printerPattern.test(`${item.entityId} ${item.name}`)).slice(0, 6);
}

function uniqueEntityItems(items: EntityRef[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${compactDisplayName(item.name).toLowerCase()}|${item.deviceClass ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function roomTemperatureItem(data: DashboardData): EntityRef[] {
  if (typeof data.room.temperature !== "number") return [];
  return [{
    entityId: "dashboard.room_temperature",
    name: `${data.room.source ?? "Room"} Temp`,
    state: numberLabel(data.room.temperature, 1),
    unit: "°",
    deviceClass: "temperature"
  }];
}

function roomHumidityItem(data: DashboardData): EntityRef[] {
  if (typeof data.room.humidity !== "number") return [];
  return [{
    entityId: "dashboard.room_humidity",
    name: `${data.room.source ?? "Room"} Humidity`,
    state: numberLabel(data.room.humidity, 0),
    unit: "%",
    deviceClass: "humidity"
  }];
}

function findBoardBattery(data: DashboardData, board?: BoardStatus) {
  const direct = board?.sensors?.Battery;
  if (direct) {
    return {
      entityId: "ee04.battery",
      name: "EE04 Battery",
      state: String(direct.state),
      unit: direct.unit ?? "%",
      deviceClass: direct.deviceClass
    };
  }
  const candidates = [data.batteries.lowest, ...data.batteries.low].filter(Boolean) as EntityRef[];
  return candidates.find((item) => /ee04|spectra|epaper|e-paper|dashboard/i.test(`${item.name} ${item.entityId}`));
}

function hasPrinterSignal(data: DashboardData) {
  return (
    !["unavailable", "unknown", "idle", "0"].includes(String(data.printer.state).toLowerCase()) ||
    (typeof data.printer.progress === "number" && data.printer.progress > 0)
  );
}

/**
 * Resolve a preset against the dashboard/board context. Returns `undefined`
 * for unknown presets so callers can render a graceful placeholder.
 */
export function resolvePreset(preset: string, ctx: PresetContext): unknown {
  const { data, board, source } = ctx;

  switch (preset) {
    case "weather":
      return data.weather;

    case "agenda":
      return data.agenda;

    case "transit":
      return data.transit;

    case "lights.active":
      return { items: data.lights.active, fallback: "All lights off" } satisfies EntityListValue;

    case "availability.unavailable":
      return { items: data.availability.unavailable, fallback: "Nothing notable offline" } satisfies EntityListValue;

    case "batteries.low":
      return { items: data.batteries.low, fallback: "No low batteries" } satisfies EntityListValue;

    case "climate.temperatureSensors":
      return {
        items: uniqueEntityItems([...roomTemperatureItem(data), ...roomClimateSensors(data.climate?.temperatureSensors)]),
        fallback: "No extra temp sensors"
      } satisfies EntityListValue;

    case "climate.humiditySensors":
      return {
        items: uniqueEntityItems([...roomHumidityItem(data), ...roomClimateSensors(data.climate?.humiditySensors)]),
        fallback: "No extra humidity sensors"
      } satisfies EntityListValue;

    case "security.motion":
      return {
        items: data.security?.activeMotion ?? [],
        fallback: data.room.motion === "still" ? "No motion" : titleCase(data.room.motion ?? "unknown")
      } satisfies EntityListValue;

    case "security.issues": {
      const issues = [
        ...(data.security?.openSensors ?? []),
        ...(data.security?.locksUnlocked ?? []),
        ...(data.security?.powerProblems ?? [])
      ];
      return { items: issues, fallback: "No open/problem sensors reported" } satisfies EntityListValue;
    }

    case "home.mood": {
      const next = data.agenda[0];
      return {
        eyebrow: "Home Assistant live",
        headline: homeHeadline(data),
        body: homeSummary(data, next)
      } satisfies StatusStripValue;
    }

    case "home.tiles.indoor":
      return { label: "Indoor", value: `${numberLabel(data.room.temperature, 1)}°`, tone: "red" } satisfies StatTileValue;
    case "home.tiles.presence":
      return { label: "Presence", value: titleCase(data.room.presence), tone: "green" } satisfies StatTileValue;
    case "home.tiles.lights":
      return { label: "Lights", value: `${data.lights.onCount}/${data.lights.total}`, tone: "yellow" } satisfies StatTileValue;
    case "home.tiles.battery":
      return { label: "Low Bat", value: batteryValue(data), tone: "blue" } satisfies StatTileValue;

    case "rooms.command": {
      const activeLights = data.lights.active.slice(0, 6);
      return {
        headline: String(data.lights.onCount),
        body: entityNames(activeLights, "No active lights", 4)
      } satisfies StatusStripValue;
    }

    case "rooms.signal": {
      const unavailable = data.availability.unavailable.slice(0, 4);
      if (hasPrinterSignal(data)) {
        return {
          mode: "hero",
          value: printerValue(data),
          label: data.printer.file ?? titleCase(data.printer.state)
        } satisfies RoomsSignalValue;
      }
      return { mode: "list", items: unavailable, fallback: "All key signals reachable" } satisfies RoomsSignalValue;
    }

    case "rooms.status": {
      const activeLights = data.lights.active.slice(0, 6);
      const unavailable = data.availability.unavailable.slice(0, 4);
      return {
        headline: "Room Status",
        body: roomsSummary(data, activeLights.length, unavailable.length)
      } satisfies StatusStripValue;
    }

    case "climate.tiles.indoor":
      return { label: "Indoor", value: `${numberLabel(data.room.temperature, 1)}°`, tone: "red" } satisfies StatTileValue;
    case "climate.tiles.humidity":
      return { label: "Humidity", value: `${numberLabel(data.room.humidity, 0)}%`, tone: "blue" } satisfies StatTileValue;
    case "climate.tiles.fans":
      return { label: "Fans", value: String(data.climate?.fansActive.length ?? 0), tone: "green" } satisfies StatTileValue;

    case "security.hero": {
      const security = data.security;
      const issues = [
        ...(security?.openSensors ?? []),
        ...(security?.locksUnlocked ?? []),
        ...(security?.powerProblems ?? [])
      ];
      const calm = issues.length === 0 && (security?.activeMotion.length ?? 0) === 0;
      return {
        eyebrow: "Security",
        headline: calm ? "Clear" : "Check",
        body: security?.presence === "home" ? "Home · no open sensors" : titleCase(security?.presence ?? "unknown"),
        tone: calm ? "calm" : "warning"
      } satisfies StatusStripValue;
    }

    case "systems.hero": {
      const wifiSignal = board.sensors["WiFi Signal"];
      const uptime = board.sensors.Uptime;
      const headline = boardBatteryValue(data, board) ?? String(data.entityCount);
      const body = [
        wifiSignal ? `WiFi ${wifiSignal.state}${wifiSignal.unit ?? ""}` : undefined,
        uptime ? `up ${uptimeLabel(uptime.state)}` : undefined,
        `${mcpServerLabel(data)} MCP`
      ].filter(Boolean).join(" · ");
      return {
        eyebrow: source === "live" ? "EE04 Board" : "Mock Board",
        headline,
        body
      } satisfies StatusStripValue;
    }

    case "systems.tiles.mcp":
      return { label: "MCP", value: mcpValue(data), tone: data.mcp?.ok ? "green" : "red" } satisfies StatTileValue;
    case "systems.tiles.boardBattery": {
      const boardBattery = findBoardBattery(data, board);
      return {
        label: "Board Bat",
        value: boardBattery ? `${boardBattery.state}${boardBattery.unit ?? "%"}` : "soon",
        tone: "blue"
      } satisfies StatTileValue;
    }
    case "systems.tiles.runtime":
      return { label: "Est Left", value: runtimeValue(board), tone: runtimeTone(board) } satisfies StatTileValue;
    case "systems.tiles.offline":
      return {
        label: "Offline",
        value: String(data.availability.unavailableCount),
        tone: data.availability.unavailableCount ? "red" : "green"
      } satisfies StatTileValue;

    case "board.health": {
      const boardVoltage = board.sensors["Battery Voltage"];
      const wifiSignal = board.sensors["WiFi Signal"];
      const uptime = board.sensors.Uptime;
      const hasBoardTelemetry = Boolean(boardVoltage);
      return {
        hasBoardTelemetry,
        voltage: boardVoltage ? `${boardVoltage.state}${boardVoltage.unit ?? "V"}` : undefined,
        wifi: wifiSignal ? `${wifiSignal.state}${wifiSignal.unit ?? ""}` : "online",
        uptime: uptime ? uptimeLabel(uptime.state) : mcpServerLabel(data),
        fallbackItems: [...(data.media?.active ?? []), ...(data.media?.unavailable ?? [])],
        fallbackLabel: board.error ?? "Board status pending"
      } satisfies BoardHealthValue;
    }

    case "topbar.battery": {
      const boardBattery = findBoardBattery(data, board);
      return boardBattery;
    }

    default:
      return undefined;
  }
}

/** Find the board battery entity, exported for the top bar. */
export { findBoardBattery, hasPrinterSignal, printerValue };

/**
 * Enumerable list of preset names handled by `resolvePreset` above, grouped
 * by area. Used by the layout builder UI to populate a preset picker for
 * `binding: { kind: "preset", preset: "..." }`. Keep in sync with the
 * `switch` cases in `resolvePreset`.
 */
export const LAYOUT_PRESETS: string[] = [
  "weather",
  "agenda",
  "transit",
  "lights.active",
  "availability.unavailable",
  "batteries.low",
  "climate.temperatureSensors",
  "climate.humiditySensors",
  "security.motion",
  "security.issues",
  "home.mood",
  "home.tiles.indoor",
  "home.tiles.presence",
  "home.tiles.lights",
  "home.tiles.battery",
  "rooms.command",
  "rooms.signal",
  "rooms.status",
  "climate.tiles.indoor",
  "climate.tiles.humidity",
  "climate.tiles.fans",
  "security.hero",
  "systems.hero",
  "systems.tiles.mcp",
  "systems.tiles.boardBattery",
  "systems.tiles.runtime",
  "systems.tiles.offline",
  "board.health"
];
