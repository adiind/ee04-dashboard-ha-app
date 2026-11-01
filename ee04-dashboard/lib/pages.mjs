export const PAGES = ["briefing", "home", "rooms", "climate", "security", "agenda", "systems"];
export const DEFAULT_PAGE = "briefing";

export function normalizePage(page) {
  return PAGES.includes(page) ? page : DEFAULT_PAGE;
}

export function pageAfterAction(page, action) {
  const current = normalizePage(page);
  if (action === "prev") return PAGES[(PAGES.indexOf(current) + PAGES.length - 1) % PAGES.length];
  if (action === "next") return PAGES[(PAGES.indexOf(current) + 1) % PAGES.length];
  if (action === "systems") return "systems";
  return current;
}
