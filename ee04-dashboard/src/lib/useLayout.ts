import { useEffect, useState } from "react";
import { defaultLayout } from "../layout/defaultLayout";
import { validateLayout } from "../layout/validate.mjs";
import type { LayoutDocument } from "../layout/types";

export type LayoutState = {
  layout: LayoutDocument;
  /** True when `/data/layout.json` was missing/invalid and the built-in seed is in use. */
  fallback: boolean;
  /** Validation errors from the fetched layout, if any (empty when `fallback` is false). */
  errors: string[];
};

const FALLBACK_STATE: LayoutState = { layout: defaultLayout, fallback: false, errors: [] };

/**
 * Fetch `/data/layout.json` at runtime (same pattern as `useDashboardData`),
 * validate it with the shared `validateLayout`, and fall back to the
 * built-in seed layout when the file is missing or invalid.
 */
export function useLayout(): LayoutState {
  const [state, setState] = useState<LayoutState>(FALLBACK_STATE);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/layout.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        const result = validateLayout(json);
        if (result.ok && result.layout) {
          setState({ layout: result.layout, fallback: false, errors: [] });
        } else {
          setState({ layout: defaultLayout, fallback: true, errors: result.errors });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setState({ layout: defaultLayout, fallback: true, errors: [String(error?.message ?? error)] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
