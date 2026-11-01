// page.close() has no Playwright timeout. Chromium can ack Target.closeTarget
// and never detach the target, so an awaited close stays pending forever and
// the rejection from an earlier timeout never escapes. Bound the job and the
// cleanup so one stuck render cannot hold the queue.

export const RENDER_TIMEOUT_MS = 120_000;
export const CLEANUP_TIMEOUT_MS = 5_000;

export function createRenderQueue({
  timeoutMs = RENDER_TIMEOUT_MS,
  cleanupTimeoutMs = CLEANUP_TIMEOUT_MS,
  log = (message) => console.log(`[ee04-dashboard] ${message}`)
} = {}) {
  let tail = Promise.resolve();

  function enqueue(reason, run) {
    const job = tail.then(() => runJob(reason, run));
    tail = job.then(() => undefined, () => undefined);
    return job;
  }

  async function runJob(reason, run) {
    const started = Date.now();
    const session = {};
    let timer;
    let failed = false;
    log(`render start reason=${reason}`);
    const work = Promise.resolve().then(() => run(session));
    work.catch(() => undefined);
    try {
      const result = await Promise.race([
        work,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`render timed out after ${timeoutMs}ms`)), timeoutMs);
        })
      ]);
      log(`render finish reason=${reason} durationMs=${Date.now() - started}${describeResult(result)}`);
      return result;
    } catch (error) {
      failed = true;
      const message = String(error?.message || error).split("\n")[0];
      log(`render fail reason=${reason} durationMs=${Date.now() - started} error=${message}`);
      throw error;
    } finally {
      clearTimeout(timer);
      try {
        const closed = await closeWithin(session.page, cleanupTimeoutMs, log, "page close");
        if (failed || !closed) await discardBrowser(session, cleanupTimeoutMs, log);
      } catch (error) {
        log(`cleanup failed: ${error.message}`);
      }
    }
  }

  return { enqueue };
}

function describeResult(result) {
  if (!result || typeof result !== "object") return "";
  const page = result.page ? ` page=${result.page}` : "";
  const renderedAt = result.renderedAt ? ` renderedAt=${result.renderedAt}` : "";
  return `${page}${renderedAt}`;
}

async function closeWithin(target, timeoutMs, log, label) {
  if (!target || typeof target.close !== "function") return true;
  let timedOut = false;
  let timer;
  const closing = Promise.resolve()
    .then(() => target.close())
    .then(() => undefined, (error) => {
      log(`${label} failed: ${error.message}`);
    });
  try {
    await Promise.race([
      closing,
      new Promise((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) log(`${label} timed out after ${timeoutMs}ms`);
  return !timedOut;
}

async function discardBrowser(session, timeoutMs, log) {
  const release = session.release;
  session.release = undefined;
  release?.();
  const browser = session.browser;
  session.browser = undefined;
  session.page = undefined;
  if (!browser || browser.discarded) return;
  browser.discarded = true;
  await closeWithin(browser, timeoutMs, log, "browser close");
  const child = typeof browser.process === "function" ? browser.process() : undefined;
  if (!child || child.exitCode != null || typeof child.kill !== "function") return;
  try {
    child.kill("SIGKILL");
    log("killed chromium after discarding the browser");
  } catch (error) {
    log(`chromium kill failed: ${error.message}`);
  }
}
