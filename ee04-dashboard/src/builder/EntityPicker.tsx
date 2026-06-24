import { useMemo, useState } from "react";
import type { EntityCatalog, EntityCatalogEntry } from "../lib/useEntityCatalog";

/**
 * Searchable entity picker grouped by `group` (from `/builder/entities`).
 * `multi=false` selects a single entity (radio-like); `multi=true` toggles
 * membership in `selected`.
 */
export function EntityPicker({
  catalog,
  selected,
  multi,
  onChange
}: {
  catalog: EntityCatalog | undefined;
  selected: string[];
  multi: boolean;
  onChange: (entityIds: string[]) => void;
}) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const entities = catalog?.entities ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entities.filter(
          (e) => e.entityId.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
        )
      : entities;
    const groups = new Map<string, EntityCatalogEntry[]>();
    for (const entity of filtered) {
      const key = entity.group ?? "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entity);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog, query]);

  const selectedSet = new Set(selected);

  function toggle(entityId: string) {
    if (multi) {
      if (selectedSet.has(entityId)) {
        onChange(selected.filter((id) => id !== entityId));
      } else {
        onChange([...selected, entityId]);
      }
    } else {
      onChange([entityId]);
    }
  }

  if (!catalog) {
    return <div className="entity-option-empty">Entity catalog unavailable (/builder/entities).</div>;
  }

  return (
    <div className="entity-picker">
      <div className="entity-picker-search">
        <input
          type="text"
          placeholder="Search entities..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {grouped.length === 0 && <div className="entity-option-empty">No matching entities.</div>}
      {grouped.map(([group, entities]) => (
        <div key={group}>
          <div className="entity-group-label">{group}</div>
          {entities.map((entity) => (
            <label className={`entity-option${selectedSet.has(entity.entityId) ? " selected" : ""}`} key={entity.entityId}>
              <input
                type={multi ? "checkbox" : "radio"}
                name="entity-picker"
                checked={selectedSet.has(entity.entityId)}
                onChange={() => toggle(entity.entityId)}
              />
              <span>{entity.name}</span>
              <span className="entity-id">{entity.entityId}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
