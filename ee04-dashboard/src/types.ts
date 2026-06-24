export type EntityRef = {
  entityId: string;
  name: string;
  state: string;
  unit?: string;
  deviceClass?: string;
};

export type AgendaItem = {
  title: string;
  calendar: string;
  start: string;
  end?: string;
  allDay?: boolean;
  location?: string;
};

export type TransitItem = {
  label: string;
  value: string;
  detail?: string;
};

export type WeatherSummary = {
  condition: string;
  temperature?: number;
  humidity?: number;
  high?: number;
  low?: number;
};

export type RoomSummary = {
  temperature?: number;
  humidity?: number;
  source?: string;
  presence: "home" | "away" | "unknown";
  motion?: "active" | "still" | "unknown";
};

export type LightSummary = {
  onCount: number;
  total: number;
  active: EntityRef[];
};

export type PrinterSummary = {
  state: string;
  progress?: number;
  file?: string;
};

export type BatterySummary = {
  lowest?: EntityRef;
  low: EntityRef[];
  count: number;
};

export type UpdateSummary = {
  available: EntityRef[];
};

export type AvailabilitySummary = {
  unavailableCount: number;
  unavailable: EntityRef[];
};

export type SecuritySummary = {
  presence: "home" | "away" | "unknown";
  motion: "active" | "still" | "unknown";
  activeMotion: EntityRef[];
  openSensors: EntityRef[];
  locksUnlocked: EntityRef[];
  powerProblems: EntityRef[];
};

export type ClimateSummary = {
  temperatureSensors: EntityRef[];
  humiditySensors: EntityRef[];
  climateEntities: EntityRef[];
  fansActive: EntityRef[];
};

export type MediaSummary = {
  active: EntityRef[];
  unavailable: EntityRef[];
};

export type McpSummary = {
  ok: boolean;
  serverName?: string;
  serverVersion?: string;
  toolCount?: number;
  promptCount?: number;
  liveContextCount?: number;
  liveContextActiveCount?: number;
  liveContextUnavailableCount?: number;
  liveContextPreview?: string[];
  tools?: string[];
  prompts?: string[];
  error?: string;
};

export type DashboardPageId = "home" | "rooms" | "climate" | "security" | "agenda" | "systems";

export type DisplayState = {
  page: DashboardPageId;
  updatedAt: string;
  reason?: string;
};

export type BoardSensorValue = {
  state: string | number | boolean;
  unit?: string;
  deviceClass?: string;
  cached?: boolean;
};

export type BoardRuntimeEstimate = {
  assumedCapacityMah: number;
  batteryPercent: number;
  remainingMah: number;
  robustHours: {
    min: number;
    max: number;
  };
  deepSleep1020Days: {
    min: number;
    max: number;
  };
  deepSleep3060Days?: {
    min: number;
    max: number;
  };
  deepSleep1560Days?: {
    min: number;
    max: number;
  };
  basis: string;
};

export type BoardStatus = {
  generatedAt: string;
  host: string;
  profile?: string;
  sleepExpected?: boolean;
  ok: boolean;
  error?: string;
  cachedFromLastOk?: boolean;
  lastOkGeneratedAt?: string;
  deviceName?: string;
  macAddress?: string;
  esphomeVersion?: string;
  connectedAddress?: string;
  sensors: Record<string, BoardSensorValue>;
  binarySensors: Record<string, BoardSensorValue>;
  textSensors?: Record<string, BoardSensorValue>;
  buttons: Array<{ name: string; key: number }>;
  runtimeEstimate?: BoardRuntimeEstimate;
};

export type DashboardData = {
  generatedAt: string;
  homeAssistantUrl: string;
  entityCount: number;
  weather: WeatherSummary;
  room: RoomSummary;
  lights: LightSummary;
  printer: PrinterSummary;
  agenda: AgendaItem[];
  transit: TransitItem[];
  alerts: string[];
  batteries: BatterySummary;
  updates: UpdateSummary;
  availability: AvailabilitySummary;
  security?: SecuritySummary;
  climate?: ClimateSummary;
  media?: MediaSummary;
  mcp?: McpSummary;
};
