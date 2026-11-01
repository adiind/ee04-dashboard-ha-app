import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BRIEFING_TIMEOUT_MS, briefingTimeoutMs, renderEpaperImage, runBriefingRender } from "../lib/briefing.mjs";
import { DEFAULT_PAGE, PAGES, normalizePage, pageAfterAction } from "../lib/pages.mjs";
import { RENDER_TIMEOUT_MS, createRenderQueue } from "../lib/render-queue.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

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

test("briefing is the default page and prev/next still reach every dashboard page", () => {
  assert.deepEqual(PAGES, ["briefing", "home", "rooms", "climate", "security", "agenda", "systems"]);
  assert.equal(DEFAULT_PAGE, "briefing");
  assert.equal(PAGES[0], DEFAULT_PAGE);
  assert.equal(normalizePage(undefined), "briefing");
  assert.equal(normalizePage("missing"), "briefing");
  assert.equal(normalizePage("agenda"), "agenda");
  assert.equal(pageAfterAction("briefing", "next"), "home");
  assert.equal(pageAfterAction("home", "prev"), "briefing");
  assert.equal(pageAfterAction("briefing", "prev"), "systems");
  assert.equal(pageAfterAction("systems", "next"), "briefing");
  assert.equal(pageAfterAction("security", "next"), "agenda");
  assert.equal(pageAfterAction("rooms", "systems"), "systems");
  assert.equal(pageAfterAction("climate", "refresh"), "climate");

  let page = DEFAULT_PAGE;
  const seen = [page];
  for (let step = 0; step < PAGES.length; step += 1) {
    page = pageAfterAction(page, "next");
    seen.push(page);
  }
  assert.deepEqual(seen, [...PAGES, DEFAULT_PAGE]);
});

test("the briefing renderer times out inside the 120s job cap", () => {
  assert.equal(BRIEFING_TIMEOUT_MS, 60_000);
  assert.equal(briefingTimeoutMs({}), 60_000);
  assert.equal(briefingTimeoutMs({ EE04_BRIEFING_TIMEOUT_MS: "1500" }), 1_500);
  assert.equal(briefingTimeoutMs({ EE04_BRIEFING_TIMEOUT_MS: "0" }), 60_000);
  assert.equal(briefingTimeoutMs({ EE04_BRIEFING_TIMEOUT_MS: "nope" }), 60_000);
  assert.ok(BRIEFING_TIMEOUT_MS < RENDER_TIMEOUT_MS);
});

test("a successful briefing is renamed into place without the colour conversion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ee04-briefing-ok-"));
  const imagePath = join(dir, "dashboard-spectra.png");
  await writeFile(imagePath, "OLD");
  let quantized = false;
  const result = await renderEpaperImage({
    page: "briefing",
    imagePath,
    renderBriefing: async ({ outPath }) => {
      assert.equal(await readFile(imagePath, "utf8"), "OLD");
      assert.notEqual(outPath, imagePath);
      await writeFile(outPath, "BRIEFING-PNG");
    },
    renderQuantized: async () => {
      quantized = true;
    }
  });
  assert.equal(quantized, false);
  assert.equal(result.quantized, false);
  assert.equal(result.page, "briefing");
  assert.equal(await readFile(imagePath, "utf8"), "BRIEFING-PNG");
  assert.deepEqual(await readdir(dir), ["dashboard-spectra.png"]);
  await rm(dir, { recursive: true, force: true });
});

