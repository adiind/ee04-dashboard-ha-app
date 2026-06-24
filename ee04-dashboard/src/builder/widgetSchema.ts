import { ICONS } from "../widgets/icons";
import type { WidgetType } from "../layout/types";

/**
 * Honest, hand-enumerated description of the `options` fields each widget
 * type actually reads (see `src/widgets/Widgets.tsx`). Drives the
 * inspector's key/value options editor. Fields not listed here are left
 * untouched on the widget (so hand-authored layouts with extra options
 * round-trip), but the editor only offers UI for the fields below.
 */
export type OptionFieldType = "string" | "number" | "boolean" | "icon" | "select";

export type OptionFieldSchema = {
  key: string;
  label: string;
  type: OptionFieldType;
  /** For `select` fields. */
  choices?: string[];
  /** Default shown when the option is absent. */
  placeholder?: string;
};

/** Icon names available to `icon`-type option fields, from the shared icon registry. */
export const ICON_NAMES: string[] = Object.keys(ICONS).sort();

const STATUS_STRIP_VARIANTS = ["mood", "roomCommand", "roomStatus", "fort", "systemsHero"];
const AGENDA_VARIANTS = ["simple", "timeline"];
const ENTITY_LIST_VARIANTS = ["", "printerOrUnavailable"];

/**
 * Per-widget-type option field schemas. `statTile`'s `tiles` array is a
 * structured list of `{ preset, icon, label, tone }` entries, edited
 * separately (see `TileListEditor`) rather than as a flat key/value pair.
 */
export const WIDGET_OPTION_FIELDS: Record<WidgetType, OptionFieldSchema[]> = {
  weatherHero: [
    { key: "eyebrow", label: "Eyebrow", type: "string", placeholder: "Outside" },
    { key: "icon", label: "Icon", type: "icon" },
    { key: "showRange", label: "Show high/low range", type: "boolean" },
    { key: "compact", label: "Compact", type: "boolean" }
  ],
  statusStrip: [
    { key: "variant", label: "Variant", type: "select", choices: STATUS_STRIP_VARIANTS },
    { key: "eyebrow", label: "Eyebrow", type: "string" },
    { key: "icon", label: "Icon", type: "icon" },
    { key: "iconCalm", label: "Icon (calm)", type: "icon" },
    { key: "iconWarning", label: "Icon (warning)", type: "icon" }
  ],
  statTile: [{ key: "columns", label: "Columns", type: "number", placeholder: "1" }],
  entityList: [
    { key: "variant", label: "Variant", type: "select", choices: ENTITY_LIST_VARIANTS },
    { key: "icon", label: "Icon", type: "icon" },
    { key: "iconPrimary", label: "Icon (primary)", type: "icon" },
    { key: "iconFallback", label: "Icon (fallback)", type: "icon" },
    { key: "labelPrimary", label: "Label (primary)", type: "string" },
    { key: "labelFallback", label: "Label (fallback)", type: "string" },
    { key: "limit", label: "Limit", type: "number", placeholder: "6" },
    { key: "emptyLabel", label: "Empty label", type: "string", placeholder: "No data" }
  ],
  agendaList: [
    { key: "variant", label: "Variant", type: "select", choices: AGENDA_VARIANTS },
    { key: "limit", label: "Limit", type: "number", placeholder: "3" },
    { key: "icon", label: "Icon", type: "icon" },
    { key: "emptyLabel", label: "Empty label", type: "string", placeholder: "No calendar items" }
  ],
  heroNumber: [
    { key: "limit", label: "Limit", type: "number", placeholder: "2" },
    { key: "icon", label: "Icon", type: "icon" },
    { key: "emptyLabel", label: "Empty label", type: "string", placeholder: "No data" }
  ],
  boardHealth: [
    { key: "icon", label: "Icon", type: "icon" },
    { key: "limit", label: "Limit", type: "number", placeholder: "5" }
  ]
};

/** `statTile` is the only widget type whose options include a structured `tiles` list. */
export function widgetSupportsTiles(type: WidgetType): boolean {
  return type === "statTile";
}
