import assert from "node:assert/strict";
import test from "node:test";
import { CLEANUP_TIMEOUT_MS, RENDER_TIMEOUT_MS, createRenderQueue } from "../lib/render-queue.mjs";

function hungPromise() {
  return new Promise(() => {});
}

function fakeBrowser({ close = async () => {} } = {}) {
  const child = {
    exitCode: null,
    signal: undefined,
    kill(signal) {
      this.signal = signal;
      this.exitCode = 0;
    }
  };
  return {
    child,
    close,
    process() {
      return child;
    }
  };
}

test("production render and cleanup caps stay bounded", () => {
  assert.equal(RENDER_TIMEOUT_MS, 120_000);
  assert.ok(CLEANUP_TIMEOUT_MS > 0);
  assert.ok(CLEANUP_TIMEOUT_MS <= 10_000);
});

test("a hung screenshot times out, discards the browser, and the next render succeeds", { timeout: 2_000 }, async () => {
  const logs = [];
  const queue = createRenderQueue({
    timeoutMs: 40,
    cleanupTimeoutMs: 30,
    log: (message) => logs.push(message)
  });
  let released = 0;
  const browser = fakeBrowser();
  const started = Date.now();
  const first = queue.enqueue("startup", async (session) => {
    session.release = () => { released += 1; };
    session.browser = browser;
    session.page = { close: async () => {} };
    await hungPromise();
  });

  await assert.rejects(first, /timed out after 40ms/);
  assert.ok(Date.now() - started < 1_000);
  assert.equal(released, 1);
  assert.equal(browser.child.signal, "SIGKILL");
  assert.match(logs.join("\n"), /render start reason=startup/);
  assert.match(logs.join("\n"), /render fail reason=startup durationMs=\d+ error=render timed out after 40ms/);

  const second = await queue.enqueue("refresh", async (session) => {
    session.page = { close: async () => {} };
    session.browser = fakeBrowser();
    return { page: "rooms", renderedAt: "2026-11-01T00:00:00.000Z" };
  });
  assert.equal(second.page, "rooms");
  assert.match(logs.join("\n"), /render finish reason=refresh durationMs=\d+ page=rooms/);
});

test("a hung page.close is time-boxed and a later render succeeds", { timeout: 2_000 }, async () => {
  const logs = [];
  const queue = createRenderQueue({
    timeoutMs: 500,
    cleanupTimeoutMs: 30,
    log: (message) => logs.push(message)
  });
  const browser = fakeBrowser({ close: () => hungPromise() });
  const started = Date.now();
  const first = await queue.enqueue("startup", async (session) => {
    session.browser = browser;
    session.page = { close: () => hungPromise() };
    return { page: "home", renderedAt: "2026-11-01T00:30:00.000Z" };
  });

  assert.equal(first.page, "home");
  assert.ok(Date.now() - started < 1_000);
  assert.equal(browser.child.signal, "SIGKILL");
  assert.match(logs.join("\n"), /page close timed out/);
  assert.match(logs.join("\n"), /render finish reason=startup durationMs=\d+ page=home/);

  const second = await queue.enqueue("schedule", async () => ({ page: "home" }));
  assert.equal(second.page, "home");
});
