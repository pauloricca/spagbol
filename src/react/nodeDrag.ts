import type { Node, NodeChange } from "@xyflow/react";
import type { GraphDocument, Point } from "../core/index.js";

/** Accumulate only changed native node positions; keep model records immutable. */
export function previewNodePositions<N extends Node>(
  previous: ReadonlyMap<string, Point>,
  changes: readonly NodeChange<N>[],
): ReadonlyMap<string, Point> {
  let next: Map<string, Point> | undefined;
  for (const change of changes) {
    if (change.type !== "position" || !change.position || !change.id.startsWith("node:"))
      continue;
    const { x, y } = change.position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const id = change.id.slice(5);
    const before = (next ?? previous).get(id);
    if (before?.x === x && before.y === y) continue;
    next ??= new Map(previous);
    next.set(id, { x, y });
  }
  return next ?? previous;
}

/** Apply a completed multi-node drag as one atomic controller edit. */
export function applyNodePositions(
  graph: GraphDocument,
  positions: ReadonlyMap<string, Point>,
): void {
  for (const node of graph.nodes) {
    const position = positions.get(node.id);
    if (position) node.position = { ...position };
  }
}
