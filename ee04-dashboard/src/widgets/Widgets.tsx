import type { ReactNode } from "react";
import { formatTime } from "../lib/format";
import {
  resolvePreset,
  type BoardHealthValue,
  type EntityListValue,
  type PresetContext,
  type RoomsSignalValue,
  type StatTileValue,
  type StatusStripValue
} from "../lib/layoutPresets";
import { resolveEntities, resolveEntity, type EntityCatalog } from "../lib/useEntityCatalog";
import { numberLabel, titleCase } from "../lib/format";
import { getIcon } from "./icons";
import type { AgendaItem, EntityRef, TransitItem } from "../types";
import type { LayoutWidget, Tone } from "../layout/types";

export type WidgetContext = PresetContext & {
  catalog: EntityCatalog | undefined;
};

/** Shared bordered panel container, optionally placed in a named grid slot. */
export function Panel({ children, className = "", slot }: { children: ReactNode; className?: string; slot?: string }) {
  return (
    <section className={`panel ${className}`} style={slot ? { gridArea: slot } : undefined}>
      {children}
    </section>
  );
}

export function SectionTitle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <header className="section-title">
      {icon}
      <strong>{label}</strong>
    </header>
  );
}

export function EmptyLine({ label }: { label: string }) {
  return <div className="empty-line">{label}</div>;
}

export function EntityListBody({ items, fallback }: { items: EntityRef[]; fallback: string }) {
  if (!items.length) return <EmptyLine label={fallback} />;
  return (
    <div className="entity-list">
      {items.slice(0, 6).map((item) => (
        <div className="entity-row" key={item.entityId}>
          <strong>{displayEntityName(item)}</strong>
          <span>{displayEntityState(item)}</span>
        </div>
      ))}
    </div>
  );
}

function displayEntityName(item: EntityRef) {
  return cleanLabel(item.name || item.entityId)
    .replace(/^Sensor\s+/i, "")
    .replace(/\bTemperature\b/gi, "Temp")
    .replace(/\bTarget Temp\b/gi, "Target")
    .replace(/\bHumidity\b/gi, "Humidity");
}

function displayEntityState(item: EntityRef) {
  const state = String(item.state ?? "").trim();
  const label = state.toLowerCase() === "unavailable" ? "offline" : state;
  return `${label}${item.unit ?? ""}`;
}

function cleanLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\bX2D\s+[A-Z0-9]{8,}\s*/gi, "")
    .replace(/\b20P9AJ611300484\b/gi, "")
    .replace(/\bHOBEIAN\s+/gi, "")
    .replace(/\b([A-Za-z]+)\s+\1\b/g, "$1")
    .replace(/\s+\[[^\]]+\]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function displayAgendaTitle(title: string) {
  return cleanLabel(title)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+-\s+Advanced Track.*$/i, " Advanced Track")
    .replace(/\s+-\s+Basic Track.*$/i, " Basic Track")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve an `entity`/`entities` binding against the catalog into an
 * `EntityListValue`. Returns a graceful "no data" fallback when the catalog
 * or the requested entity is missing.
 */
function resolveEntityBinding(widget: LayoutWidget, ctx: WidgetContext): EntityListValue | undefined {
  const binding = widget.binding;
  if (!binding) return undefined;
  if (binding.kind === "entity") {
    const entity = resolveEntity(ctx.catalog, binding.entityId);
    return { items: entity ? [entity] : [], fallback: entity ? "" : "No data" };
  }
  if (binding.kind === "entities") {
    const items = resolveEntities(ctx.catalog, binding.entityIds);
    return { items, fallback: items.length ? "" : "No data" };
  }
  return undefined;
}

/** Resolve a widget's binding into a value, handling preset and entity bindings. */
function resolveBindingValue(widget: LayoutWidget, ctx: WidgetContext): unknown {
  const binding = widget.binding;
  if (!binding) return undefined;
  if (binding.kind === "preset") return resolvePreset(binding.preset, ctx);
  return resolveEntityBinding(widget, ctx);
}

