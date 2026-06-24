import assert from "node:assert/strict";
import test from "node:test";
import { EE04_SCHEDULE, nextWakeAt, scheduledRefreshesOnLocalDay } from "../lib/schedule.mjs";

const zone = "America/Chicago";

function localDate(year, month, day, hour, minute, second = 0, offset = "-06:00") {
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}${offset}`);
}

function timeInChicago(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(value);
}

test("the normal daily cadence has 42 scheduled refreshes", () => {
  const normalDay = localDate(2026, 1, 15, 12, 0);
  assert.equal(EE04_SCHEDULE.expectedNormalDayRefreshes, 42);
  assert.equal(scheduledRefreshesOnLocalDay(normalDay, zone), 42);
});

test("00:30 rolls to 01:00", () => {
  assert.equal(timeInChicago(nextWakeAt(localDate(2026, 1, 15, 0, 30, 15))), "01:00:15");
});

test("01:00 and 06:00 are hourly overnight boundaries", () => {
  assert.equal(timeInChicago(nextWakeAt(localDate(2026, 1, 15, 1, 0, 15))), "02:00:15");
  assert.equal(timeInChicago(nextWakeAt(localDate(2026, 1, 15, 6, 0, 15))), "07:00:15");
});

test("07:00 and 23:30 are half-hour daytime boundaries", () => {
  assert.equal(timeInChicago(nextWakeAt(localDate(2026, 1, 15, 7, 0, 15))), "07:30:15");
  assert.equal(timeInChicago(nextWakeAt(localDate(2026, 1, 15, 23, 30, 15))), "00:00:15");
});

test("a post-refresh wake still lands on the next boundary plus fifteen seconds", () => {
  assert.equal(timeInChicago(nextWakeAt(localDate(2026, 1, 15, 7, 20, 0))), "07:30:15");
});

test("spring DST skips the nonexistent 02:00 refresh", () => {
  assert.equal(timeInChicago(nextWakeAt(localDate(2026, 3, 8, 1, 0, 15, "-06:00"))), "03:00:15");
});

test("fall DST preserves the repeated 01:00 boundary", () => {
  assert.equal(timeInChicago(nextWakeAt(localDate(2026, 11, 1, 1, 0, 15, "-05:00"))), "01:00:15");
});
