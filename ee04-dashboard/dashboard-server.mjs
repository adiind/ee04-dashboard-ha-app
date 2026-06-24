import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const APP_ROOT = process.env.EE04_APP_ROOT || "/app";
const DIST = resolve(APP_ROOT, "dist");
const OPTIONS_PATH = process.env.EE04_OPTIONS_PATH || "/data/options.json";
const STATE_DIR = process.env.EE04_STATE_DIR || "/data/ee04-dashboard";
const PAGE_STATE_PATH = join(STATE_DIR, "page-state.json");
const IMAGE_PATH = process.env.EE04_IMAGE_PATH || "/config/www/eink/dashboard-spectra.png";
const PORT = Number.parseInt(process.env.EE04_PORT || "8099", 10);
const SUPERVISOR_URL = (process.env.EE04_SUPERVISOR_URL || "http://supervisor").replace(/\/$/, "");
const WIDTH = 800;
const HEIGHT = 480;
const PAGES = ["home", "rooms", "climate", "security", "agenda", "systems"];
const ACTIONS = new Set(["refresh", "prev", "systems", "next"]);
const SENSITIVE_PATTERN = /(token|password|key)/i;
const MIME = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"]
]);
const SPECTRA = [
  [255, 255, 255],
  [17, 17, 17],
  [215, 25, 32],
  [247, 198, 0],
  [31, 157, 85],
  [18, 97, 166]
];
const HINTS = {
  weather: "weather.forecast_home",
  person: "person.adi",
  temperature: ["sensor.zigtemp_temperature", "sensor.hobeian_zg_303z_temperature", "sensor.fan_controller_room_temperature"],
  humidity: ["sensor.zigtemp_humidity", "sensor.hobeian_zg_303z_humidity"],
  motion: ["binary_sensor.radar_presence_stable", "binary_sensor.radar_radar_moving_target"],
  printerStatus: ["sensor.none_status", "sensor.none_print_status"],
  printerProgress: ["sensor.none_job_percentage", "sensor.surya_printer_percent"],
  printerFile: ["sensor.none_file"],
  transit: [
    ["201 North", "sensor.cta_201_ridge_grove_north_minutes"],
    ["201 South", "sensor.cta_201_ridge_grove_south_minutes"]
  ],
  calendars: [
    ["Northwestern", "calendar.adityaagarwal2027_u_northwestern_edu"],
    ["Canvas", "calendar.aditya_agarwal_calendar_canvas"],
    ["Family", "calendar.family"],
    ["Team", "calendar.team_mclovin"]
  ]
};

let options;
let pageState;
let runtime = {};
let browserPromise;
let renderQueue = Promise.resolve();
let httpOrigin = "http://127.0.0.1:8099";

function log(message) {
  console.log(`[ee04-dashboard] ${message}`);
}