test("a failed or timed-out briefing falls back to home and swaps that image atomically", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ee04-briefing-fail-"));
  const imagePath = join(dir, "dashboard-spectra.png");
  await writeFile(imagePath, "OLD");
  const script = join(dir, "render.py");
  const envPath = join(dir, "socks.txt");
  await writeFile(script, `import os, pathlib, sys, time
out = sys.argv[sys.argv.index("--out") + 1]
pathlib.Path(${JSON.stringify(envPath)}).write_text(os.environ.get("HA_SOCKS", "<unset>"))
pathlib.Path(out).write_text("PARTIAL")
time.sleep(30)
`);
  const logs = [];
  const started = Date.now();
  let sawPrevious = false;
  const result = await renderEpaperImage({
    page: "briefing",
    imagePath,
    log: (message) => logs.push(message),
    renderBriefing: ({ outPath }) => runBriefingRender({
      execFile,
      script,
      outPath,
      timeoutMs: 400,
      env: { ...process.env, HA_SOCKS: "socks5h://127.0.0.1:1055", SUPERVISOR_TOKEN: "not-in-argv" }
    }),
    renderQuantized: async ({ outPath, page }) => {
      sawPrevious = await readFile(imagePath, "utf8") === "OLD";
      assert.equal(page, "home");
      assert.equal(existsSync(outPath), false);
      await writeFile(outPath, "HOME-PNG");
    }
  });
  assert.ok(Date.now() - started < 5_000);
  assert.equal(sawPrevious, true);
  assert.equal(result.page, "home");
  assert.equal(result.quantized, true);
  assert.equal(await readFile(imagePath, "utf8"), "HOME-PNG");
  assert.equal(await readFile(envPath, "utf8"), "");
  assert.match(logs.join("\n"), /briefing render failed: .*falling back to home/);
  const names = await readdir(dir);
  assert.equal(names.some((name) => name.includes(".tmp")), false);
  await rm(dir, { recursive: true, force: true });
});

test("a briefing exit failure keeps the published image until the home render is renamed in", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ee04-briefing-exit-"));
  const imagePath = join(dir, "dashboard-spectra.png");
  await writeFile(imagePath, "OLD");
  const logs = [];
  const result = await renderEpaperImage({
    page: "briefing",
    imagePath,
    log: (message) => logs.push(message),
    renderBriefing: async ({ outPath }) => {
      await writeFile(outPath, "PARTIAL");
      throw new Error("render.py exited 1");
    },
    renderQuantized: async ({ outPath, page }) => {
      assert.equal(page, "home");
      assert.equal(await readFile(imagePath, "utf8"), "OLD");
      assert.equal(existsSync(outPath), false);
      await writeFile(outPath, "HOME-PNG");
    }
  });
  assert.equal(result.page, "home");
  assert.equal(await readFile(imagePath, "utf8"), "HOME-PNG");
  assert.match(logs.join("\n"), /falling back to home/);
  await rm(dir, { recursive: true, force: true });
});

test("an abandoned briefing job does not start the home fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ee04-briefing-abandon-"));
  const imagePath = join(dir, "dashboard-spectra.png");
  await writeFile(imagePath, "OLD");
  const logs = [];
  let cancelled = 0;
  let fallback = 0;
  const queue = createRenderQueue({ timeoutMs: 40, cleanupTimeoutMs: 20, log() {} });
  const job = queue.enqueue("startup", (session) => renderEpaperImage({
    page: "briefing",
    imagePath,
    session,
    log: (message) => logs.push(message),
    renderBriefing: () => new Promise((resolve, reject) => {
      session.cancel = () => {
        cancelled += 1;
        reject(new Error("killed"));
      };
    }),
    renderQuantized: async () => {
      fallback += 1;
    }
  }));
  await assert.rejects(job, /timed out after 40ms/);
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(cancelled, 1);
  assert.equal(fallback, 0);
  assert.equal(logs.some((line) => line.includes("falling back to home")), false);
  assert.equal(await readFile(imagePath, "utf8"), "OLD");
  const second = await queue.enqueue("refresh", async () => ({ page: "home" }));
  assert.equal(second.page, "home");
  await rm(dir, { recursive: true, force: true });
});

