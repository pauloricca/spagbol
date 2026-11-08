import type { Point, Size } from "../core/index.js";

export interface CanvasBoundsItem {
  position: Point;
  size: Size;
  hidden?: boolean;
}
export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}
export type CanvasExtent = [[number, number], [number, number]];
export const infiniteCanvasExtent: CanvasExtent = [
  [-Infinity, -Infinity],
  [Infinity, Infinity],
];

export function visibleContentBounds(items: readonly CanvasBoundsItem[]) {
  const visible = items.filter(
    (item) =>
      !item.hidden &&
      [
        item.position.x,
        item.position.y,
        item.size.width,
        item.size.height,
      ].every(Number.isFinite),
  );
  if (!visible.length) return { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.min(...visible.map((item) => item.position.x));
  const y = Math.min(...visible.map((item) => item.position.y));
  return {
    x,
    y,
    width: Math.max(
      1,
      Math.max(...visible.map((item) => item.position.x + item.size.width)) - x,
    ),
    height: Math.max(
      1,
      Math.max(...visible.map((item) => item.position.y + item.size.height)) -
        y,
    ),
  };
}
const normalizedZoom = (zoom: number) =>
  Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

/** Teia's pan policy: extend content bounds by 70% of the visible screen on each side. */
export function translateExtentForVisibleContent(
  items: readonly CanvasBoundsItem[],
  viewport: CanvasViewport,
  size: Size,
  emptyScreenRatio = 0.7,
): CanvasExtent {
  if (size.width <= 0 || size.height <= 0) return infiniteCanvasExtent;
  const bounds = visibleContentBounds(items),
    zoom = normalizedZoom(viewport.zoom);
  const emptyWidth = (size.width / zoom) * emptyScreenRatio;
  const emptyHeight = (size.height / zoom) * emptyScreenRatio;
  return [
    [bounds.x - emptyWidth, bounds.y - emptyHeight],
    [
      bounds.x + bounds.width + emptyWidth,
      bounds.y + bounds.height + emptyHeight,
    ],
  ];
}

/** Re-clamp after zoom, resize, collapse, graph deletion or nested navigation. */
export function clampViewportToTranslateExtent(
  viewport: CanvasViewport,
  extent: CanvasExtent,
  size: Size,
): CanvasViewport {
  if (size.width <= 0 || size.height <= 0) return viewport;
  const zoom = normalizedZoom(viewport.zoom);
  const minLeft = extent[0][0],
    maxLeft = extent[1][0] - size.width / zoom;
  const minTop = extent[0][1],
    maxTop = extent[1][1] - size.height / zoom;
  const clamp = (value: number, a: number, b: number) =>
    Math.max(Math.min(a, b), Math.min(Math.max(a, b), value));
  return {
    x: -clamp(-viewport.x / zoom, minLeft, maxLeft) * zoom,
    y: -clamp(-viewport.y / zoom, minTop, maxTop) * zoom,
    zoom,
  };
}