async function loadOptions() {
  try {
    return JSON.parse(await readFile(OPTIONS_PATH, "utf8"));
  } catch {
    return { action_token: "", timezone: "America/Chicago" };
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomically(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function cleanState(value) {
  const raw = String(value ?? "").trim();
  return raw && raw !== "unknown" && raw !== "unavailable" ? raw : "unavailable";
}

function numeric(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function friendly(entity) {
  return entity?.attributes?.friendly_name || entity?.attributes?.name || entity?.entity_id || "Unknown";
}

function compactName(value) {
  return String(value || "")
    .replace(/\s+Update$/, "")
    .replace(/\s+Battery\s+Level$/, "")
    .replace(/\s+Battery$/, "")
    .trim();
}

function entityRef(entity) {
  return {
    entityId: entity.entity_id,
    name: compactName(friendly(entity)),
    state: cleanState(entity.state),
    unit: entity.attributes?.unit_of_measurement,
    deviceClass: entity.attributes?.device_class
  };
}

function firstAvailable(map, ids) {
  return ids.map((id) => map.get(id)).find((entity) => entity && cleanState(entity.state) !== "unavailable");
}

async function haJson(path, init = {}) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) throw new Error("SUPERVISOR_TOKEN is unavailable; homeassistant_api must be enabled.");
  const response = await fetch(`${SUPERVISOR_URL}/core${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!response.ok) throw new Error(`Home Assistant ${path} returned ${response.status}.`);
  return response.json();
}

function localDayRange(timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const start = `${values.year}-${values.month}-${values.day}T00:00:00`;
  const end = `${values.year}-${values.month}-${values.day}T23:59:59`;
  return { start, end };
}

async function fetchAgenda(timeZone) {
  const { start, end } = localDayRange(timeZone);
  const rows = [];
  for (const [calendar, entityId] of HINTS.calendars) {
    try {
      const query = new URLSearchParams({ start, end });
      const payload = await haJson(`/api/calendars/${encodeURIComponent(entityId)}?${query}`);
      if (Array.isArray(payload)) {
        rows.push(...payload.map((item) => ({
          title: item.summary || "Untitled",
          calendar,
          start: item.start?.dateTime || item.start?.date,
          end: item.end?.dateTime || item.end?.date,
          allDay: Boolean(item.start?.date && !item.start?.dateTime),
          location: item.location || undefined
        })).filter((item) => item.start));
      }
    } catch {
      // A missing calendar must not block an ePaper refresh.
    }
  }
  return rows.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()).slice(0, 6);
}

async function fetchForecast() {
  try {
    const payload = await haJson("/api/services/weather/get_forecasts?return_response", {
      method: "POST",
      body: JSON.stringify({ entity_id: HINTS.weather, type: "daily" })
    });
    return payload?.service_response?.[HINTS.weather]?.forecast?.[0];
  } catch {
    return undefined;
  }
}

function usefulState(entity) {
  return cleanState(entity?.state) !== "unavailable";
}

function entityGroup(entityId, deviceClass) {
  const domain = entityId.split(".")[0];
  if (domain === "climate" || domain === "fan" || ["temperature", "humidity"].includes(deviceClass)) return "Climate";
  if (domain === "light") return "Lights";
  if (domain === "lock" || ["motion", "presence", "occupancy", "door", "window", "garage_door", "opening", "problem"].includes(deviceClass)) return "Security";
  if (domain === "media_player") return "Media";
  if (domain === "sensor" || domain === "binary_sensor") return "Sensors";
  return "Other";
}

function buildCatalog(states, generatedAt) {
  return {
    generatedAt,
    entities: states
      .filter((entity) => entity?.entity_id && !SENSITIVE_PATTERN.test(`${entity.entity_id} ${friendly(entity)}`))
      .map((entity) => ({
        ...entityRef(entity),
        domain: entity.entity_id.split(".")[0],
        group: entityGroup(entity.entity_id, entity.attributes?.device_class)
      }))
      .sort((a, b) => a.entityId.localeCompare(b.entityId))
  };
}

function boardSensor(entity) {
  if (!entity) return undefined;
  return {
    state: entity.state,
    unit: entity.attributes?.unit_of_measurement || "",
    deviceClass: entity.attributes?.device_class || ""
  };
}

function buildBoardStatus(map, generatedAt) {
  const sensorMappings = [
    ["Battery Voltage", "sensor.ee04_spectra_dashboard_battery_voltage"],
    ["Battery", "sensor.ee04_spectra_dashboard_battery"],
    ["Uptime", "sensor.ee04_spectra_dashboard_uptime"],
    ["Boot Count", "sensor.ee04_spectra_dashboard_boot_count"],
    ["Previous Page Button Presses", "sensor.ee04_spectra_dashboard_previous_page_button_presses"],
    ["Action Button Presses", "sensor.ee04_spectra_dashboard_action_button_presses"],
    ["Next Page Button Presses", "sensor.ee04_spectra_dashboard_next_page_button_presses"],
    ["WiFi Signal", "sensor.ee04_spectra_dashboard_wifi_signal"]
  ];
  const binaryMappings = [
    ["Previous Page Button", "binary_sensor.ee04_spectra_dashboard_previous_page_button"],
    ["Action Button", "binary_sensor.ee04_spectra_dashboard_action_button"],
    ["Next Page Button", "binary_sensor.ee04_spectra_dashboard_next_page_button"]
  ];
  const sensors = Object.fromEntries(sensorMappings.map(([label, id]) => [label, boardSensor(map.get(id))]).filter(([, value]) => value));
  const binarySensors = Object.fromEntries(binaryMappings.map(([label, id]) => [label, boardSensor(map.get(id))]).filter(([, value]) => value));
  const battery = map.get("sensor.ee04_spectra_dashboard_battery");
  return {
    generatedAt,
    host: "ee04-spectra-dashboard.local",
    profile: "ha_native_boundary_30_60",
    sleepExpected: true,
    ok: Boolean(battery && cleanState(battery.state) !== "unavailable"),
    error: battery && cleanState(battery.state) === "unavailable" ? "Board asleep between scheduled wakes" : undefined,
    sensors,
    binarySensors,
    buttons: []
  };
}

async function buildRuntime() {
  const states = await haJson("/api/states");
  if (!Array.isArray(states)) throw new Error("Home Assistant /api/states did not return an array.");
  const generatedAt = new Date().toISOString();
  const map = new Map(states.map((entity) => [entity.entity_id, entity]));
  const weather = map.get(HINTS.weather);
  const temperature = firstAvailable(map, HINTS.temperature);
  const humidity = firstAvailable(map, HINTS.humidity);
  const motion = firstAvailable(map, HINTS.motion);
  const person = map.get(HINTS.person);
  const printerStatus = firstAvailable(map, HINTS.printerStatus);
  const printerProgress = firstAvailable(map, HINTS.printerProgress);
  const printerFile = firstAvailable(map, HINTS.printerFile);
  const lights = states.filter((entity) => entity.entity_id?.startsWith("light.") && usefulState(entity));
  const batteries = states.filter((entity) => entity.attributes?.device_class === "battery" && numeric(entity.state) !== undefined).map(entityRef).sort((a, b) => numeric(a.state) - numeric(b.state));
  const activeMotion = states.filter((entity) => entity.entity_id?.startsWith("binary_sensor.") && ["motion", "presence", "occupancy"].includes(entity.attributes?.device_class) && entity.state === "on").map(entityRef);
  const openings = states.filter((entity) => entity.entity_id?.startsWith("binary_sensor.") && ["door", "window", "garage_door", "opening"].includes(entity.attributes?.device_class) && entity.state === "on").map(entityRef);
  const locks = states.filter((entity) => entity.entity_id?.startsWith("lock.") && entity.state === "unlocked").map(entityRef);
  const problems = states.filter((entity) => entity.attributes?.device_class === "problem" && entity.state === "on").map(entityRef);
  const unavailable = states.filter((entity) => ["light", "switch", "sensor", "binary_sensor", "media_player", "fan", "climate"].some((domain) => entity.entity_id?.startsWith(`${domain}.`)) && cleanState(entity.state) === "unavailable").map(entityRef);
  const temperatures = states.filter((entity) => entity.attributes?.device_class === "temperature" && usefulState(entity)).map(entityRef).slice(0, 8);
  const humidities = states.filter((entity) => entity.attributes?.device_class === "humidity" && usefulState(entity)).map(entityRef).slice(0, 8);
  const forecast = await fetchForecast();
  const data = {
    generatedAt,
    homeAssistantUrl: "Home Assistant Supervisor",
    entityCount: states.length,
    weather: {
      condition: cleanState(weather?.state).replace(/partlycloudy/i, "partly cloudy").replace(/_/g, " "),
      temperature: numeric(weather?.attributes?.temperature),
      humidity: numeric(weather?.attributes?.humidity),
      high: numeric(forecast?.temperature),
      low: numeric(forecast?.templow)
    },
    room: {
      temperature: numeric(temperature?.state),
      humidity: numeric(humidity?.state),
      source: temperature ? friendly(temperature).replace(/\s+Temperature$/, "") : undefined,
      presence: person?.state === "home" ? "home" : person?.state === "not_home" ? "away" : "unknown",
      motion: motion?.state === "on" ? "active" : motion?.state === "off" ? "still" : "unknown"
    },
    lights: { onCount: lights.filter((entity) => entity.state === "on").length, total: lights.length, active: lights.filter((entity) => entity.state === "on").map(entityRef) },
    printer: { state: cleanState(printerStatus?.state || printerProgress?.state || "idle"), progress: numeric(printerProgress?.state), file: cleanState(printerFile?.state) === "unavailable" ? undefined : cleanState(printerFile?.state) },
    agenda: await fetchAgenda(options.timezone),
    transit: HINTS.transit.flatMap(([label, id]) => {
      const entity = map.get(id);
      if (!entity || cleanState(entity.state) === "unavailable") return [];
      const state = cleanState(entity.state);
      return [{ label, value: numeric(state) === undefined ? state : `${state} min`, detail: "Ridge & Grove" }];
    }),
    alerts: [],
    batteries: { count: batteries.length, lowest: batteries[0], low: batteries.filter((entity) => numeric(entity.state) < 40) },
    updates: { available: [] },
    availability: { unavailableCount: unavailable.length, unavailable: unavailable.slice(0, 6) },
    security: { presence: person?.state === "home" ? "home" : person?.state === "not_home" ? "away" : "unknown", motion: motion?.state === "on" ? "active" : motion?.state === "off" ? "still" : "unknown", activeMotion, openSensors: openings, locksUnlocked: locks, powerProblems: problems },
    climate: { temperatureSensors: temperatures, humiditySensors: humidities, climateEntities: states.filter((entity) => entity.entity_id?.startsWith("climate.") && usefulState(entity)).map(entityRef).slice(0, 6), fansActive: states.filter((entity) => entity.entity_id?.startsWith("fan.") && entity.state === "on").map(entityRef).slice(0, 6) },
    media: { active: states.filter((entity) => entity.entity_id?.startsWith("media_player.") && ["playing", "paused", "on"].includes(entity.state)).map(entityRef).slice(0, 6), unavailable: states.filter((entity) => entity.entity_id?.startsWith("media_player.") && cleanState(entity.state) === "unavailable").map(entityRef).slice(0, 6) },
    mcp: { ok: true, serverName: "Home Assistant", toolCount: 0, promptCount: 0 }
  };
  return { data, board: buildBoardStatus(map, generatedAt), catalog: buildCatalog(states, generatedAt) };
}

function nearestColor(r, g, b) {
  let nearest = SPECTRA[0];
  let distance = Infinity;
  for (const color of SPECTRA) {
    const score = (r - color[0]) ** 2 * 0.3 + (g - color[1]) ** 2 * 0.59 + (b - color[2]) ** 2 * 0.11;
    if (score < distance) {
      distance = score;
      nearest = color;
    }
  }
  return nearest;
}

export function quantizeSpectra(buffer) {
  const image = PNG.sync.read(buffer);
  if (image.width !== WIDTH || image.height !== HEIGHT) throw new Error(`Expected ${WIDTH}x${HEIGHT} render, received ${image.width}x${image.height}.`);
  const output = new PNG({ width: image.width, height: image.height });
  const pixels = new Float32Array(image.data);
  const diffuse = (x, y, red, green, blue, factor) => {
    if (x < 0 || x >= image.width || y < 0 || y >= image.height) return;
    const index = (y * image.width + x) * 4;
    pixels[index] += red * factor;
    pixels[index + 1] += green * factor;
    pixels[index + 2] += blue * factor;
  };
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4;
      const old = [0, 1, 2].map((offset) => Math.max(0, Math.min(255, pixels[index + offset])));
      const next = nearestColor(old[0], old[1], old[2]);
      output.data[index] = next[0];
      output.data[index + 1] = next[1];
      output.data[index + 2] = next[2];
      output.data[index + 3] = 255;
      diffuse(x + 1, y, old[0] - next[0], old[1] - next[1], old[2] - next[2], 7 / 16);
      diffuse(x - 1, y + 1, old[0] - next[0], old[1] - next[1], old[2] - next[2], 3 / 16);
      diffuse(x, y + 1, old[0] - next[0], old[1] - next[1], old[2] - next[2], 5 / 16);
      diffuse(x + 1, y + 1, old[0] - next[0], old[1] - next[1], old[2] - next[2], 1 / 16);
    }
  }
  return PNG.sync.write(output, { colorType: 2 });
}

async function getBrowser() {
  if (!browserPromise) {
    const executablePath = process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser";
    browserPromise = chromium.launch({
      executablePath,
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"]
    });
  }
  return browserPromise;
}

async function renderNow(reason) {
  const snapshot = await buildRuntime();
  runtime = { ...snapshot, pageState };
  const renderedAt = new Date().toISOString();
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, colorScheme: "light" });
  try {
    const url = `${httpOrigin}/?renderedAt=${encodeURIComponent(renderedAt)}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
    const raw = await page.screenshot({ clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    const spectra = quantizeSpectra(raw);
    await mkdir(resolve(IMAGE_PATH, ".."), { recursive: true });
    const temporary = `${IMAGE_PATH}.${process.pid}.tmp`;
    await writeFile(temporary, spectra);
    await rename(temporary, IMAGE_PATH);
    runtime.renderedAt = renderedAt;
    runtime.reason = reason;
    log(`rendered ${pageState.page} for ${reason} at ${renderedAt}`);
    return { page: pageState.page, renderedAt, imagePath: IMAGE_PATH };
  } finally {
    await page.close();
  }
}

function render(reason) {
  const current = renderQueue.then(() => renderNow(reason));
  renderQueue = current.catch(() => undefined);
  return current;
}

function tokenMatches(value) {
  const expected = String(options.action_token || "");
  const actual = String(value || "");
  if (expected.length < 24 || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

async function applyAction(action) {
  if (action === "prev") pageState.page = PAGES[(PAGES.indexOf(pageState.page) + PAGES.length - 1) % PAGES.length];
  if (action === "next") pageState.page = PAGES[(PAGES.indexOf(pageState.page) + 1) % PAGES.length];
  if (action === "systems") pageState.page = "systems";
  pageState = { ...pageState, updatedAt: new Date().toISOString(), reason: action };
  await writeJsonAtomically(PAGE_STATE_PATH, pageState);
  return render(action);
}

function serveStatic(request, response, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.replace(/^\//, ""));
  const target = resolve(DIST, relative);
  if (!target.startsWith(`${DIST}/`) || !existsSync(target)) {
    response.writeHead(404);
    response.end("not found");
    return;
  }
  response.writeHead(200, { "Content-Type": MIME.get(extname(target)) || "application/octet-stream" });
  createReadStream(target).pipe(response);
}

function runtimeData(pathname, response) {
  const files = {
    "/data/live-home.json": runtime.data,
    "/data/board-status.json": runtime.board,
    "/data/entities.json": runtime.catalog,
    "/data/page-state.json": pageState
  };
  if (!Object.hasOwn(files, pathname)) return false;
  json(response, 200, files[pathname] || {});
  return true;
}

async function start() {
  options = await loadOptions();
  options.timezone = options.timezone || "America/Chicago";
  await mkdir(STATE_DIR, { recursive: true });
  pageState = await readJson(PAGE_STATE_PATH, { page: "home", updatedAt: new Date().toISOString(), reason: "startup" });
  if (!PAGES.includes(pageState.page)) pageState.page = "home";
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", httpOrigin);
    if (url.pathname === "/health") {
      json(response, 200, { ok: true, imageReady: existsSync(IMAGE_PATH), page: pageState.page, renderedAt: runtime.renderedAt || null });
      return;
    }
    if (url.pathname === "/v1/action") {
      const action = url.searchParams.get("action") || "";
      const token = url.searchParams.get("token") || request.headers["x-ee04-action-token"];
      if (!tokenMatches(token)) {
        json(response, 401, { ok: false, error: "invalid action token" });
        return;
      }
      if (!ACTIONS.has(action)) {
        json(response, 400, { ok: false, error: "unsupported action" });
        return;
      }
      try {
        const result = await applyAction(action);
        json(response, 200, { ok: true, action, ...result });
      } catch (error) {
        log(`action ${action} render failed: ${error.message}`);
        json(response, 503, { ok: false, error: "render unavailable" });
      }
      return;
    }
    if (runtimeData(url.pathname, response)) return;
    serveStatic(request, response, url.pathname);
  });
  server.listen(PORT, "0.0.0.0", () => {
    httpOrigin = `http://127.0.0.1:${PORT}`;
    log(`listening on ${PORT}; image target ${IMAGE_PATH}`);
    if (String(options.action_token || "").length < 24) log("WARNING: configure an action token of at least 24 characters before flashing the HA-native firmware.");
    render("startup").catch((error) => log(`initial render failed: ${error.message}`));
  });
}

start().catch((error) => {
  console.error(`[ee04-dashboard] startup failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
