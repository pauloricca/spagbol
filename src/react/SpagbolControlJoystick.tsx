import { useEffect, useRef, type PointerEvent } from 'react';

export interface SpagbolControlJoystickProps {
  x: number;
  y: number;
  elasticity?: number;
  className?: string;
  onChange: (x: number, y: number) => void;
}

export function SpagbolControlJoystick({ x, y, elasticity = 0, onChange, className = '' }: SpagbolControlJoystickProps) {
  const changeRef = useRef(onChange); changeRef.current = onChange;
  const dragPointerRef = useRef<number | null>(null);
  const returnFrameRef = useRef<number | null>(null);
  const returnTimeRef = useRef(0);
  const elasticityRef = useRef(elasticity);
  const normalizedX = clamp(x, 0, 1);
  const normalizedY = clamp(y, 0, 1);
  const positionRef = useRef({ x: normalizedX, y: normalizedY });

  elasticityRef.current = elasticity;
  if (dragPointerRef.current === null && returnFrameRef.current === null) {
    positionRef.current = { x: normalizedX, y: normalizedY };
  }

  useEffect(() => () => {
    if (returnFrameRef.current !== null) {
      window.cancelAnimationFrame(returnFrameRef.current);
    }
  }, []);

  function stopReturn() {
    if (returnFrameRef.current !== null) {
      window.cancelAnimationFrame(returnFrameRef.current);
      returnFrameRef.current = null;
    }
  }

  function startReturn() {
    stopReturn();
    if (!(elasticityRef.current > 0)) return;
    returnTimeRef.current = performance.now();

    function stepReturn(timestamp: number) {
      if (dragPointerRef.current !== null || !(elasticityRef.current > 0)) {
        returnFrameRef.current = null;
        return;
      }

      const elapsedSeconds = Math.min(0.05, Math.max(0, (timestamp - returnTimeRef.current) / 1000));
      returnTimeRef.current = timestamp;
      const current = positionRef.current;
      const deltaX = 0.5 - current.x;
      const deltaY = 0.5 - current.y;
      const distance = Math.hypot(deltaX, deltaY);
      const travel = elasticityRef.current * elapsedSeconds;

      if (distance <= Math.max(0.0001, travel)) {
        positionRef.current = { x: 0.5, y: 0.5 };
        returnFrameRef.current = null;
        changeRef.current(0.5, 0.5);
        return;
      }

      const scale = travel / distance;
      const next = {
        x: current.x + deltaX * scale,
        y: current.y + deltaY * scale,
      };
      positionRef.current = next;
      changeRef.current(next.x, next.y);
      returnFrameRef.current = window.requestAnimationFrame(stepReturn);
    }

    returnFrameRef.current = window.requestAnimationFrame(stepReturn);
  }

  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextX = (event.clientX - bounds.left) / Math.max(1, bounds.width);
    const nextY = 1 - ((event.clientY - bounds.top) / Math.max(1, bounds.height));
    const next = { x: clamp(nextX, 0, 1), y: clamp(nextY, 0, 1) };
    positionRef.current = next;
    onChange(next.x, next.y);
  }

  return (
    <div
      className={`spagbol-control-joystick ${className} nodrag nopan`}
      role="group"
      aria-label="Joystick"
      aria-valuetext={`X ${normalizedX.toFixed(3)}, Y ${normalizedY.toFixed(3)}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!event.isPrimary || event.button !== 0) return;
        stopReturn();
        dragPointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (dragPointerRef.current !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        updateFromPointer(event);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (dragPointerRef.current === event.pointerId) {
          dragPointerRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          startReturn();
        }
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        if (dragPointerRef.current === event.pointerId) {
          dragPointerRef.current = null;
          startReturn();
        }
      }}
      onLostPointerCapture={(event) => {
        if (dragPointerRef.current === event.pointerId) {
          dragPointerRef.current = null;
          startReturn();
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span
        className="spagbol-control-joystick-handle"
        style={{
          left: `calc(${normalizedX} * (100% - var(--joystick-handle-size)))`,
          top: `calc(${1 - normalizedY} * (100% - var(--joystick-handle-size)))`,
        }}
        aria-hidden="true"
      />
    </div>
  );
}


function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0.5)); }
