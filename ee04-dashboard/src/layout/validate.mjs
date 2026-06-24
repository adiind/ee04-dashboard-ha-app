/**
 * Plain-JS (JSDoc-typed) validator for the layout contract.
 *
 * This module is intentionally framework-free so it can be imported by
 * both the Vite/TypeScript app (`src/layout/defaultLayout.ts`,
 * `src/App.tsx`) and plain Node scripts (e.g. a future control server)
 * without a build step.
 *
 * @typedef {"black" | "red" | "yellow" | "green" | "blue"} Tone
 *
 * @typedef {"weatherHero" | "statTile" | "entityList" | "agendaList" | "statusStrip" | "heroNumber" | "boardHealth"} WidgetType
 *
 * @typedef {"home-grid" | "rooms-grid" | "climate-grid" | "security-grid" | "agenda-grid" | "systems-grid"} LayoutTemplate
 *
 * @typedef {{ kind: "preset", preset: string }
 *   | { kind: "entity", entityId: string }
 *   | { kind: "entities", entityIds: string[] }} Binding
 *
 * @typedef {Object} LayoutWidget
 * @property {string} id
 * @property {WidgetType} type
 * @property {string} slot
 * @property {Tone} [tone]
 * @property {string} [label]
 * @property {Binding} [binding]
 * @property {Record<string, unknown>} [options]
 *
 * @typedef {Object} LayoutPage
 * @property {string} id
 * @property {string} label
 * @property {string} phrase
 * @property {boolean} enabled
 * @property {LayoutTemplate} template
 * @property {LayoutWidget[]} widgets
 *
 * @typedef {Object} LayoutDocument
 * @property {1} version
 * @property {LayoutPage[]} pages
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} ok
 * @property {string[]} errors
 * @property {LayoutDocument | undefined} layout
 */

/** @type {Tone[]} */
export const TONES = ["black", "red", "yellow", "green", "blue"];

/** @type {WidgetType[]} */
export const WIDGET_TYPES = [
  "weatherHero",
  "statTile",
  "entityList",
  "agendaList",
  "statusStrip",
  "heroNumber",
  "boardHealth"
];

/** @type {LayoutTemplate[]} */
export const LAYOUT_TEMPLATES = [
  "home-grid",
  "rooms-grid",
  "climate-grid",
  "security-grid",
  "agenda-grid",
  "systems-grid"
];

/** @type {Record<LayoutTemplate, string[]>} */
export const TEMPLATE_SLOTS = {
  "home-grid": ["hero", "mood", "tiles", "agenda"],
  "rooms-grid": ["command", "lights", "signal", "status"],
  "climate-grid": ["hero", "tiles", "temp", "humidity"],
  "security-grid": ["hero", "motion", "issues", "offline"],
  "agenda-grid": ["timeline", "transit"],
  "systems-grid": ["hero", "tiles", "network", "battery", "board"]
};

const BINDING_KINDS = ["preset", "entity", "entities"];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * @param {Binding} binding
 * @param {string} path
 * @param {string[]} errors
 */
function validateBinding(binding, path, errors) {
  if (!isPlainObject(binding)) {
    errors.push(`${path}: binding must be an object`);
    return;
  }
  if (!BINDING_KINDS.includes(/** @type {string} */ (binding.kind))) {
    errors.push(`${path}.kind: must be one of ${BINDING_KINDS.join(", ")}`);
    return;
  }
  if (binding.kind === "preset") {
    if (!isNonEmptyString(binding.preset)) {
      errors.push(`${path}.preset: required non-empty string for kind "preset"`);
    }
  } else if (binding.kind === "entity") {
    if (!isNonEmptyString(binding.entityId)) {
      errors.push(`${path}.entityId: required non-empty string for kind "entity"`);
    }
  } else if (binding.kind === "entities") {
    if (!Array.isArray(binding.entityIds) || binding.entityIds.length === 0) {
      errors.push(`${path}.entityIds: required non-empty array for kind "entities"`);
    } else if (!binding.entityIds.every((id) => isNonEmptyString(id))) {
      errors.push(`${path}.entityIds: all entries must be non-empty strings`);
    }
  }
}

