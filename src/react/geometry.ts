import { getBezierPath, Position } from "@xyflow/react";
import type { Point } from "../core/index.js";

/** Adapted from Teia's feedback/self-loop treatment; no audio semantics here. */
export function linkPath(
  source: Point,
  target: Point,
  feedback = false,
  sameNode = false,
): [string, number, number] {
  if (!feedback && !sameNode) {
    const [path, x, y] = getBezierPath({
      sourceX: source.x,
      sourceY: source.y,
      targetX: target.x,
      targetY: target.y,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    return [path, x, y];
  }
  const dx = Math.abs(source.x - target.x),
    dy = Math.abs(source.y - target.y);
  if (sameNode) {
    const offset = Math.max(220 * 0.36, dx * 0.34 + dy * 0.12);
    const controlY =
      Math.min(source.y, target.y) - Math.min(32, Math.max(16, dy * 0.2 + 16));
    return [
      `M ${source.x},${source.y} C ${source.x + offset},${controlY} ${target.x - offset},${controlY} ${target.x},${target.y}`,
      (source.x + target.x) / 2,
      0.125 * source.y + 0.75 * controlY + 0.125 * target.y,
    ];
  }
  const offset = Math.max(142, dx * 0.8 + dy * 0.2);
  return [
    `M ${source.x},${source.y} C ${source.x + offset},${source.y} ${target.x - offset},${target.y} ${target.x},${target.y}`,
    (source.x + target.x) / 2,
    (source.y + target.y) / 2,
  ];
}
export const nodeFlowId = (id: string) => `node:${id}`;
export const areaFlowId = (id: string) => `area:${id}`;
export const anchorFlowId = (id: string) => `anchor:${id}`;
export const sourceHandle = (id: string) => `out:${id}`;
export const targetHandle = (id: string) => `in:${id}`;
export function parseHandle(
  handle: string | null | undefined,
): { direction: "input" | "output"; id: string } | undefined {
  if (handle?.startsWith("out:"))
    return { direction: "output", id: handle.slice(4) };
  if (handle?.startsWith("in:"))
    return { direction: "input", id: handle.slice(3) };
}
