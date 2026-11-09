import { useEffect, useRef, useState, type ReactNode, type PointerEvent, type MouseEvent } from 'react';

/** Normalized view coordinates, not a serialized curve or runtime data model. */
export interface SpagbolCurveEditorPoint { x: number; y: number; locked?: boolean }
export interface SpagbolCurveEditorProps {
  /** x: 0..1, y: -1..1. The host projects its data into these view coordinates. */
  points: readonly SpagbolCurveEditorPoint[];
  backgroundCurves?: readonly { points: readonly SpagbolCurveEditorPoint[]; className?: string }[];
  className?: string;
  pathClassName?: string;
  ariaLabel?: string;
  /** Actual on-screen size, including canvas zoom, for constant-sized hit targets. */
  displaySize: { width: number; height: number };
  screenEmphasis?: number;
  pointScale?: number;
  minPointSpacing?: number;
  formatValue?: (normalizedValue: number) => string;
  toolbar?: ReactNode;
  underlay?: ReactNode;
  /** SVG children in the fixed 300 × 128 viewBox; decorative, without pointer events. */
  overlay?: ReactNode;
  footer?: ReactNode;
  /** Apply an insertion in host data and return the new point's index, or null to reject. */
  onInsertPoint: (point: { x: number; y: number }) => number | null;
  onMovePoint: (index: number, point: { x: number; y: number }) => void;
  onRemovePoint: (index: number) => void;
  onGestureEnd?: () => void;
}

const width = 300, height = 128, padding = 12;
const innerWidth = width - padding * 2, innerHeight = height - padding * 2;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const screenPoint = (point: { x: number; y: number }) => ({ x: padding + point.x * innerWidth, y: padding + (1 - (point.y + 1) / 2) * innerHeight });
function path(points: readonly SpagbolCurveEditorPoint[]) {
  return points.map((point, index) => {
    const p = screenPoint(point);
    // Preserve Teia's two-decimal SVG path precision.
    return `${index ? 'L' : 'M'}${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`;
  }).join(' ');
}

