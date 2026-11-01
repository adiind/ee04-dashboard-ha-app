import assert from "node:assert/strict";
import test from "node:test";
import { BRIEFING_IDLE_MS, resolvePageState } from "../lib/pages.mjs";

const MINUTE = 60 * 1000;

function at(ms) {
  return new Date(Date.parse("2026-11-01T18:00:00.000Z") + ms);
}

test("the idle window is 10 minutes", () => {
  assert.equal(BRIEFING_IDLE_MS, 10 * MINUTE);
});

test("startup with no saved page uses briefing", () => {
  const state = resolvePageState(null, "startup", at(0));
  assert.equal(state.page, "briefing");
  assert.equal(state.lastButtonAt, null);
});

test("a saved page with no button timestamp is stale", () => {
  const saved = { page: "systems", updatedAt: "2026-01-01T00:00:00.000Z", reason: "next" };
  assert.equal(resolvePageState(saved, "startup", at(0)).page, "briefing");
  assert.equal(resolvePageState(saved, "refresh", at(0)).page, "briefing");
  assert.equal(resolvePageState(saved, "schedule", at(0)).page, "briefing");
});

test("a wake within 10 minutes of a button keeps the page", () => {
  const pressed = resolvePageState({ page: "briefing" }, "next", at(0));
  assert.equal(pressed.page, "home");
  const held = resolvePageState(pressed, "refresh", at(10 * MINUTE));
  assert.equal(held.page, "home");
  assert.equal(held.lastButtonAt, pressed.lastButtonAt);
  const scheduled = resolvePageState(pressed, "schedule", at(10 * MINUTE));
  assert.equal(scheduled.page, "home");
});

test("a wake more than 10 minutes after the last button returns to briefing", () => {
  const pressed = resolvePageState({ page: "briefing" }, "systems", at(0));
  assert.equal(pressed.page, "systems");
  const reset = resolvePageState(pressed, "schedule", at(10 * MINUTE + 1));
  assert.equal(reset.page, "briefing");
  assert.equal(reset.lastButtonAt, pressed.lastButtonAt);
  assert.equal(resolvePageState(pressed, "refresh", at(10 * MINUTE + 1)).page, "briefing");
});

test("Prev and Next keep working and each press restarts the 10 minutes", () => {
  let state = resolvePageState(null, "startup", at(0));
  state = resolvePageState(state, "next", at(0));
  assert.equal(state.page, "home");
  state = resolvePageState(state, "next", at(9 * MINUTE));
  assert.equal(state.page, "rooms");
  state = resolvePageState(state, "prev", at(9 * MINUTE));
  assert.equal(state.page, "home");
  const stillThere = resolvePageState(state, "refresh", at(9 * MINUTE + 10 * MINUTE));
  assert.equal(stillThere.page, "home");
  const expired = resolvePageState(state, "schedule", at(9 * MINUTE + 10 * MINUTE + 1));
  assert.equal(expired.page, "briefing");
});

test("a recent button timestamp survives startup and an old one does not", () => {
  const recent = {
    page: "rooms",
    lastButtonAt: at(0).toISOString(),
    updatedAt: at(0).toISOString(),
    reason: "next"
  };
  assert.equal(resolvePageState(recent, "startup", at(5 * MINUTE)).page, "rooms");
  assert.equal(resolvePageState(recent, "startup", at(10 * MINUTE + 1)).page, "briefing");
});
