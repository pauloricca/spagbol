// Extracted from Teia; public component/type names and CSS classes are generic.
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

export interface SpagbolControlSliderProps {
  value: number;
  displayValue?: number;
  direction: 'horizontal' | 'vertical';
  onChange: (value: number) => void;
  onGestureStart?(): void;
  onGestureEnd?(cancel: boolean): void;
}

const SLIDER_WHEEL_SPEED = 0.5;

function sliderPrecisionDivisor(event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): number {
  if (event.metaKey || event.ctrlKey) return 5;
  if (event.shiftKey && event.altKey) return 3;
  return 1;
}

export function SpagbolControlSlider({ value, displayValue, direction, onChange, onGestureStart, onGestureEnd }: SpagbolControlSliderProps) {
  const [interactionValue, setInteractionValue] = useState<number | null>(null);
  const gestureEnd = useRef(onGestureEnd); gestureEnd.current = onGestureEnd;
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDisplay = useRef<number | null>(null);
  function clearPendingDisplay() {
    if (releaseTimer.current !== null) clearTimeout(releaseTimer.current);
    releaseTimer.current = null; pendingDisplay.current = null;
  }
  function releaseDisplay(requested: number, cancel: boolean) {
    clearPendingDisplay();
    if (cancel || Math.abs((displayValue ?? value) - requested) <= 0.001) { setInteractionValue(null); return; }
    pendingDisplay.current = requested;
    releaseTimer.current = setTimeout(() => { clearPendingDisplay(); setInteractionValue(null); }, 200);
  }
  useEffect(() => {
    if (pendingDisplay.current !== null && Math.abs((displayValue ?? value) - pendingDisplay.current) <= 0.001) {
      clearPendingDisplay(); setInteractionValue(null);
    }
  }, [value, displayValue]);
  const dragRef = useRef<{
    pointerId: number;
    lastPointerValue: number;
    value: number;
    cursorBias: number;
    precisionDivisor: number;
  } | null>(null);
  // The pointer owns the display during an edit; delayed engine observations
  // resume when it ends. This also works in apps without audio observations.
  const normalized = clamp(interactionValue ?? displayValue ?? value, 0, 1);
  const wheelValueRef = useRef(normalized);
  const lastWheelTimeRef = useRef(-Infinity);
  const wheelTargetRef = useModifiedWheel<HTMLInputElement>((event, target) => {
    if (dragRef.current) return;
    if (event.timeStamp - lastWheelTimeRef.current > 160) {
      wheelValueRef.current = normalized;
    }
    lastWheelTimeRef.current = event.timeStamp;
    const travel = direction === 'vertical' ? target.clientHeight : target.clientWidth;
    const precisionDivisor = sliderPrecisionDivisor(event);
    const wheelDelta = wheelAxisDeltaPixels(event, direction);
    if (wheelDelta === 0) return;
    const nextValue = clamp(
      wheelValueRef.current
        + wheelDelta * (direction === 'vertical' ? 1 : -1) * SLIDER_WHEEL_SPEED
          / Math.max(1, travel)
          / precisionDivisor,
      0,
      1,
    );
    if (wheelTimer.current === null) { clearPendingDisplay(); onGestureStart?.(); }
    else clearTimeout(wheelTimer.current);
    wheelValueRef.current = nextValue;
    setInteractionValue(nextValue);
    onChange(nextValue);
    wheelTimer.current = setTimeout(() => {
      wheelTimer.current = null; releaseDisplay(wheelValueRef.current, false); gestureEnd.current?.(false);
    }, 160);
  });
  function finishPointer(pointerId: number, cancel: boolean) {
    if (dragRef.current?.pointerId !== pointerId) return;
    const requested = dragRef.current.value;
    dragRef.current = null; releaseDisplay(requested, cancel); gestureEnd.current?.(cancel);
  }
  useEffect(() => {
    const cancel = () => {
      const active = dragRef.current !== null || wheelTimer.current !== null;
      dragRef.current = null;
      if (wheelTimer.current !== null) clearTimeout(wheelTimer.current);
      wheelTimer.current = null;
      clearPendingDisplay();
      if (active) { setInteractionValue(null); gestureEnd.current?.(true); }
    };
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('blur', cancel); cancel(); };
  }, []);
  const fillStyle = direction === 'vertical'
    ? { height: `${normalized * 100}%` }
    : { width: `${normalized * 100}%` };

  function pointerValue(event: PointerEvent<HTMLInputElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    // Keep this unbounded while dragging. Fine control uses relative travel,
    // so clamping here would lose movement once the pointer passed an edge.
    return direction === 'vertical'
      ? 1 - ((event.clientY - bounds.top) / Math.max(1, bounds.height))
      : (event.clientX - bounds.left) / Math.max(1, bounds.width);
  }

  function updateFromPointer(event: PointerEvent<HTMLInputElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const cursorValue = pointerValue(event);
    const precisionDivisor = sliderPrecisionDivisor(event);
    if (precisionDivisor !== drag.precisionDivisor) {
      // Re-anchor when the modifier changes so switching speeds never snaps to
      // the cursor. Without fine control, the bias preserves this position.
      drag.lastPointerValue = cursorValue;
      drag.cursorBias = drag.value - cursorValue;
      drag.precisionDivisor = precisionDivisor;
      return;
    }

    const nextValue = precisionDivisor > 1
      ? drag.value + (cursorValue - drag.lastPointerValue) / precisionDivisor
      : cursorValue + drag.cursorBias;
    drag.lastPointerValue = cursorValue;
    drag.value = clamp(nextValue, 0, 1);
    setInteractionValue(drag.value);
    onChange(drag.value);
  }

  return (
    <div className={[
      'spagbol-control-slider nodrag nopan',
      direction === 'vertical' ? 'spagbol-control-slider-vertical' : 'spagbol-control-slider-horizontal',
    ].join(' ')}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="spagbol-control-slider-fill" style={fillStyle} aria-hidden="true" />
      <input
        ref={wheelTargetRef}
        aria-label="Slider value"
        type="range"
        tabIndex={-1}
        min={0}
        max={1}
        step={0.001}
        value={normalized}
        onChange={(event) => {
          if (dragRef.current) return;
          onChange(Number(event.currentTarget.value));
          event.currentTarget.blur();
        }}
        onFocus={(event) => event.currentTarget.blur()}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!event.isPrimary || event.button !== 0) return;
          if (wheelTimer.current !== null) {
            clearTimeout(wheelTimer.current); wheelTimer.current = null; gestureEnd.current?.(false);
          }
          clearPendingDisplay();
          onGestureStart?.();
          const cursorValue = pointerValue(event);
          const precisionDivisor = sliderPrecisionDivisor(event);
          const initialValue = precisionDivisor > 1 ? normalized : clamp(cursorValue, 0, 1);
          dragRef.current = {
            pointerId: event.pointerId,
            lastPointerValue: cursorValue,
            value: initialValue,
            cursorBias: initialValue - cursorValue,
            precisionDivisor,
          };
          setInteractionValue(initialValue);
          event.currentTarget.setPointerCapture(event.pointerId);
          if (precisionDivisor === 1) onChange(initialValue);
        }}
        onPointerMove={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          event.preventDefault();
          event.stopPropagation();
          updateFromPointer(event);
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (dragRef.current?.pointerId === event.pointerId) {
            finishPointer(event.pointerId, false);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }
          event.currentTarget.blur();
        }}
        onPointerCancel={(event) => {
          event.stopPropagation();
          finishPointer(event.pointerId, true);
          event.currentTarget.blur();
        }}
        onLostPointerCapture={(event) => {
          finishPointer(event.pointerId, true);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.blur();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export type SpagbolControlButtonMode = 'toggle' | 'trigger' | 'temporary';
const BUTTON_CLICK_FLASH_MS = 120;

export interface SpagbolControlButtonProps {
  mode: SpagbolControlButtonMode;
  pressed: number;
  onPressedChange: (value: number) => void;
  onClickPulse: () => void;
}

export function SpagbolControlButton({ mode, pressed, onPressedChange, onClickPulse }: SpagbolControlButtonProps) {
  const [pointerActive, setPointerActive] = useState(false);
  const [clickFlashActive, setClickFlashActive] = useState(false);
  const clickFlashTimeoutRef = useRef<number | null>(null);
  const previousPressedRef = useRef(false);
  const isPressed = pressed >= 0.5;
  const isLit = mode === 'trigger'
    ? clickFlashActive
    : mode === 'temporary'
      ? pointerActive || isPressed
      : isPressed;

  function flashClick() {
    if (clickFlashTimeoutRef.current !== null) {
      window.clearTimeout(clickFlashTimeoutRef.current);
    }
    setClickFlashActive(true);
    clickFlashTimeoutRef.current = window.setTimeout(() => {
      clickFlashTimeoutRef.current = null;
      setClickFlashActive(false);
    }, BUTTON_CLICK_FLASH_MS);
  }

  useEffect(() => {
    if (mode === 'trigger' && isPressed && !previousPressedRef.current) {
      flashClick();
    }
    previousPressedRef.current = isPressed;
  }, [isPressed, mode]);

  useEffect(() => () => {
    if (clickFlashTimeoutRef.current !== null) {
      window.clearTimeout(clickFlashTimeoutRef.current);
    }
  }, []);

  function releaseTemporary() {
    setPointerActive(false);
    if (mode === 'temporary') {
      onPressedChange(0);
    }
  }

  return (
    <button
      className={[
        'spagbol-control-button nodrag nopan',
        isLit ? 'spagbol-control-button-active' : '',
      ].filter(Boolean).join(' ')}
      type="button"
      aria-label="Button value"
      aria-pressed={isLit}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        if (mode === 'temporary') {
          setPointerActive(true);
          onPressedChange(1);
        } else if (mode === 'trigger') {
          flashClick();
          onClickPulse();
        }
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        releaseTemporary();
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        releaseTemporary();
      }}
      onLostPointerCapture={releaseTemporary}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (mode === 'toggle') {
          onPressedChange(isPressed ? 0 : 1);
        }
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

