/**
 * Layout contract (v1).
 *
 * `public/data/layout.json` is the runtime source of truth for which pages
 * exist, their order (which drives previous/next navigation), and which
 * widgets render in which named template slots.
 *
 * The renderer (`src/App.tsx` and friends) fetches this file at runtime,
 * validates it with `src/layout/validate.mjs`, and falls back to the
 * built-in seed (`src/layout/defaultLayout.ts`) on missing/invalid layout.
 */

/** Six-color Spectra-friendly accent tones used by widgets. */
export type Tone = "black" | "red" | "yellow" | "green" | "blue";

/**
 * Curated v1 widget types. Keep this list small: extend a widget's
 * `options` to cover new presentation needs before adding a new type.
 */
export type WidgetType =
  | "weatherHero"
  | "statTile"
  | "entityList"
  | "agendaList"
  | "statusStrip"
  | "heroNumber"
  | "boardHealth";

/**
 * Named CSS-grid arrangements. Each template defines a fixed set of named
 * slots (matching `grid-template-areas` in `src/styles.css`); widgets
 * reference slots by name. No freeform x/y positioning.
 */
export type LayoutTemplate =
  | "home-grid"
  | "rooms-grid"
  | "climate-grid"
  | "security-grid"
  | "agenda-grid"
  | "systems-grid";

/** Slot names per template. Used for validation only (informational). */
export const TEMPLATE_SLOTS: Record<LayoutTemplate, string[]> = {
  "home-grid": ["hero", "mood", "tiles", "agenda"],
  "rooms-grid": ["command", "lights", "signal", "status"],
  "climate-grid": ["hero", "tiles", "temp", "humidity"],
  "security-grid": ["hero", "motion", "issues", "offline"],
  "agenda-grid": ["timeline", "transit"],
  "systems-grid": ["hero", "tiles", "network", "battery", "board"]
};

export const WIDGET_TYPES: WidgetType[] = [
  "weatherHero",
  "statTile",
  "entityList",
  "agendaList",
  "statusStrip",
  "heroNumber",
  "boardHealth"
];

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  "home-grid",
  "rooms-grid",
  "climate-grid",
  "security-grid",
  "agenda-grid",
  "systems-grid"
];

export const TONES: Tone[] = ["black", "red", "yellow", "green", "blue"];

/**
 * A binding describes where a widget's data comes from.
 *
 * - `preset`: a named path/derivation against the summarized
 *   `DashboardData` produced by `useDashboardData` (see
 *   `src/lib/layoutPresets.ts` for the resolver). Presets may be simple
 *   field paths (e.g. `"weather"`) or small named derivations that mirror
 *   the logic the hard-coded pages used to compute inline (e.g.
 *   `"rooms.signal"`).
 * - `entity` / `entities`: raw Home Assistant entity ids resolved against
 *   the entity catalog at `public/data/entities.json`. These bindings must
 *   render a graceful "no data" placeholder when the catalog or the entity
 *   is missing.
 */
export type Binding =
  | { kind: "preset"; preset: string }
  | { kind: "entity"; entityId: string }
  | { kind: "entities"; entityIds: string[] };

/** A single widget placed into a named slot of the page's template. */
export type LayoutWidget = {
  /** Stable identifier, unique within the page. */
  id: string;
  type: WidgetType;
  /** Slot name from the page's template (see `TEMPLATE_SLOTS`). */
  slot: string;
  /** Optional accent tone; widget-type specific defaults apply if absent. */
  tone?: Tone;
  /** Optional display label (section title, panel heading, etc). */
  label?: string;
  /** Optional data binding; widgets without bindings use static/derived display only. */
  binding?: Binding;
  /** Widget-type specific presentation/behavior options. */
  options?: Record<string, unknown>;
};

/** A single dashboard page. Order in `pages[]` drives prev/next navigation. */
export type LayoutPage = {
  /** Stable page identifier (used by page-state.json and ?page= query). */
  id: string;
  /** Short label shown in the top bar title. */
  label: string;
  /** Short eyebrow phrase shown above the page label. */
  phrase: string;
  /** Disabled pages are skipped in navigation and not rendered. */
  enabled: boolean;
  /** Named CSS-grid arrangement for this page. */
  template: LayoutTemplate;
  /** Widgets placed into the template's named slots. */
  widgets: LayoutWidget[];
};

/** Top-level layout document. */
export type LayoutDocument = {
  version: 1;
  pages: LayoutPage[];
};
