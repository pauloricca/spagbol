import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent, type RefObject } from 'react';
/** Numeric entry, scrubbing and modifier-wheel behavior extracted directly from Teia. */
export interface SpagbolControlNumberProps {
  value: number; onChange(value: number): void; label?: string;
  min?: number; max?: number; step?: number; integer?: boolean;
  replaced?: boolean; disabled?: boolean; onClear?(): void; onEditStart?(): void;
  /** Optional host input capture while editing (for example MIDI learn). */
  capture?: { id: number; value: number; onCapture(): void };
  onGestureStart?(): void; onGestureEnd?(cancelled: boolean): void;
}
export const formatNumber = (value: number) => formatNumericValue(value);
export function SpagbolControlNumber({
  value,
  min,
  max,
  step: baseStep,
  integer = false,
  replaced = false,
  onChange,
  onClear,
  capture,
  onEditStart, label = "Value", disabled = false, onGestureStart, onGestureEnd,
}: SpagbolControlNumberProps) {
  const dragStep = integer ? (baseStep ?? 0.01) * 3 : baseStep;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatNumericValue(value));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastCaptureIdRef = useRef<number | null>(null);
  const wheelValueRef = useRef(value);
  const lastWheelTimeRef = useRef(-Infinity);
  const wheelEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelTargetRef = useModifiedWheel<HTMLDivElement>((event) => {
    if (disabled) return;
    if (event.timeStamp - lastWheelTimeRef.current > 160) {
      onGestureStart?.();
      wheelValueRef.current = value;
    }
    lastWheelTimeRef.current = event.timeStamp;
    if (wheelEnd.current) clearTimeout(wheelEnd.current);
    wheelEnd.current = setTimeout(() => { wheelEnd.current = null; onGestureEnd?.(false); }, 160);
    const wheelDelta = wheelAxisDeltaPixels(event, 'vertical');
    if (wheelDelta === 0) return;
    const nextValue = constrainValue(
      roundValue(wheelValueRef.current + wheelDelta * scrubberStep(event, dragStep)),
      min,
      max,
      integer,
    );
    wheelValueRef.current = nextValue;
    onChange(nextValue);
  });
  const dragRef = useRef<{
    pointerId: number;
    anchorY: number;
    anchorValue: number;
    currentValue: number;
    step: number;
    dragging: boolean;
  } | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(formatNumericValue(value));
    }
  }, [editing, value]);

  useEffect(() => {
    if (editing) {
      setDraft(formatNumericValue(value));
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  useEffect(() => {
    if (!editing || !capture) return;
    if (lastCaptureIdRef.current === capture.id) return;

    lastCaptureIdRef.current = capture.id;
    const nextValue = constrainValue(capture.value, min, max, integer);
    setDraft(formatNumericValue(nextValue));
    capture.onCapture();
  }, [editing, integer, max, capture, min]);

  function beginEditing() {
    if (disabled) return;
    onGestureStart?.();
    lastCaptureIdRef.current = capture?.id ?? null;
    onEditStart?.();
    setEditing(true);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (disabled || event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      anchorY: event.clientY,
      anchorValue: value,
      currentValue: value,
      step: scrubberStep(event, dragStep),
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const distance = drag.anchorY - event.clientY;
    if (!drag.dragging && Math.abs(distance) < 3) return;

    if (!drag.dragging) onGestureStart?.();
    drag.dragging = true;
    event.preventDefault();
    event.stopPropagation();

    const step = scrubberStep(event, dragStep);
    if (step !== drag.step) {
      drag.anchorY = event.clientY;
      drag.anchorValue = drag.currentValue;
      drag.step = step;
    }

    const nextValue = constrainValue(
      roundValue(drag.anchorValue + (drag.anchorY - event.clientY) * drag.step),
      min,
      max,
      integer,
    );
    drag.currentValue = nextValue;
    onChange(nextValue);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;

    if (drag.dragging) {
      onGestureEnd?.(false);
      event.currentTarget.blur();
    } else {
      beginEditing();
    }
  }

  function commitDraft() {
    const trimmedDraft = draft.trim();
    if (trimmedDraft.length === 0 && onClear) {
      onClear();
      onGestureEnd?.(false);
      setEditing(false);
      return;
    }

    const nextValue = Number(trimmedDraft);
    if (Number.isFinite(nextValue)) {
      onChange(constrainValue(nextValue, min, max, integer));
    } else {
      setDraft(formatNumericValue(value));
    }
    setEditing(false);
    onGestureEnd?.(false);
  }

  function cancelDraft() {
    onGestureEnd?.(true);
    setDraft(formatNumericValue(value));
    setEditing(false);
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation();
    if (event.key === 'Enter') {
      commitDraft();
    }
    if (event.key === 'Escape') {
      cancelDraft();
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`spagbol-control-number spagbol-control-number-editing${replaced ? ' spagbol-control-number-replaced' : ''} nodrag nopan`}
        aria-label={label}
        disabled={disabled}
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleEditKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        spellCheck={false}
      />
    );
  }

  return (
    <div
      ref={wheelTargetRef}
      className={`spagbol-control-number${replaced ? ' spagbol-control-number-replaced' : ''} nodrag nopan`}
      role="spinbutton"
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={-1}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={startDrag}
      onPointerMove={updateDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.stopPropagation();
          beginEditing();
        }
      }}
    >
      {formatNumericValue(value)}
    </div>
  );
}

function roundValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function scrubberStep(event: { metaKey: boolean; shiftKey: boolean }, baseStep = 0.01): number {
  if (event.metaKey && event.shiftKey) return baseStep * 200;
  if (event.metaKey) return baseStep * 20;
  if (event.shiftKey) return baseStep * 0.1;
  return baseStep;
}

function useModifiedWheel<T extends HTMLElement>(
  onWheel: (event: WheelEvent, target: T) => void,
): RefObject<T | null> {
  const targetRef = useRef<T | null>(null);
  const handlerRef = useRef(onWheel);
  handlerRef.current = onWheel;

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.shiftKey && !event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handlerRef.current(event, target);
    };

    target.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => target.removeEventListener('wheel', handleWheel, { capture: true });
  });

  return targetRef;
}

function wheelAxisDeltaPixels(
  event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode'>,
  direction: 'horizontal' | 'vertical',
): number {
  const delta = direction === 'vertical' ? event.deltaY : event.deltaX;
  if (event.deltaMode === 1) return delta * 16;
  if (event.deltaMode === 2) return delta * window.innerHeight;
  return delta;
}

function constrainValue(value: number, min?: number, max?: number, integer = false): number {
  const rounded = integer ? Math.round(value) : value;
  return Math.min(Math.max(rounded, min ?? -Infinity), max ?? Infinity);
}

function formatNumericValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Object.is(value, -0)) return '0';
  return String(value);
}
