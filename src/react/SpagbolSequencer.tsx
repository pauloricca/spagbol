// Controlled view projections and edit intents; no persisted sequence model or evaluator.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

export interface SpagbolSequencerItem {
  id: number;
  start: number;
  end: number;
  level: number;
}

export interface SpagbolSequencerProps {
  ariaLabel: string;
  className?: string;
  minLevel?: number;
  rows: number;
  steps: number;
  groupSize?: number;
  currentStep?: number;
  rowLabel: (row: number) => string;
  renderRowLabel?: (row: number) => ReactNode;
  labelPosition?: 'left' | 'right';
  onRowRef?: (row: number, element: HTMLDivElement | null) => void;
  itemsForRow: (row: number) => SpagbolSequencerItem[];
  mode?: 'gate' | 'trigger';
  defaultItemLength?: number;
  allowMove?: boolean;
  allowResize?: boolean;
  allowLevel?: boolean;
  onCreateItem: (row: number, start: number, end: number) => void;
  onCreateItems?: (row: number, gates: Array<{ start: number; end: number }>) => void;
  onUpdateItem: (row: number, id: number, update: Partial<Pick<SpagbolSequencerItem, 'start' | 'end' | 'level'>>) => void;
  onDeleteItem: (row: number, id: number) => void;
}

