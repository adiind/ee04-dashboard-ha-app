import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

export const BRIEFING_TIMEOUT_MS = 60_000;

export function briefingTimeoutMs(env = process.env) {
  const raw = env.EE04_BRIEFING_TIMEOUT_MS;
  if (raw == null || raw === "") return BRIEFING_TIMEOUT_MS;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return BRIEFING_TIMEOUT_MS;
  return parsed;
}

export function briefingArgs(script, outPath) {
  return [script, "--out", outPath];
}

export function bindBriefingChild(session, child) {
  session.cancel = () => {
    if (!child || child.killed || child.exitCode != null || child.signalCode != null) return;
    child.kill("SIGKILL");
  };
}

export function runBriefingRender({
  execFile,
  script,
  outPath,
  timeoutMs = BRIEFING_TIMEOUT_MS,
  env = process.env,
  onChild
}) {
  return new Promise((resolve, reject) => {
    const child = execFile("python3", briefingArgs(script, outPath), {
      timeout: timeoutMs,
      env: { ...env, HA_SOCKS: "" }
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout: stdout || "", stderr: stderr || "" });
    });
    if (onChild) onChild(child);
  });
}

export function temporaryImagePath(imagePath) {
  return `${imagePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
}

function firstLine(error) {
  return String(error?.message || error).split("\n")[0];
}

export async function renderEpaperImage({
  page,
  imagePath,
  renderBriefing,
  renderQuantized,
  log = () => {},
  session = {}
}) {
  await mkdir(dirname(imagePath), { recursive: true });
  const temporary = temporaryImagePath(imagePath);
  let committed = false;
  try {
    let drawn = page;
    if (page === "briefing") {
      try {
        await renderBriefing({ outPath: temporary, session });
        await rename(temporary, imagePath);
        committed = true;
        return { page: "briefing", imagePath, quantized: false };
      } catch (error) {
        await rm(temporary, { force: true });
        if (session.abandoned) throw error;
        log(`briefing render failed: ${firstLine(error)}; falling back to home`);
        drawn = "home";
      }
    }
    await renderQuantized({ outPath: temporary, page: drawn, session });
    await rename(temporary, imagePath);
    committed = true;
    return { page: drawn, imagePath, quantized: true };
  } finally {
    if (!committed) await rm(temporary, { force: true });
  }
}
