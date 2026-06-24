import { TEMPLATE_SLOTS } from "../layout/types";
import type { LayoutDocument, LayoutPage, LayoutTemplate, LayoutWidget, WidgetType } from "../layout/types";

/** Slugify a label into a stable-ish id fragment. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "page"
  );
}

/** Generate a page id unique within `layout`, derived from `label`. */
export function uniquePageId(layout: LayoutDocument, label: string): string {
  const base = slugify(label);
  const existing = new Set(layout.pages.map((p) => p.id));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Generate a widget id unique within `page`, derived from `type`. */
export function uniqueWidgetId(page: LayoutPage, type: WidgetType): string {
  const base = `${page.id}-${slugify(type)}`;
  const existing = new Set(page.widgets.map((w) => w.id));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Slot names for `template` not currently occupied by any widget on `page`. */
export function freeSlots(page: LayoutPage): string[] {
  const used = new Set(page.widgets.map((w) => w.slot));
  const all = TEMPLATE_SLOTS[page.template] ?? [];
  return all.filter((slot) => !used.has(slot));
}

/** All slot names for a template, used to populate the slot dropdown in the inspector. */
export function templateSlots(template: LayoutTemplate): string[] {
  return TEMPLATE_SLOTS[template] ?? [];
}

/** Move element at `index` by `delta` (clamped), returning a new array. */
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** Default options seed per widget type so a freshly added widget renders something sane. */
export function defaultOptionsFor(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case "weatherHero":
      return { eyebrow: "Outside", icon: "CloudSun", showRange: true };
    case "statusStrip":
      return { variant: "mood", icon: "CheckCircle2" };
    case "statTile":
      return { columns: 2, tiles: [] };
    case "entityList":
      return { limit: 6, emptyLabel: "No data" };
    case "agendaList":
      return { variant: "simple", limit: 3, emptyLabel: "No calendar items" };
    case "heroNumber":
      return { limit: 2, emptyLabel: "No data" };
    case "boardHealth":
      return { limit: 5 };
    default:
      return {};
  }
}

/** Build a freshly-constructed widget with sane defaults for `type` placed in `slot`. */
export function buildWidget(page: LayoutPage, type: WidgetType, slot: string): LayoutWidget {
  return {
    id: uniqueWidgetId(page, type),
    type,
    slot,
    options: defaultOptionsFor(type)
  };
}
