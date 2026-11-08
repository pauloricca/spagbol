import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
export interface SpagbolControlNumberLinkProps {
  value: number;
  onChange: (value: number) => void;
}

export function SpagbolControlNumberLink({ value, onChange }: SpagbolControlNumberLinkProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatNumericValue(value));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wheelValueRef = useRef(value);
  const lastWheelTimeRef = useRef(-Infinity);
  const wheelTargetRef = useRef<HTMLDivElement | null>(null);
  const latestValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  latestValueRef.current = value;
  onChangeRef.current = onChange;
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
    if (!editing) return;

    setDraft(formatNumericValue(value));
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editing, value]);

  useEffect(() => {
    const target = wheelTargetRef.current;
    if (!target || editing) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.shiftKey && !event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.timeStamp - lastWheelTimeRef.current > 160) {
        wheelValueRef.current = latestValueRef.current;
      }
      lastWheelTimeRef.current = event.timeStamp;
      const wheelDelta = verticalWheelDeltaPixels(event);
      if (wheelDelta === 0) return;
      const nextValue = roundValue(wheelValueRef.current + wheelDelta * scrubberStep(event));
      wheelValueRef.current = nextValue;
      onChangeRef.current(nextValue);
    };

    target.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => target.removeEventListener('wheel', handleWheel, { capture: true });
  }, [editing]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      anchorY: event.clientY,
      anchorValue: value,
      currentValue: value,
      step: scrubberStep(event),
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const distance = drag.anchorY - event.clientY;
    if (!drag.dragging && Math.abs(distance) < 3) return;

    drag.dragging = true;
    event.preventDefault();
    event.stopPropagation();

    const step = scrubberStep(event);
    if (step !== drag.step) {
      drag.anchorY = event.clientY;
      drag.anchorValue = drag.currentValue;
      drag.step = step;
    }

    const nextValue = roundValue(drag.anchorValue + (drag.anchorY - event.clientY) * drag.step);
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
      event.currentTarget.blur();
    } else {
      setEditing(true);
    }
  }

  function commitDraft() {
    const nextValue = Number(draft.trim());
    if (Number.isFinite(nextValue)) {
      onChange(nextValue);
    } else {
      setDraft(formatNumericValue(value));
    }
    setEditing(false);
  }

  function cancelDraft() {
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
        className="spagbol-control-number-link spagbol-control-number-link-editing nodrag nopan"
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleEditKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        spellCheck={false}
      />
    );
  }

  return (
    <div
      ref={wheelTargetRef}
      className="spagbol-control-number-link nodrag nopan"
      role="spinbutton"
      tabIndex={-1}
      aria-valuenow={value}
      onPointerDown={startDrag}
      onPointerMove={updateDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.stopPropagation();
          setEditing(true);
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

function scrubberStep(event: { metaKey: boolean; shiftKey: boolean }): number {
  if (event.metaKey && event.shiftKey) return 2;
  if (event.metaKey) return 0.2;
  if (event.shiftKey) return 0.001;
  return 0.01;
}

function verticalWheelDeltaPixels(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  const delta = event.deltaY;
  if (event.deltaMode === 1) return delta * 16;
  if (event.deltaMode === 2) return delta * window.innerHeight;
  return delta;
}

function formatNumericValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Object.is(value, -0)) return '0';
  return String(value);
}