test("the server publishes the briefing bytes unchanged and keeps prev/next on failure", { timeout: 20_000 }, async (t) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "ee04-briefing-server-"));
  const bin = join(stateRoot, "bin");
  const modePath = join(stateRoot, "mode");
  const argvPath = join(stateRoot, "argv.txt");
  const socksPath = join(stateRoot, "socks.txt");
  const imagePath = join(stateRoot, "dashboard-spectra.png");
  const optionsPath = join(stateRoot, "options.json");
  await writeFile(modePath, "ok\n");
  const stub = `#!/bin/sh
printf '%s\\n' "$@" > ${JSON.stringify(argvPath)}
printf '%s' "$HA_SOCKS" > ${JSON.stringify(socksPath)}
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--out" ]; then
    out=$arg
  fi
  prev=$arg
done
mode=$(cat ${JSON.stringify(modePath)} 2>/dev/null || echo ok)
if [ "$mode" = "fail" ]; then
  printf 'PARTIAL' > "$out"
  echo briefing-failed >&2
  exit 1
fi
if [ "$mode" = "sleep" ]; then
  exec sleep 30
fi
printf 'BRIEFING-PNG' > "$out"
exit 0
`;
  await mkdir(bin);
  await writeFile(join(bin, "python3"), stub);
  await chmod(join(bin, "python3"), 0o755);
  const token = randomBytes(32).toString("base64url");
  await writeFile(optionsPath, JSON.stringify({ action_token: token, timezone: "America/Chicago" }));
  const supervisor = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const payload = url.pathname === "/core/api/states" ? [] : [];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  const supervisorPort = await listen(supervisor);
  const appPort = 20_000 + Math.floor(Math.random() * 10_000);
  let output = "";
  const child = spawn(process.execPath, ["dashboard-server.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH || ""}`,
      CHROMIUM_PATH: join(stateRoot, "missing-chromium"),
      EE04_APP_ROOT: ROOT,
      EE04_BRIEFING_TIMEOUT_MS: "500",
      EE04_IMAGE_PATH: imagePath,
      EE04_OPTIONS_PATH: optionsPath,
      EE04_PORT: String(appPort),
      EE04_STATE_DIR: join(stateRoot, "state"),
      EE04_SUPERVISOR_URL: `http://127.0.0.1:${supervisorPort}`,
      SUPERVISOR_TOKEN: "test-token"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  t.after(async () => {
    await stop(child);
    await close(supervisor);
    await rm(stateRoot, { recursive: true, force: true });
  });

  const health = async () => (await fetch(`http://127.0.0.1:${appPort}/health`)).json();
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (existsSync(imagePath)) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
  }
  assert.equal(await readFile(imagePath, "utf8"), "BRIEFING-PNG", output);
  assert.equal((await health()).page, "briefing");
  const argv = await readFile(argvPath, "utf8");
  assert.match(argv, /briefing\/render\.py/);
  assert.match(argv, /--out/);
  assert.equal(await readFile(socksPath, "utf8"), "");

  await writeFile(modePath, "fail");
  const failed = await fetch(`http://127.0.0.1:${appPort}/v1/action?action=refresh&token=${token}`);
  assert.equal(failed.status, 503, output);
  assert.equal(await readFile(imagePath, "utf8"), "BRIEFING-PNG");
  assert.match(output, /falling back to home/);
  assert.equal((await health()).page, "briefing");

  await writeFile(modePath, "sleep");
  const started = Date.now();
  const timedOut = await fetch(`http://127.0.0.1:${appPort}/v1/action?action=refresh&token=${token}`);
  assert.ok(Date.now() - started < 5_000, output);
  assert.equal(timedOut.status, 503, output);
  assert.equal(await readFile(imagePath, "utf8"), "BRIEFING-PNG");
  assert.equal((await health()).page, "briefing");
  assert.match(output, /render fail reason=refresh/);

  await writeFile(modePath, "ok");
  for (const [action, expectedPage, status] of [
    ["next", "home", 503],
    ["next", "rooms", 503],
    ["prev", "home", 503],
    ["prev", "briefing", 200],
    ["prev", "systems", 503]
  ]) {
    const response = await fetch(`http://127.0.0.1:${appPort}/v1/action?action=${action}&token=${token}`);
    assert.equal(response.status, status, output);
    assert.equal((await health()).page, expectedPage, output);
  }
  const drawn = await (await fetch(`http://127.0.0.1:${appPort}/v1/action?action=next&token=${token}`)).json();
  assert.equal(drawn.page, "briefing");
  assert.equal(drawn.quantized, false);
  assert.equal(await readFile(imagePath, "utf8"), "BRIEFING-PNG");
});
