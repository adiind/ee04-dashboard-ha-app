import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SPECTRA = new Set(["255,255,255", "17,17,17", "215,25,32", "247,198,0", "31,157,85", "18,97,166"]);

function listen(server) {
  return new Promise((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise(server.address().port)));
}

function close(server) {
  server.closeAllConnections();
  return new Promise((resolvePromise) => server.close(resolvePromise));
}

function stop(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => {
    const force = setTimeout(() => child.kill("SIGKILL"), 2_000);
    child.once("exit", () => {
      clearTimeout(force);
      resolvePromise();
    });
    child.kill("SIGTERM");
  });
}

function fixtureStates() {
  const entity = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes });
  return [
    entity("weather.forecast_home", "partlycloudy", { temperature: 72, humidity: 42, friendly_name: "Home Forecast" }),
    entity("person.adi", "home", { friendly_name: "Adi" }),
    entity("sensor.zigtemp_temperature", "71.4", { device_class: "temperature", unit_of_measurement: "°F", friendly_name: "Living Temperature" }),
    entity("sensor.zigtemp_humidity", "40", { device_class: "humidity", unit_of_measurement: "%", friendly_name: "Living Humidity" }),
    entity("binary_sensor.radar_presence_stable", "off", { device_class: "presence", friendly_name: "Living Presence" }),
    entity("light.ambient", "on", { friendly_name: "Ambient" }),
    entity("sensor.ee04_spectra_dashboard_battery", "83", { device_class: "battery", unit_of_measurement: "%", friendly_name: "EE04 Battery" }),
    entity("sensor.ee04_spectra_dashboard_battery_voltage", "4.08", { device_class: "voltage", unit_of_measurement: "V", friendly_name: "EE04 Battery Voltage" }),
    entity("sensor.ee04_spectra_dashboard_uptime", "6", { device_class: "duration", unit_of_measurement: "s", friendly_name: "EE04 Uptime" }),
    entity("sensor.ee04_spectra_dashboard_boot_count", "9", { friendly_name: "EE04 Boot Count" }),
    entity("sensor.ee04_spectra_dashboard_previous_page_button_presses", "1", { friendly_name: "EE04 Previous Page Button Presses" }),
    entity("sensor.ee04_spectra_dashboard_action_button_presses", "1", { friendly_name: "EE04 Action Button Presses" }),
    entity("sensor.ee04_spectra_dashboard_next_page_button_presses", "1", { friendly_name: "EE04 Next Page Button Presses" }),
    entity("sensor.ee04_spectra_dashboard_wifi_signal", "-58", { device_class: "signal_strength", unit_of_measurement: "dBm", friendly_name: "EE04 WiFi Signal" }),
    entity("binary_sensor.ee04_spectra_dashboard_previous_page_button", "off", { friendly_name: "EE04 Previous Page Button" }),
    entity("binary_sensor.ee04_spectra_dashboard_action_button", "off", { friendly_name: "EE04 Action Button" }),
    entity("binary_sensor.ee04_spectra_dashboard_next_page_button", "off", { friendly_name: "EE04 Next Page Button" })
  ];
}

async function waitFor(predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let error;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (caught) {
      error = caught;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw error || new Error("Timed out waiting for EE04 app.");
}

test("HA action API waits for a six-colour 800x480 image and persists page actions", { timeout: 90_000 }, async (t) => {
  const chromiumPath = process.env.CHROMIUM_PATH;
  if (!chromiumPath || !existsSync(chromiumPath)) {
    t.skip("Set CHROMIUM_PATH to run the Chromium-backed app contract test.");
    return;
  }

  const supervisor = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let payload = [];
    if (url.pathname === "/core/api/states") payload = fixtureStates();
    if (url.pathname === "/core/api/services/weather/get_forecasts") {
      payload = { service_response: { "weather.forecast_home": { forecast: [{ temperature: 76, templow: 58 }] } } };
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  const supervisorPort = await listen(supervisor);
  const stateRoot = await mkdtemp(join(tmpdir(), "ee04-ha-app-"));
  const appPort = 18_000 + Math.floor(Math.random() * 10_000);
  const token = randomBytes(32).toString("base64url");
  const imagePath = join(stateRoot, "dashboard-spectra.png");
  const optionsPath = join(stateRoot, "options.json");
  await writeFile(optionsPath, JSON.stringify({ action_token: token, timezone: "America/Chicago" }));
  const child = spawn(process.execPath, ["dashboard-server.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      CHROMIUM_PATH: chromiumPath,
      EE04_APP_ROOT: ROOT,
      EE04_IMAGE_PATH: imagePath,
      EE04_OPTIONS_PATH: optionsPath,
      EE04_PORT: String(appPort),
      EE04_STATE_DIR: join(stateRoot, "state"),
      EE04_SUPERVISOR_URL: `http://127.0.0.1:${supervisorPort}`,
      SUPERVISOR_TOKEN: "test-token"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  t.after(async () => {
    await stop(child);
    await close(supervisor);
    await rm(stateRoot, { recursive: true, force: true });
  });

  await waitFor(async () => (await fetch(`http://127.0.0.1:${appPort}/health`)).ok);
  await waitFor(() => existsSync(imagePath));

  const image = PNG.sync.read(await readFile(imagePath));
  assert.equal(image.width, 800);
  assert.equal(image.height, 480);
  for (let index = 0; index < image.data.length; index += 4) {
    assert.ok(SPECTRA.has(`${image.data[index]},${image.data[index + 1]},${image.data[index + 2]}`));
  }

  const rejected = await fetch(`http://127.0.0.1:${appPort}/v1/action?action=next`);
  assert.equal(rejected.status, 401, stderr);

  for (const [action, expectedPage] of [["next", "rooms"], ["prev", "home"], ["systems", "systems"], ["refresh", "systems"]]) {
    const response = await fetch(`http://127.0.0.1:${appPort}/v1/action?action=${action}&token=${token}`);
    assert.equal(response.status, 200, stderr);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.page, expectedPage);
    assert.ok(payload.renderedAt);
    assert.ok(existsSync(imagePath));
  }
});
