import type { Edge, Node, NodeChange } from "@xyflow/react";
import type { Size } from "../core/index.js";

/** Apply measurement notifications without turning them into graph/history edits. */
export function rememberMeasurements<N extends Node>(
  cache: Map<string, Size>,
  changes: readonly NodeChange<N>[],
): boolean {
  let changed = false;
  for (const change of changes)
    if (change.type === "dimensions" && change.dimensions) {
      const previous = cache.get(change.id);
      if (
        previous?.width !== change.dimensions.width ||
        previous?.height !== change.dimensions.height
      ) {
        cache.set(change.id, { ...change.dimensions });
        changed = true;
      }
    }
  return changed;
}

/** React Flow hides the reconnecting edge; a separate identity keeps the source visible. */
export function stationaryReconnectEdge<E extends Edge>(edge: E): E {
  return {
    ...edge,
    id: `reconnect-preview:${edge.id}`,
    selected: false,
    reconnectable: false,
    selectable: false,
    focusable: false,
    deletable: false,
    data: { ...edge.data, emphasized: false, dimmed: false },
  };
}

function shallowRecordEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}
/** Keep native flow records stable when immutable model and geometry are unchanged. */
export function reuseFlowPresentations<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const byId = new Map(previous.map(item => [item.id, item]));
  const result = next.map(item => {
    const old = byId.get(item.id);
    if (!old) return item;
    const a = old as unknown as Record<string, unknown>, b = item as unknown as Record<string, unknown>;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key] || (['data', 'style', 'position', 'measured'].includes(key) && shallowRecordEqual(a[key], b[key]))) ? old : item;
  });
  return result.length === previous.length && result.every((item, index) => item === previous[index]) ? previous : result;
}
