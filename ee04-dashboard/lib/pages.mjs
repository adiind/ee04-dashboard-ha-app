export const PAGES = ["briefing", "home", "rooms", "climate", "security", "agenda", "systems"];
export const DEFAULT_PAGE = "briefing";
export const BRIEFING_IDLE_MS = 10 * 60 * 1000;

export function normalizePage(page) {
  return PAGES.includes(page) ? page : DEFAULT_PAGE;
}

export function buttonIsFresh(lastButtonAt, now, idleMs = BRIEFING_IDLE_MS) {
  const pressedAt = Date.parse(lastButtonAt ?? "");
  if (!Number.isFinite(pressedAt)) return false;
  return now.getTime() - pressedAt <= idleMs;
}

export function resolvePageState(state, reason, now, idleMs = BRIEFING_IDLE_MS) {
  if (reason === "prev" || reason === "next" || reason === "systems") {
    const at = now.toISOString();
    return {
      page: pageAfterAction(state?.page, reason),
      lastButtonAt: at,
      updatedAt: at,
      reason
    };
  }
  const lastButtonAt = typeof state?.lastButtonAt === "string" && Number.isFinite(Date.parse(state.lastButtonAt))
    ? state.lastButtonAt
    : null;
  const savedPage = PAGES.includes(state?.page) ? state.page : DEFAULT_PAGE;
  if (savedPage === DEFAULT_PAGE || buttonIsFresh(lastButtonAt, now, idleMs)) {
    return {
      page: savedPage,
      lastButtonAt,
      updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : now.toISOString(),
      reason: typeof state?.reason === "string" ? state.reason : reason
    };
  }
  return {
    page: DEFAULT_PAGE,
    lastButtonAt,
    updatedAt: now.toISOString(),
    reason: reason === "startup" ? "startup" : "briefing-return"
  };
}

export function pageAfterAction(page, action) {
  const current = normalizePage(page);
  if (action === "prev") return PAGES[(PAGES.indexOf(current) + PAGES.length - 1) % PAGES.length];
  if (action === "next") return PAGES[(PAGES.indexOf(current) + 1) % PAGES.length];
  if (action === "systems") return "systems";
  return current;
}