/** Top-level dispatcher: renders one widget into its slot. */
export function WidgetRenderer({ widget, ctx }: { widget: LayoutWidget; ctx: WidgetContext }) {
  switch (widget.type) {
    case "weatherHero":
      return <WeatherHeroWidget widget={widget} ctx={ctx} />;
    case "statusStrip":
      return <StatusStripWidget widget={widget} ctx={ctx} />;
    case "statTile":
      return <StatTileGroupWidget widget={widget} ctx={ctx} />;
    case "entityList":
      return <EntityListWidget widget={widget} ctx={ctx} />;
    case "agendaList":
      return <AgendaListWidget widget={widget} ctx={ctx} />;
    case "heroNumber":
      return <HeroNumberGroupWidget widget={widget} ctx={ctx} />;
    case "boardHealth":
      return <BoardHealthWidget widget={widget} ctx={ctx} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// weatherHero
// ---------------------------------------------------------------------------

function WeatherHeroWidget({ widget, ctx }: { widget: LayoutWidget; ctx: WidgetContext }) {
  const options = widget.options ?? {};
  const weather = resolveBindingValue(widget, ctx) as PresetContext["data"]["weather"] | undefined;
  const Icon = getIcon(options.icon as string | undefined);
  const eyebrow = (options.eyebrow as string | undefined) ?? "Outside";
  const showRange = options.showRange !== false;
  const compact = Boolean(options.compact);

  return (
    <Panel className={`weather-hero${compact ? " compact" : ""}`} slot={widget.slot}>
      {Icon && <Icon size={compact ? 42 : 44} />}
      <span>{eyebrow}</span>
      <strong>{numberLabel(weather?.temperature)}°</strong>
      <em>{titleCase(weather?.condition ?? "unknown")}</em>
      {showRange && (
        <small>
          {numberLabel(weather?.high)}/{numberLabel(weather?.low)}° · {numberLabel(weather?.humidity)}% humidity
        </small>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// statusStrip (variants: mood, roomCommand, roomStatus, fort, systemsHero)
// ---------------------------------------------------------------------------

function StatusStripWidget({ widget, ctx }: { widget: LayoutWidget; ctx: WidgetContext }) {
  const options = widget.options ?? {};
  const variant = (options.variant as string | undefined) ?? "mood";
  const value = resolveBindingValue(widget, ctx) as StatusStripValue | undefined;
  const Icon = getIcon(options.icon as string | undefined);

  if (variant === "mood") {
    return (
      <Panel className="mood-panel" slot={widget.slot}>
        <div className="eyebrow-row">
          {Icon && <Icon size={21} />}
          <span>{(options.eyebrow as string | undefined) ?? value?.eyebrow ?? ""}</span>
        </div>
        <h2>{value?.headline ?? ""}</h2>
        <p>{value?.body ?? ""}</p>
      </Panel>
    );
  }

  if (variant === "roomCommand") {
    return (
      <Panel className="room-command" slot={widget.slot}>
        <SectionTitle icon={Icon ? <Icon size={18} /> : null} label={widget.label ?? "Room Board"} />
        <div className="room-bigline">
          <strong>{value?.headline ?? "0"}</strong>
          <span>lights on</span>
        </div>
        <p>{value?.body ?? ""}</p>
      </Panel>
    );
  }

  if (variant === "roomStatus") {
    const tone = widget.tone ?? "yellow";
    return (
      <Panel className={`room-status-strip ${tone}`} slot={widget.slot}>
        {Icon && <Icon size={29} />}
        <strong>{widget.label ?? value?.headline ?? "Room Status"}</strong>
        <span>{value?.body ?? ""}</span>
      </Panel>
    );
  }

  if (variant === "fort") {
    const calm = value?.tone !== "warning";
    const IconCalm = getIcon(options.iconCalm as string | undefined);
    const IconWarning = getIcon(options.iconWarning as string | undefined);
    const ActiveIcon = calm ? IconCalm : IconWarning;
    return (
      <Panel className={`fort-panel ${calm ? "calm" : "warning"}`} slot={widget.slot}>
        {ActiveIcon && <ActiveIcon size={47} />}
        <span>{value?.eyebrow ?? "Security"}</span>
        <strong>{value?.headline ?? ""}</strong>
        <em>{value?.body ?? ""}</em>
      </Panel>
    );
  }

  if (variant === "systemsHero") {
    return (
      <Panel className="systems-hero" slot={widget.slot}>
        {Icon && <Icon size={38} />}
        <span>{value?.eyebrow ?? "Device Health"}</span>
        <strong>{value?.headline ?? ""}</strong>
        <em>{value?.body ?? ""}</em>
      </Panel>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// statTile (group of tiles in a sub-grid)
// ---------------------------------------------------------------------------

type TileSpec = {
  preset?: string;
  icon?: string;
  label?: string;
  tone?: Tone;
};

function StatTile({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: Tone }) {
  return (
    <div className={`stat-tile ${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatTileGroupWidget({ widget, ctx }: { widget: LayoutWidget; ctx: WidgetContext }) {
  const options = widget.options ?? {};
  const tiles = (options.tiles as TileSpec[] | undefined) ?? [];
  const columns = Number(options.columns ?? (tiles.length || 1));

  return (
    <div className="tile-grid" style={{ gridArea: widget.slot, "--cols": columns } as React.CSSProperties}>
      {tiles.map((tile, index) => {
        const resolved = tile.preset ? (resolvePreset(tile.preset, ctx) as StatTileValue | undefined) : undefined;
        const Icon = getIcon(tile.icon);
        const tone = (resolved?.tone ?? tile.tone ?? "black") as Tone;
        const label = resolved?.label ?? tile.label ?? "";
        const value = resolved?.value ?? "--";
        return (
          <StatTile
            key={`${widget.id}-${index}`}
            icon={Icon ? <Icon /> : null}
            label={label}
            value={value}
            tone={tone}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// entityList (plain lists, plus the rooms "printer or signals" variant)
// ---------------------------------------------------------------------------

function EntityListWidget({ widget, ctx }: { widget: LayoutWidget; ctx: WidgetContext }) {
  const options = widget.options ?? {};
  const variant = options.variant as string | undefined;
  const Icon = getIcon(options.icon as string | undefined);
  const limit = (options.limit as number | undefined) ?? 6;

  if (variant === "printerOrUnavailable") {
    const value = resolveBindingValue(widget, ctx) as RoomsSignalValue | undefined;
    if (value?.mode === "hero") {
      return (
        <Panel className="list-panel" slot={widget.slot}>
          <SectionTitle
            icon={createIcon(options.iconPrimary as string | undefined, 18)}
            label={(options.labelPrimary as string | undefined) ?? "Printer"}
          />
          <HeroNumber value={value.value} label={value.label} tone="black" />
        </Panel>
      );
    }
    const items = value?.mode === "list" ? value.items : [];
    const fallback = value?.mode === "list" ? value.fallback : ((options.emptyLabel as string | undefined) ?? "All key signals reachable");
    return (
      <Panel className="list-panel" slot={widget.slot}>
        <SectionTitle
          icon={createIcon(options.iconFallback as string | undefined, 18)}
          label={(options.labelFallback as string | undefined) ?? "Signals"}
        />
        <EntityListBody items={items.slice(0, limit)} fallback={fallback} />
      </Panel>
    );
  }

  const value = resolveBindingValue(widget, ctx) as EntityListValue | undefined;
  const items = value?.items ?? [];
  const fallback = value?.fallback || (options.emptyLabel as string | undefined) || "No data";

  return (
    <Panel className="list-panel" slot={widget.slot}>
      {widget.label && <SectionTitle icon={Icon ? <Icon size={18} /> : null} label={widget.label} />}
      <EntityListBody items={items.slice(0, limit)} fallback={fallback} />
    </Panel>
  );
}

function createIcon(name: string | undefined, size: number) {
  const Icon = getIcon(name);
  return Icon ? <Icon size={size} /> : null;
}

// ---------------------------------------------------------------------------
// agendaList (variants: simple, timeline)
// ---------------------------------------------------------------------------

function AgendaRow({ item }: { item: AgendaItem }) {
  return (
    <article className="agenda-row">
      <time>{item.allDay ? "All day" : formatTime(item.start)}</time>
      <div>
        <strong>{displayAgendaTitle(item.title)}</strong>
        <span>{item.calendar}</span>
      </div>
    </article>
  );
}

function TimelineRow({ item, index }: { item: AgendaItem; index: number }) {
  return (
    <article className="timeline-row">
      <b>{index + 1}</b>
      <time>{item.allDay ? "All day" : formatTime(item.start)}</time>
      <div>
        <strong>{displayAgendaTitle(item.title)}</strong>
        <span>{item.calendar}</span>
      </div>
    </article>
  );
}

function AgendaListWidget({ widget, ctx }: { widget: LayoutWidget; ctx: WidgetContext }) {
  const options = widget.options ?? {};
  const variant = (options.variant as string | undefined) ?? "simple";
  const limit = (options.limit as number | undefined) ?? (variant === "timeline" ? 5 : 3);
  const emptyLabel = (options.emptyLabel as string | undefined) ?? "No calendar items";
  const Icon = getIcon(options.icon as string | undefined);
  const list = (resolveBindingValue(widget, ctx) as AgendaItem[] | undefined) ?? [];
  const slice = list.slice(0, limit);

  return (
    <Panel className={variant === "timeline" ? "timeline-panel" : "agenda-slim"} slot={widget.slot}>
      {widget.label && <SectionTitle icon={Icon ? <Icon size={18} /> : null} label={widget.label} />}
      {slice.map((item, index) =>
        variant === "timeline" ? (
          <TimelineRow item={item} index={index} key={`${item.start}-${index}`} />
        ) : (
          <AgendaRow item={item} key={`${item.start}-${index}`} />
        )
      )}
      {slice.length === 0 && <EmptyLine label={emptyLabel} />}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// heroNumber (group, used for the agenda transit board)
// ---------------------------------------------------------------------------

function HeroNumber({ value, label, tone }: { value: string; label: string; tone: "black" | "blue" }) {
  return (
    <div className={`hero-number ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function HeroNumberGroupWidget({ widget, ctx }: { widget: LayoutWidget; ctx: WidgetContext }) {
  const options = widget.options ?? {};
  const limit = (options.limit as number | undefined) ?? 2;
  const emptyLabel = (options.emptyLabel as string | undefined) ?? "No data";
  const tone: "black" | "blue" = widget.tone === "blue" ? "blue" : "black";
  const Icon = getIcon(options.icon as string | undefined);
  const value = resolveBindingValue(widget, ctx);
  const items = (Array.isArray(value) ? value : []) as TransitItem[];
  const slice = items.slice(0, limit);

  return (
    <Panel className="transit-board" slot={widget.slot}>
      {widget.label && <SectionTitle icon={Icon ? <Icon size={18} /> : null} label={widget.label} />}
      <div className="transit-cards">
        {slice.map((item) => (
          <HeroNumber key={item.label} value={item.value} label={`${item.label} · ${item.detail ?? "next arrival"}`} tone={tone} />
        ))}
        {slice.length === 0 && <EmptyLine label={emptyLabel} />}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// boardHealth (Systems "Board / MCP" wide panel)
// ---------------------------------------------------------------------------

function BoardHealthWidget({ widget, ctx }: { widget: LayoutWidget; ctx: WidgetContext }) {
  const options = widget.options ?? {};
  const Icon = getIcon(options.icon as string | undefined);
  const limit = (options.limit as number | undefined) ?? 5;
  const value = resolveBindingValue(widget, ctx) as BoardHealthValue | undefined;

  return (
    <Panel className="system-list wide" slot={widget.slot}>
      {widget.label && <SectionTitle icon={Icon ? <Icon size={18} /> : null} label={widget.label} />}
      {value?.hasBoardTelemetry ? (
        <div className="entity-list">
          <div className="entity-row"><strong>EE04 Voltage</strong><span>{value.voltage}</span></div>
          <div className="entity-row"><strong>EE04 WiFi</strong><span>{value.wifi}</span></div>
          <div className="entity-row"><strong>EE04 Uptime</strong><span>{value.uptime}</span></div>
        </div>
      ) : (
        <EntityListBody items={(value?.fallbackItems ?? []).slice(0, limit)} fallback={value?.fallbackLabel ?? "Board status pending"} />
      )}
    </Panel>
  );
}