export function SpagbolCurveEditor({
  points, backgroundCurves = [], className = '', pathClassName = '', ariaLabel = 'Curve editor',
  displaySize, screenEmphasis = 1, pointScale = 1, minPointSpacing = 0.001,
  formatValue = (value) => String(Math.round(value * 1000) / 1000),
  toolbar, underlay, overlay, footer, onInsertPoint, onMovePoint, onRemovePoint, onGestureEnd,
}: SpagbolCurveEditorProps) {
  const editorRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ pointerId: number; index: number } | null>(null);
  const removedByPress = useRef(false);
  const clickRef = useRef<{ index: number | null; time: number }>({ index: null, time: 0 });
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const latest = useRef({ points, onMovePoint, onGestureEnd });
  latest.current = { points, onMovePoint, onGestureEnd };

  function fromPointer(event: { clientX: number; clientY: number }) {
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const x = clamp((event.clientX - rect.left) / rect.width * width, padding, width - padding);
    const y = clamp((event.clientY - rect.top) / rect.height * height, padding, height - padding);
    return { x: (x - padding) / innerWidth, y: (1 - (y - padding) / innerHeight) * 2 - 1 };
  }
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const current = latest.current.points;
      const selected = current[drag.index];
      if (!selected || selected.locked) return;
      event.preventDefault();
      const point = fromPointer(event);
      if (!point) return;
      const low = drag.index === 0 ? 0 : (current[drag.index - 1]?.x ?? 0) + minPointSpacing;
      const high = drag.index === current.length - 1 ? 1 : (current[drag.index + 1]?.x ?? 1) - minPointSpacing;
      // A host may reject a move; never cross adjacent point positions.
      if (low > high) return;
      latest.current.onMovePoint(drag.index, { x: clamp(point.x, low, high), y: point.y });
    };
    const stop = (event: globalThis.PointerEvent) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setActivePoint(null);
      latest.current.onGestureEnd?.();
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [minPointSpacing]);

  const hitIndex = (target: EventTarget) => {
    const element = target instanceof Element ? target.closest<SVGElement>('[data-spagbol-curve-point]') : null;
    return element ? Number(element.dataset.spagbolCurvePoint) : null;
  };
  const remove = (index: number) => {
    if (!points[index] || points[index].locked) return;
    if (dragRef.current) onGestureEnd?.();
    dragRef.current = null;
    setActivePoint(null);
    onRemovePoint(index);
  };
  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    event.preventDefault(); event.stopPropagation();
    removedByPress.current = false;
    const index = hitIndex(event.target);
    if (index !== null && Number.isInteger(index)) {
      const now = performance.now();
      if (clickRef.current.index === index && now - clickRef.current.time < 360 && !points[index]?.locked) {
        clickRef.current = { index: null, time: 0 }; removedByPress.current = true; remove(index); return;
      }
      clickRef.current = { index, time: now };
      if (!points[index] || points[index].locked) return;
      dragRef.current = { pointerId: event.pointerId, index };
      setActivePoint(index); event.currentTarget.setPointerCapture(event.pointerId); return;
    }
    const point = fromPointer(event);
    if (!point) return;
    clickRef.current = { index: null, time: 0 };
    const insertedIndex = onInsertPoint(point);
    if (insertedIndex === null) return;
    dragRef.current = { pointerId: event.pointerId, index: insertedIndex };
    setActivePoint(insertedIndex); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const doubleClick = (event: MouseEvent<SVGSVGElement>) => {
    event.preventDefault(); event.stopPropagation();
    if (removedByPress.current) { removedByPress.current = false; return; }
    const index = hitIndex(event.target);
    if (index !== null) remove(index);
  };
  const radius = (pixels: number) => ({ rx: pixels / Math.max(0.001, displaySize.width / width), ry: pixels / Math.max(0.001, displaySize.height / height) });
  const hitRadius = radius(15 * screenEmphasis);
  const endpointRadius = radius(5 * screenEmphasis * pointScale);
  const handleRadius = radius(6 * screenEmphasis * pointScale);
  const valuePoint = points[activePoint ?? hoveredPoint ?? -1];
  const valueScreen = valuePoint && screenPoint(valuePoint);
  return <div className={`spagbol-curve-editor ${className} nodrag nopan`}>
    <div className="spagbol-curve-editor-chart">
      {toolbar}{underlay}
      <svg ref={editorRef} className="spagbol-curve-editor-canvas" viewBox="0 0 300 128" preserveAspectRatio="none" aria-label={ariaLabel} role="img" onPointerDown={pointerDown} onDoubleClick={doubleClick}
        onLostPointerCapture={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) { dragRef.current = null; setActivePoint(null); onGestureEnd?.(); }
        }}>
        <g className="spagbol-curve-editor-chrome">
          {backgroundCurves.map((curve, index) => <path key={index} className={`spagbol-curve-editor-path is-background ${curve.className ?? ''}`} d={path(curve.points)} />)}
          <path className={`spagbol-curve-editor-path ${pathClassName}`} d={path(points)} />
          {overlay}
        </g>
        {points.map((point, index) => {
          const screen = screenPoint(point);
          return <g key={index} onPointerEnter={() => setHoveredPoint(index)} onPointerLeave={() => setHoveredPoint((current) => current === index ? null : current)}>
            <ellipse className={`spagbol-curve-editor-hit-target ${point.locked ? 'is-locked' : ''}`} data-spagbol-curve-point={index} cx={screen.x} cy={screen.y} {...hitRadius} />
            <ellipse className={`spagbol-curve-editor-handle ${point.locked ? 'spagbol-curve-editor-endpoint is-locked' : ''}`} data-spagbol-curve-point={index} cx={screen.x} cy={screen.y} {...(point.locked ? endpointRadius : handleRadius)} />
          </g>;
        })}
      </svg>
      {valuePoint && valueScreen ? <span className={`spagbol-curve-editor-value-label ${valuePoint.x > 0.72 ? 'is-left' : ''} ${valuePoint.y > 0.72 ? 'is-below' : ''}`} style={{ left: `${valueScreen.x / width * 100}%`, top: `${valueScreen.y / height * 100}%` }} aria-hidden="true">{formatValue(valuePoint.y)}</span> : null}
    </div>
    {footer}
  </div>;
}
