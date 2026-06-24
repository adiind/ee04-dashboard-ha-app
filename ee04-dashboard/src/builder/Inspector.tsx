import { useState } from "react";
import { Trash2 } from "lucide-react";
import { TONES } from "../layout/types";
import type { Binding, LayoutDocument, LayoutPage, LayoutWidget, Tone } from "../layout/types";
import type { EntityCatalog } from "../lib/useEntityCatalog";
import { LAYOUT_PRESETS } from "../lib/layoutPresets";
import { ICON_NAMES, WIDGET_OPTION_FIELDS, widgetSupportsTiles } from "./widgetSchema";
import { templateSlots } from "./layoutOps";
import { EntityPicker } from "./EntityPicker";
import { Confirm } from "./Confirm";

type TileSpec = { preset?: string; icon?: string; label?: string; tone?: Tone };

const TONE_OPTIONS: Array<Tone | "none"> = ["none", "black", "red", "yellow", "green", "blue"];

export function Inspector({
  layout,
  page,
  widget,
  catalog,
  onChange,
  onRemoveWidget
}: {
  layout: LayoutDocument;
  page: LayoutPage | undefined;
  widget: LayoutWidget | undefined;
  catalog: EntityCatalog | undefined;
  onChange: (layout: LayoutDocument) => void;
  onRemoveWidget: (widgetId: string) => void;
}) {
  const [pendingRemove, setPendingRemove] = useState(false);

  if (!page || !widget) {
    return (
      <div className="pane">
        <h2>Inspector</h2>
        <div className="inspector-empty">Select a widget on the page to edit it.</div>
      </div>
    );
  }

  function updateWidget(patch: Partial<LayoutWidget>) {
    const pages = layout.pages.map((p) =>
      p.id === page!.id
        ? { ...p, widgets: p.widgets.map((w) => (w.id === widget!.id ? { ...w, ...patch } : w)) }
        : p
    );
    onChange({ ...layout, pages });
  }

  function updateOptions(patch: Record<string, unknown>) {
    const options = { ...(widget!.options ?? {}), ...patch };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete options[key];
    }
    updateWidget({ options });
  }

  function setBindingKind(kind: Binding["kind"] | "none") {
    if (kind === "none") {
      updateWidget({ binding: undefined });
      return;
    }
    if (kind === "preset") {
      updateWidget({ binding: { kind: "preset", preset: LAYOUT_PRESETS[0] } });
      return;
    }
    if (kind === "entity") {
      updateWidget({ binding: { kind: "entity", entityId: "" } });
      return;
    }
    updateWidget({ binding: { kind: "entities", entityIds: [] } });
  }

  const slots = templateSlots(page.template);
  const fields = WIDGET_OPTION_FIELDS[widget.type] ?? [];
  const options = widget.options ?? {};
  const binding = widget.binding;

  return (
    <div className="pane">
      <h2>Inspector</h2>

      <div className="field">
        <label>Type</label>
        <input type="text" value={widget.type} disabled />
      </div>

      <div className="field">
        <label>Slot</label>
        <select value={widget.slot} onChange={(e) => updateWidget({ slot: e.target.value })}>
          {slots.map((slot) => (
            <option key={slot} value={slot} disabled={slot !== widget.slot && page.widgets.some((w) => w.slot === slot)}>
              {slot}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Tone</label>
        <div className="tone-swatches">
          {TONE_OPTIONS.map((tone) => (
            <button
              key={tone}
              type="button"
              className={`tone-swatch${(widget.tone ?? "none") === tone ? " selected" : ""}`}
              data-tone={tone}
              title={tone}
              onClick={() => updateWidget({ tone: tone === "none" ? undefined : (tone as Tone) })}
              aria-label={`Tone ${tone}`}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label>Label</label>
        <input
          type="text"
          value={widget.label ?? ""}
          onChange={(e) => updateWidget({ label: e.target.value || undefined })}
          placeholder="(optional section heading)"
        />
      </div>

      <hr className="section-divider" />

      <h2>Binding</h2>
      <div className="binding-kind-row">
        {(["none", "preset", "entity", "entities"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={(binding?.kind ?? "none") === kind ? "active" : ""}
            onClick={() => setBindingKind(kind)}
          >
            {kind}
          </button>
        ))}
      </div>

      {binding?.kind === "preset" && (
        <div className="field">
          <label>Preset</label>
          <select value={binding.preset} onChange={(e) => updateWidget({ binding: { kind: "preset", preset: e.target.value } })}>
            {LAYOUT_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </div>
      )}

      {binding?.kind === "entity" && (
        <div className="field">
          <label>Entity</label>
          <EntityPicker
            catalog={catalog}
            selected={binding.entityId ? [binding.entityId] : []}
            multi={false}
            onChange={(ids) => updateWidget({ binding: { kind: "entity", entityId: ids[0] ?? "" } })}
          />
        </div>
      )}

      {binding?.kind === "entities" && (
        <div className="field">
          <label>Entities ({binding.entityIds.length} selected)</label>
          <EntityPicker
            catalog={catalog}
            selected={binding.entityIds}
            multi
            onChange={(ids) => updateWidget({ binding: { kind: "entities", entityIds: ids } })}
          />
        </div>
      )}

      <hr className="section-divider" />

      <h2>Options</h2>
      <div className="options-table">
        {fields.map((field) => (
          <OptionField key={field.key} field={field} value={options[field.key]} onChange={(value) => updateOptions({ [field.key]: value })} />
        ))}
        {fields.length === 0 && <div className="inspector-empty">This widget type has no editable options.</div>}
      </div>

      {widgetSupportsTiles(widget.type) && (
        <TileListEditor
          tiles={(options.tiles as TileSpec[] | undefined) ?? []}
          onChange={(tiles) => updateOptions({ tiles })}
        />
      )}

      <hr className="section-divider" />

      <button
        type="button"
        className="icon-btn danger"
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 32 }}
        onClick={() => setPendingRemove(true)}
      >
        <Trash2 size={14} /> Remove widget
      </button>

      {pendingRemove && (
        <Confirm
          title="Remove widget"
          body="Remove this widget from the page? This only affects the in-memory draft until you Save."
          confirmLabel="Remove widget"
          danger
          onConfirm={() => {
            onRemoveWidget(widget.id);
            setPendingRemove(false);
          }}
          onCancel={() => setPendingRemove(false)}
        />
      )}
    </div>
  );
}

function OptionField({
  field,
  value,
  onChange
}: {
  field: { key: string; label: string; type: string; choices?: string[]; placeholder?: string };
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "boolean") {
    return (
      <div className="options-row">
        <label>{field.label}</label>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked || undefined)} />
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="options-row">
        <label>{field.label}</label>
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="options-row">
        <label>{field.label}</label>
        <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">(default)</option>
          {(field.choices ?? []).map((choice) => (
            <option key={choice || "(empty)"} value={choice}>
              {choice || "(none)"}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "icon") {
    return (
      <div className="options-row">
        <label>{field.label}</label>
        <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">(none)</option>
          {ICON_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="options-row">
      <label>{field.label}</label>
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </div>
  );
}

function TileListEditor({ tiles, onChange }: { tiles: TileSpec[]; onChange: (tiles: TileSpec[]) => void }) {
  function updateTile(index: number, patch: Partial<TileSpec>) {
    onChange(tiles.map((tile, i) => (i === index ? { ...tile, ...patch } : tile)));
  }

  function removeTile(index: number) {
    onChange(tiles.filter((_, i) => i !== index));
  }

  function addTile() {
    onChange([...tiles, { label: "New", preset: LAYOUT_PRESETS[0], tone: "black" }]);
  }

  return (
    <>
      <h2>Tiles</h2>
      <div className="tile-list">
        {tiles.map((tile, index) => (
          <div className="tile-card" key={index}>
            <button type="button" className="icon-btn danger tile-remove" title="Remove tile" onClick={() => removeTile(index)}>
              <Trash2 size={12} />
            </button>
            <div className="options-row">
              <label>Label</label>
              <input type="text" value={tile.label ?? ""} onChange={(e) => updateTile(index, { label: e.target.value || undefined })} />
            </div>
            <div className="options-row">
              <label>Preset</label>
              <select value={tile.preset ?? ""} onChange={(e) => updateTile(index, { preset: e.target.value || undefined })}>
                <option value="">(none)</option>
                {LAYOUT_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </div>
            <div className="options-row">
              <label>Icon</label>
              <select value={tile.icon ?? ""} onChange={(e) => updateTile(index, { icon: e.target.value || undefined })}>
                <option value="">(none)</option>
                {ICON_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="options-row">
              <label>Tone</label>
              <div className="tone-swatches">
                {TONE_OPTIONS.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    className={`tone-swatch${(tile.tone ?? "none") === tone ? " selected" : ""}`}
                    data-tone={tone}
                    title={tone}
                    style={{ width: 20, height: 20 }}
                    onClick={() => updateTile(index, { tone: tone === "none" ? undefined : (tone as Tone) })}
                    aria-label={`Tile tone ${tone}`}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="icon-btn" style={{ width: "100%", marginTop: 8, height: 28 }} onClick={addTile}>
        + Add tile
      </button>
    </>
  );
}
