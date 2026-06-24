export type WledRange = {
  start: number;
  end: number;
};

export type WledGroup = {
  id: string;
  name: string;
  start?: number;
  end?: number;
  ranges: WledRange[];
  color: string;
  enabled: boolean;
};

export type WledTableMap = {
  corners: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
};

export type WledGroupsDocument = {
  version: 1;
  updatedAt: string;
  wled: {
    entityId: string;
    name: string;
    ip: string;
    ledCount: number;
  };
  table: WledTableMap;
  groups: WledGroup[];
};

export type WledContext = {
  ok: true;
  groups: WledGroupsDocument;
  effects?: string[];
  palettes?: string[];
  info?: {
    ver?: string;
    name?: string;
    leds?: { count?: number };
    ip?: string;
    error?: string;
  };
  state?: Record<string, unknown>;
};

export type ApiResult<T> = { ok: true } & T | { ok: false; error: string };

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      cache: "no-store",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      }
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) {
      return { ok: false, error: body?.error ?? `HTTP ${response.status}` };
    }
    return body as ApiResult<T>;
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) };
  }
}

export function fetchWledContext(): Promise<ApiResult<Omit<WledContext, "ok">>> {
  return jsonRequest<Omit<WledContext, "ok">>("/wled/info");
}

export function saveWledGroups(groups: WledGroupsDocument): Promise<ApiResult<{ groups: WledGroupsDocument }>> {
  return jsonRequest<{ groups: WledGroupsDocument }>("/wled/groups", {
    method: "PUT",
    body: JSON.stringify(groups)
  });
}

export function applyWledItems(
  items: Array<{ start: number; end: number; color: string }>,
  brightness: number
): Promise<ApiResult<{ payload: unknown }>> {
  return jsonRequest<{ payload: unknown }>("/wled/apply", {
    method: "POST",
    body: JSON.stringify({ items, brightness, transition: 0, background: "#000000" })
  });
}

export function applyWledFrame(
  frames: Array<{ start: number; colors: string[] }>,
  brightness: number
): Promise<ApiResult<{ payload: unknown }>> {
  return jsonRequest<{ payload: unknown }>("/wled/frame", {
    method: "POST",
    body: JSON.stringify({ frames, brightness, transition: 0 })
  });
}

export function applyWledNativeEffect(input: {
  segments: Array<{ start: number; stop: number; reverse?: boolean }>;
  brightness: number;
  effect: number;
  palette: number;
  speed: number;
  intensity: number;
  colorA: string;
  colorB: string;
  accent: string;
}): Promise<ApiResult<{ payload: unknown }>> {
  return jsonRequest<{ payload: unknown }>("/wled/effect", {
    method: "POST",
    body: JSON.stringify({ ...input, transition: 0 })
  });
}

export function restoreWledState(state: Record<string, unknown>): Promise<ApiResult<{ state: unknown }>> {
  return jsonRequest<{ state: unknown }>("/wled/restore", {
    method: "POST",
    body: JSON.stringify({ state })
  });
}
