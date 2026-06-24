import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { LAYOUT_TEMPLATES, WIDGET_TYPES } from "../layout/types";
import type { LayoutDocument, LayoutPage, LayoutTemplate, WidgetType } from "../layout/types";
import { buildWidget, freeSlots, moveItem, uniquePageId } from "./layoutOps";
import { Confirm } from "./Confirm";

const TEMPLATE_LABELS: Record<LayoutTemplate, string> = {
  "home-grid": "Home grid",
  "rooms-grid": "Rooms grid",
  "climate-grid": "Climate grid",
  "security-grid": "Security grid",
  "agenda-grid": "Agenda grid",
  "systems-grid": "Systems grid"
};

const WIDGET_LABELS: Record<WidgetType, string> = {
  weatherHero: "Weather Hero",
  statTile: "Stat Tiles",
  entityList: "Entity List",
  agendaList: "Agenda List",
  statusStrip: "Status Strip",
  heroNumber: "Hero Numbers",
  boardHealth: "Board Health"
};

export function PageList({
  layout,
  selectedPageIndex,
  selectedWidgetId,
  onSelectPage,
  onSelectWidget,
  onChange
}: {
  layout: LayoutDocument;
  selectedPageIndex: number;
  selectedWidgetId: string | null;
  onSelectPage: (index: number) => void;
  onSelectWidget: (widgetId: string | null) => void;
  onChange: (layout: LayoutDocument) => void;
}) {
  const [addingPage, setAddingPage] = useState(false);
  const [newPageLabel, setNewPageLabel] = useState("");
  const [newPagePhrase, setNewPagePhrase] = useState("");
  const [newPageTemplate, setNewPageTemplate] = useState<LayoutTemplate>("home-grid");
  const [pendingDeletePage, setPendingDeletePage] = useState<number | null>(null);

  const [addingWidgetType, setAddingWidgetType] = useState<WidgetType>("entityList");
  const [addingWidgetSlot, setAddingWidgetSlot] = useState<string>("");

  const selectedPage = layout.pages[selectedPageIndex] as LayoutPage | undefined;
  const slotsForSelected = selectedPage ? freeSlots(selectedPage) : [];
  const effectiveSlot = addingWidgetSlot && slotsForSelected.includes(addingWidgetSlot) ? addingWidgetSlot : slotsForSelected[0] ?? "";

  function updatePages(pages: LayoutPage[]) {
    onChange({ ...layout, pages });
  }

  function movePage(index: number, delta: number) {
    const next = moveItem(layout.pages, index, delta);
    if (next === layout.pages) return;
    updatePages(next);
    const target = index + delta;
    if (selectedPageIndex === index) onSelectPage(target);
    else if (selectedPageIndex === target) onSelectPage(index);
  }

  function toggleEnabled(index: number) {
    const pages = layout.pages.map((page, i) => (i === index ? { ...page, enabled: !page.enabled } : page));
    updatePages(pages);
  }

  function addPage() {
    const label = newPageLabel.trim() || "New Page";
    const id = uniquePageId(layout, label);
    const page: LayoutPage = {
      id,
      label,
      phrase: newPagePhrase.trim(),
      enabled: true,
      template: newPageTemplate,
      widgets: []
    };
    updatePages([...layout.pages, page]);
    onSelectPage(layout.pages.length);
    onSelectWidget(null);
    setAddingPage(false);
    setNewPageLabel("");
    setNewPagePhrase("");
    setNewPageTemplate("home-grid");
  }

  function deletePage(index: number) {
    const pages = layout.pages.filter((_, i) => i !== index);
    updatePages(pages);
    if (selectedPageIndex >= pages.length) onSelectPage(Math.max(0, pages.length - 1));
    else if (selectedPageIndex === index) onSelectPage(Math.min(index, pages.length - 1));
    onSelectWidget(null);
    setPendingDeletePage(null);
  }

  function addWidget() {
    if (!selectedPage || !effectiveSlot) return;
    const widget = buildWidget(selectedPage, addingWidgetType, effectiveSlot);
    const pages = layout.pages.map((page, i) =>
      i === selectedPageIndex ? { ...page, widgets: [...page.widgets, widget] } : page
    );
    updatePages(pages);
    onSelectWidget(widget.id);
  }

  return (
    <div className="pane">
      <h2>Pages</h2>
      <div className="page-list">
        {layout.pages.map((page, index) => (
          <div
            key={page.id}
            className={`page-row${index === selectedPageIndex ? " selected" : ""}${page.enabled ? "" : " disabled"}`}
            onClick={() => {
              onSelectPage(index);
              onSelectWidget(null);
            }}
          >
            <div className="page-meta">
              <strong>{page.label || page.id}</strong>
              <span>{page.id} · {TEMPLATE_LABELS[page.template]}</span>
            </div>
            <div className="page-row-controls">
              <button
                type="button"
                className="icon-btn"
                title="Move up"
                disabled={index === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  movePage(index, -1);
                }}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Move down"
                disabled={index === layout.pages.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  movePage(index, 1);
                }}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <div className="page-row-controls">
              <label className="checkbox-row" style={{ marginBottom: 0 }} onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={page.enabled} onChange={() => toggleEnabled(index)} />
                on
              </label>
              <button
                type="button"
                className="icon-btn danger"
                title="Delete page"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeletePage(index);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {addingPage ? (
        <div className="add-page-form">
          <input
            type="text"
            placeholder="Page label"
            value={newPageLabel}
            onChange={(e) => setNewPageLabel(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="Eyebrow phrase (optional)"
            value={newPagePhrase}
            onChange={(e) => setNewPagePhrase(e.target.value)}
          />
          <select value={newPageTemplate} onChange={(e) => setNewPageTemplate(e.target.value as LayoutTemplate)}>
            {LAYOUT_TEMPLATES.map((tpl) => (
              <option key={tpl} value={tpl}>
                {TEMPLATE_LABELS[tpl]}
              </option>
            ))}
          </select>
          <div className="field-row">
            <button type="button" onClick={addPage}>
              Add page
            </button>
            <button
              type="button"
              style={{ background: "var(--paper)", color: "var(--ink)" }}
              onClick={() => setAddingPage(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="icon-btn"
          style={{ width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 30 }}
          onClick={() => setAddingPage(true)}
        >
          <Plus size={14} /> Add page
        </button>
      )}

      {selectedPage && (
        <>
          <h2>Widgets on "{selectedPage.label || selectedPage.id}"</h2>
          <div className="widget-list">
            {selectedPage.widgets.map((widget) => (
              <div
                key={widget.id}
                className={`widget-row${widget.id === selectedWidgetId ? " selected" : ""}`}
                onClick={() => onSelectWidget(widget.id)}
              >
                <strong>{WIDGET_LABELS[widget.type]}{widget.label ? ` · ${widget.label}` : ""}</strong>
                <span>slot: {widget.slot}</span>
              </div>
            ))}
            {selectedPage.widgets.length === 0 && <div className="inspector-empty">No widgets on this page yet.</div>}
          </div>

          <div className="add-widget-form">
            <select value={addingWidgetType} onChange={(e) => setAddingWidgetType(e.target.value as WidgetType)}>
              {WIDGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {WIDGET_LABELS[type]}
                </option>
              ))}
            </select>
            <select value={effectiveSlot} onChange={(e) => setAddingWidgetSlot(e.target.value)} disabled={slotsForSelected.length === 0}>
              {slotsForSelected.length === 0 ? (
                <option value="">No free slots</option>
              ) : (
                slotsForSelected.map((slot) => (
                  <option key={slot} value={slot}>
                    slot: {slot}
                  </option>
                ))
              )}
            </select>
            <button type="button" onClick={addWidget} disabled={slotsForSelected.length === 0}>
              <Plus size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Add widget
            </button>
          </div>
        </>
      )}

      {pendingDeletePage !== null && (
        <Confirm
          title="Delete page"
          body={`Delete "${layout.pages[pendingDeletePage]?.label || layout.pages[pendingDeletePage]?.id}" and all of its widgets? This only affects the in-memory draft until you Save.`}
          confirmLabel="Delete page"
          danger
          onConfirm={() => deletePage(pendingDeletePage)}
          onCancel={() => setPendingDeletePage(null)}
        />
      )}

    </div>
  );
}