/**
 * @param {LayoutWidget} widget
 * @param {string} path
 * @param {LayoutTemplate} template
 * @param {string[]} errors
 */
function validateWidget(widget, path, template, errors) {
  if (!isPlainObject(widget)) {
    errors.push(`${path}: widget must be an object`);
    return;
  }
  if (!isNonEmptyString(widget.id)) {
    errors.push(`${path}.id: required non-empty string`);
  }
  if (!WIDGET_TYPES.includes(/** @type {WidgetType} */ (widget.type))) {
    errors.push(`${path}.type: must be one of ${WIDGET_TYPES.join(", ")}`);
  }
  if (!isNonEmptyString(widget.slot)) {
    errors.push(`${path}.slot: required non-empty string`);
  } else {
    const slots = TEMPLATE_SLOTS[template];
    if (slots && !slots.includes(widget.slot)) {
      errors.push(`${path}.slot: "${widget.slot}" is not a valid slot for template "${template}" (expected one of ${slots.join(", ")})`);
    }
  }
  if (widget.tone !== undefined && !TONES.includes(/** @type {Tone} */ (widget.tone))) {
    errors.push(`${path}.tone: must be one of ${TONES.join(", ")}`);
  }
  if (widget.label !== undefined && typeof widget.label !== "string") {
    errors.push(`${path}.label: must be a string`);
  }
  if (widget.binding !== undefined) {
    validateBinding(widget.binding, `${path}.binding`, errors);
  }
  if (widget.options !== undefined && !isPlainObject(widget.options)) {
    errors.push(`${path}.options: must be an object`);
  }
}

/**
 * @param {LayoutPage} page
 * @param {string} path
 * @param {string[]} errors
 */
function validatePage(page, path, errors) {
  if (!isPlainObject(page)) {
    errors.push(`${path}: page must be an object`);
    return;
  }
  if (!isNonEmptyString(page.id)) {
    errors.push(`${path}.id: required non-empty string`);
  }
  if (!isNonEmptyString(page.label)) {
    errors.push(`${path}.label: required non-empty string`);
  }
  if (typeof page.phrase !== "string") {
    errors.push(`${path}.phrase: required string`);
  }
  if (typeof page.enabled !== "boolean") {
    errors.push(`${path}.enabled: required boolean`);
  }
  /** @type {LayoutTemplate} */
  const template = /** @type {any} */ (page.template);
  if (!LAYOUT_TEMPLATES.includes(template)) {
    errors.push(`${path}.template: must be one of ${LAYOUT_TEMPLATES.join(", ")}`);
  }
  if (!Array.isArray(page.widgets)) {
    errors.push(`${path}.widgets: required array`);
    return;
  }
  const seenIds = new Set();
  page.widgets.forEach((widget, index) => {
    const widgetPath = `${path}.widgets[${index}]`;
    validateWidget(widget, widgetPath, template, errors);
    if (isPlainObject(widget) && isNonEmptyString(widget.id)) {
      if (seenIds.has(widget.id)) {
        errors.push(`${widgetPath}.id: duplicate widget id "${widget.id}" on page "${page.id}"`);
      }
      seenIds.add(widget.id);
    }
  });
}

/**
 * Validate a layout document.
 *
 * @param {unknown} json
 * @returns {ValidationResult}
 */
export function validateLayout(json) {
  /** @type {string[]} */
  const errors = [];

  if (!isPlainObject(json)) {
    return { ok: false, errors: ["layout: root must be an object"], layout: undefined };
  }

  if (json.version !== 1) {
    errors.push("version: must be exactly 1");
  }

  if (!Array.isArray(json.pages) || json.pages.length === 0) {
    errors.push("pages: required non-empty array");
  } else {
    const seenPageIds = new Set();
    json.pages.forEach((page, index) => {
      const path = `pages[${index}]`;
      validatePage(page, path, errors);
      if (isPlainObject(page) && isNonEmptyString(page.id)) {
        if (seenPageIds.has(page.id)) {
          errors.push(`${path}.id: duplicate page id "${page.id}"`);
        }
        seenPageIds.add(page.id);
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors, layout: undefined };
  }

  return { ok: true, errors: [], layout: /** @type {LayoutDocument} */ (json) };
}
