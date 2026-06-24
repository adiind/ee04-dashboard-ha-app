import { validateLayout } from "../layout/validate.mjs";
import type { LayoutDocument } from "../layout/types";
import type { EntityCatalog } from "../lib/useEntityCatalog";

/**
 * Thin fetch helpers for the layout builder. All requests are relative
 * `/builder/...` (and `/control`, `/state`) paths so they go through the
 * Vite dev/preview proxy to the local control server on :5174 — the proxy
 * makes the request originate from 127.0.0.1, which is required for the
 * control server's localhost-only PUT check.
 */

export type GetLayoutResult =
  | { ok: true; layout: LayoutDocument }
  | { ok: false; error: string };

export async function fetchLayout(): Promise<GetLayoutResult> {
  try {
    const response = await fetch("/builder/layout", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` };
    }
    const result = validateLayout(body.layout);
    if (!result.ok || !result.layout) {
      return { ok: false, error: result.errors.join("; ") || "invalid layout" };
    }
    return { ok: true, layout: result.layout };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
}

export type PutLayoutResult = { ok: true } | { ok: false; error: string };

export async function putLayout(layout: LayoutDocument): Promise<PutLayoutResult> {
  try {
    const response = await fetch("/builder/layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(layout)
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
}

export async function fetchEntityCatalog(): Promise<EntityCatalog | undefined> {
  try {
    const response = await fetch("/builder/entities", { cache: "no-store" });
    if (!response.ok) return undefined;
    return (await response.json()) as EntityCatalog;
  } catch {
    return undefined;
  }
}

/**
 * The exact `/control` URL the "Refresh Board" action would call. Exported
 * so it can be asserted in tests without actually triggering a refresh.
 */
export function refreshBoardUrl(): string {
  return "/control?action=refresh";
}

export async function refreshBoard(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(refreshBoardUrl(), { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
}