export function SpagbolSequencer({
  ariaLabel,
  className = '',
  minLevel = 0.1,
  rows,
  steps,
  groupSize = 4,
  currentStep,
  rowLabel,
  renderRowLabel,
  labelPosition = 'left',
  onRowRef,
  itemsForRow,
  mode = 'gate',
  defaultItemLength = 1,
  allowMove = true,
  allowResize = true,
  allowLevel = true,
  onCreateItem,
  onCreateItems,
  onUpdateItem,
  onDeleteItem,
}: SpagbolSequencerProps) {
  const activeStep = Number.isFinite(currentStep) ? Math.floor(currentStep ?? -1) : -1;
  const dragRef = useRef<{ pointerId: number; row: number; gate: SpagbolSequencerItem; x: number; y: number; action: 'move' | 'left' | 'right' | 'level'; moved: boolean } | null>(null);
  const createRef = useRef<{
    pointerId: number;
    row: number;
    anchorX: number;
    start: number;
    end: number;
    lastStep: number;
    positions: Set<number>;
    moved: boolean;
  } | null>(null);
  const [createPreview, setCreatePreview] = useState<{ row: number; gates: Array<{ start: number; end: number }> } | null>(null);

  const positionInRow = (event: PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.closest('.spagbol-sequencer-cells')?.getBoundingClientRect();
    if (!bounds) return 0;
    return Math.max(0, Math.min(steps, ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * steps));
  };

  const beginCreate = (event: PointerEvent<HTMLButtonElement>, row: number, step: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const existing = itemsForRow(row);
    if (existing.some((gate) => step >= gate.start && step < gate.end)) return;
    const nextStart = mode === 'gate'
      ? existing.filter((gate) => gate.start > step).reduce((boundary, gate) => Math.min(boundary, gate.start), steps)
      : steps;
    const end = mode === 'trigger' ? Math.min(steps, step + 1) : Math.min(nextStart, step + defaultItemLength);
    if (end - step < 0.05) return;
    createRef.current = {
      pointerId: event.pointerId,
      row,
      anchorX: event.clientX,
      start: step,
      end,
      lastStep: step,
      positions: new Set([step]),
      moved: false,
    };
    setCreatePreview({ row, gates: [{ start: step, end }] });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveCreate = (event: PointerEvent<HTMLButtonElement>) => {
    const create = createRef.current;
    if (!create || create.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - create.anchorX) >= 3) create.moved = true;
    if (mode === 'trigger') {
      const nextStep = Math.max(0, Math.min(steps - 1, Math.floor(positionInRow(event))));
      const direction = nextStep >= create.lastStep ? 1 : -1;
      for (let step = create.lastStep; step !== nextStep + direction; step += direction) create.positions.add(step);
      create.lastStep = nextStep;
      const occupied = itemsForRow(create.row);
      const gates = [...create.positions]
        .filter((step) => !occupied.some((gate) => Math.abs(gate.start - step) < 0.000001))
        .sort((left, right) => left - right)
        .map((step) => ({ start: step, end: Math.min(steps, step + 1) }));
      setCreatePreview({ row: create.row, gates });
      return;
    }
    if (!create.moved) return;
    const nextStart = itemsForRow(create.row)
      .filter((gate) => gate.start > create.start)
      .reduce((boundary, gate) => Math.min(boundary, gate.start), steps);
    create.end = Math.max(create.start + 0.05, Math.min(nextStart, positionInRow(event)));
    setCreatePreview({ row: create.row, gates: [{ start: create.start, end: create.end }] });
  };

  const finishCreate = (pointerId: number) => {
    const create = createRef.current;
    if (!create || create.pointerId !== pointerId) return;
    const occupied = itemsForRow(create.row);
    const gates = mode === 'trigger'
      ? [...create.positions]
          .filter((step) => !occupied.some((gate) => Math.abs(gate.start - step) < 0.000001))
          .sort((left, right) => left - right)
          .map((step) => ({ start: step, end: Math.min(steps, step + 1) }))
      : [{ start: create.start, end: create.end }];
    if (onCreateItems) onCreateItems(create.row, gates);
    else for (const gate of gates) onCreateItem(create.row, gate.start, gate.end);
    createRef.current = null;
    setCreatePreview(null);
  };

  const beginDrag = (event: PointerEvent<HTMLElement>, row: number, gate: SpagbolSequencerItem, action: 'move' | 'left' | 'right' | 'level') => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    dragRef.current = { pointerId: event.pointerId, row, gate, x: event.clientX, y: event.clientY, action, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.closest('.spagbol-sequencer-cells')?.getBoundingClientRect();
    const delta = ((event.clientX - drag.x) / Math.max(1, bounds?.width ?? steps * 26)) * steps;
    const velocityDelta = (event.clientY - drag.y) / Math.max(1, bounds?.height ?? 26);
    drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 3;
    if (!drag.moved) return;
    if (drag.action === 'level') return onUpdateItem(drag.row, drag.gate.id, { level: Math.max(minLevel, Math.min(1, drag.gate.level - velocityDelta)) });
    const length = drag.gate.end - drag.gate.start;
    if (mode === 'trigger') {
      const start = Math.max(0, Math.min(steps - 1, drag.gate.start + delta));
      return onUpdateItem(drag.row, drag.gate.id, { start, end: Math.min(steps, start + 1) });
    }
    const otherGates = itemsForRow(drag.row).filter((gate) => gate.id !== drag.gate.id);
    const previousEnd = otherGates
      .filter((gate) => gate.start < drag.gate.start)
      .reduce((boundary, gate) => Math.max(boundary, gate.end), 0);
    const nextStart = otherGates
      .filter((gate) => gate.start >= drag.gate.end)
      .reduce((boundary, gate) => Math.min(boundary, gate.start), steps);
    if (drag.action === 'move') {
      const start = Math.max(previousEnd, Math.min(nextStart - length, drag.gate.start + delta));
      return onUpdateItem(drag.row, drag.gate.id, { start, end: start + length });
    }
    if (drag.action === 'left') return onUpdateItem(drag.row, drag.gate.id, { start: Math.max(previousEnd, Math.min(drag.gate.end - 0.05, drag.gate.start + delta)) });
    onUpdateItem(drag.row, drag.gate.id, { end: Math.max(drag.gate.start + 0.05, Math.min(nextStart, drag.gate.end + delta)) });
  };
  const finishDrag = (pointerId: number) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    if (!drag.moved && drag.action === 'move') onDeleteItem(drag.row, drag.gate.id);
    dragRef.current = null;
  };
  const endDrag = (event: PointerEvent<HTMLElement>) => finishDrag(event.pointerId);
  const cancelDrag = (pointerId: number) => {
    if (dragRef.current?.pointerId === pointerId) dragRef.current = null;
  };

  useEffect(() => {
    const finishPointer = (event: globalThis.PointerEvent) => {
      finishCreate(event.pointerId);
      finishDrag(event.pointerId);
    };
    const cancelPointer = (event: globalThis.PointerEvent) => {
      if (createRef.current?.pointerId === event.pointerId) {
        createRef.current = null;
        setCreatePreview(null);
      }
      cancelDrag(event.pointerId);
    };
    window.addEventListener('pointerup', finishPointer);
    window.addEventListener('pointercancel', cancelPointer);
    return () => {
      window.removeEventListener('pointerup', finishPointer);
      window.removeEventListener('pointercancel', cancelPointer);
    };
  });

  return (
    <div className={`spagbol-sequencer spagbol-sequencer-label-${labelPosition} ${className} nodrag nopan`} style={{ '--spagbol-sequencer-steps': steps } as CSSProperties} aria-label={ariaLabel} onDoubleClick={(event) => event.stopPropagation()}>
      {Array.from({ length: rows }, (_, row) => (
        <div className="spagbol-sequencer-row" key={row} ref={(element) => onRowRef?.(row, element)}>
          {labelPosition === 'left' ? <div className="spagbol-sequencer-label">{renderRowLabel?.(row) ?? rowLabel(row)}</div> : null}
          <div className="spagbol-sequencer-cells" role="row">
            {Array.from({ length: steps }, (_, step) => (
              <button
                className={['spagbol-sequencer-cell', Math.floor(step / groupSize) % 2 === 1 ? 'spagbol-sequencer-cell-beat-highlight' : '', activeStep === step ? 'spagbol-sequencer-cell-current' : ''].filter(Boolean).join(' ')}
                key={step}
                type="button"
                aria-label={`${rowLabel(row)}, step ${step + 1}`}
                data-spagbol-sequencer-cell="true"
                data-row-index={row}
                data-step-index={step}
                onPointerDown={(event) => beginCreate(event, row, step)}
                onPointerMove={moveCreate}
                onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); finishCreate(event.pointerId); }}
                onPointerCancel={(event) => { createRef.current = null; setCreatePreview(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
                onLostPointerCapture={(event) => finishCreate(event.pointerId)}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
              />
            ))}
            {createPreview?.row === row ? createPreview.gates.map((gate, index) => (
              <div
                className="spagbol-sequencer-gate spagbol-sequencer-create-preview"
                key={`${gate.start}:${index}`}
                style={{ left: `${gate.start / steps * 100}%`, width: `${(gate.end - gate.start) / steps * 100}%` }}
              />
            )) : null}
            {itemsForRow(row).map((gate) => (
              <div
                className="spagbol-sequencer-gate"
                key={gate.id}
                style={{ top: `${(1 - gate.level) * 100}%`, left: `${gate.start / steps * 100}%`, width: `${(gate.end - gate.start) / steps * 100}%` }}
                role="button"
                tabIndex={0}
                aria-label={`${rowLabel(row)} ${mode} from ${gate.start.toFixed(2)} to ${gate.end.toFixed(2)}, level ${gate.level.toFixed(2)}`}
                onPointerDown={(event) => { if (allowMove && event.target === event.currentTarget) beginDrag(event, row, gate, 'move'); }}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={(event) => cancelDrag(event.pointerId)}
                onLostPointerCapture={(event) => cancelDrag(event.pointerId)}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
              >
                {allowLevel ? <span className="spagbol-sequencer-level-handle" onPointerDown={(event) => beginDrag(event, row, gate, 'level')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={(event) => cancelDrag(event.pointerId)} /> : null}
                {allowResize ? <><span className="spagbol-sequencer-gate-handle spagbol-sequencer-gate-handle-left" onPointerDown={(event) => beginDrag(event, row, gate, 'left')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={(event) => cancelDrag(event.pointerId)} /><span className="spagbol-sequencer-gate-handle spagbol-sequencer-gate-handle-right" onPointerDown={(event) => beginDrag(event, row, gate, 'right')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={(event) => cancelDrag(event.pointerId)} /></> : null}
              </div>
            ))}
          </div>
          {labelPosition === 'right' ? <div className="spagbol-sequencer-label">{renderRowLabel?.(row) ?? rowLabel(row)}</div> : null}
        </div>
      ))}
    </div>
  );
}

