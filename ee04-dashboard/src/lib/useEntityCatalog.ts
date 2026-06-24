import { useEffect, useState } from "react";
import type { EntityRef } from "../types";

/**
 * Entity catalog shape written to `public/data/entities.json` by a parallel
 * subtask. May not exist yet (or may 404) while that work lands; entity
 * bindings must degrade gracefully when it is missing.
 */
export type EntityCatalogEntry = {
  entityId: string;
  name: string;
  domain: string;
  state: string;
  unit?: string;
  deviceClass?: string;
  group?: string;
};

export type EntityCatalog = {
  generatedAt: string;
  entities: EntityCatalogEntry[];
};

export type EntityCatalogState = {
  catalog: EntityCatalog | undefined;
  loaded: boolean;
};

export function useEntityCatalog(): EntityCatalogState {
  const [state, setState] = useState<EntityCatalogState>({ catalog: undefined, loaded: false });

  useEffect(() => {
    let cancelled = false;
    fetch("/data/entities.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<EntityCatalog>;
      })
      .then((catalog) => {
        if (!cancelled) setState({ catalog, loaded: true });
      })
      .catch(() => {
        if (!cancelled) setState({ catalog: undefined, loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * Resolve a single entity id against the catalog. Returns `undefined` when
 * the catalog isn't loaded yet, isn't available, or doesn't contain the id
 * — callers should render a "no data" placeholder in that case.
 */
export function resolveEntity(catalog: EntityCatalog | undefined, entityId: string): EntityRef | undefined {
  const entry = catalog?.entities.find((item) => item.entityId === entityId);
  if (!entry) return undefined;
  return {
    entityId: entry.entityId,
    name: entry.name,
    state: entry.state,
    unit: entry.unit,
    deviceClass: entry.deviceClass
  };
}

/** Resolve multiple entity ids, dropping any that aren't found in the catalog. */
export function resolveEntities(catalog: EntityCatalog | undefined, entityIds: string[]): EntityRef[] {
  if (!catalog) return [];
  return entityIds
    .map((id) => resolveEntity(catalog, id))
    .filter((item): item is EntityRef => Boolean(item));
}
