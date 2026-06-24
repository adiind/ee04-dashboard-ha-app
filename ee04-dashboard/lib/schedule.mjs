const DAY_START_HOUR = 7;
const NIGHT_START_HOUR = 1;
const ACTION_DELAY_MS = 15_000;

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function localDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isRefreshBoundary(date, timeZone = "America/Chicago") {
  const { hour, minute, second } = localParts(date, timeZone);
  if (second !== 0) return false;
  if (hour >= DAY_START_HOUR || hour < NIGHT_START_HOUR) return minute === 0 || minute === 30;
  return minute === 0;
}

/**
 * Finds the next physical wake time after a local wall-clock boundary.  The
 * minute-by-minute search intentionally lets Intl handle skipped/repeated DST
 * hours instead of applying an offset that becomes wrong twice a year.
 */
export function nextWakeAt(now = new Date(), timeZone = "America/Chicago", postBoundaryDelayMs = ACTION_DELAY_MS) {
  const start = Math.floor(now.getTime() / 60_000) * 60_000;
  const maxMinutes = 2 * 24 * 60;
  for (let minute = 0; minute <= maxMinutes; minute += 1) {
    const boundary = new Date(start + minute * 60_000);
    if (!isRefreshBoundary(boundary, timeZone)) continue;
    const wake = new Date(boundary.getTime() + postBoundaryDelayMs);
    if (wake.getTime() > now.getTime()) return wake;
  }
  throw new Error("No EE04 wake boundary found in the next 48 hours.");
}

export function scheduledRefreshesOnLocalDay(date, timeZone = "America/Chicago") {
  const targetDay = localDateKey(date, timeZone);
  let count = 0;
  // A 52-hour UTC window safely spans a local day on either DST transition.
  const start = Math.floor(date.getTime() / 60_000) * 60_000 - 26 * 60 * 60_000;
  for (let minute = 0; minute < 52 * 60; minute += 1) {
    const candidate = new Date(start + minute * 60_000);
    if (localDateKey(candidate, timeZone) === targetDay && isRefreshBoundary(candidate, timeZone)) count += 1;
  }
  return count;
}

export const EE04_SCHEDULE = Object.freeze({
  dayStartHour: DAY_START_HOUR,
  nightStartHour: NIGHT_START_HOUR,
  postBoundaryDelaySeconds: ACTION_DELAY_MS / 1000,
  expectedNormalDayRefreshes: 42
});
