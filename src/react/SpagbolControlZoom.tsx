import { SPAGBOL_ZOOM_BASELINE, spagbolZoomPercentage } from "./zoom.js";
import { ControlButton, Controls, useReactFlow } from "@xyflow/react";
import type { ReactNode } from "react";

export interface SpagbolControlZoomProps {
  zoom: number;
  className?: string;
  onReset?(): void;
  extra?: ReactNode;
  layout?: "flow" | "corner";
}
/** Zoom UI reusable with either Spagbol's controller or a host-owned flow. */
export function SpagbolControlZoom({
  zoom,
  className,
  onReset,
  extra,
  layout = "flow",
}: SpagbolControlZoomProps) {
  const flow = useReactFlow();
  const percentage = spagbolZoomPercentage(zoom);
  const reset = () => {
    if (onReset) onReset();
    else void flow.zoomTo(SPAGBOL_ZOOM_BASELINE);
  };
  const label = `Reset zoom to 100% (currently ${percentage})`;
  if (layout === "flow")
    return (
      <Controls
        showInteractive={false}
        className={`spagbol-control-zoom ${className ?? ""}`}
      >
        <ControlButton
          className="react-flow__controls-zoom-percentage"
          type="button"
          onClick={reset}
          aria-label={label}
          title={label}
        >
          {percentage}
        </ControlButton>
        {extra}
      </Controls>
    );
  return (
    <div
      className={`spagbol-control-zoom spagbol-control-zoom-corner nodrag nopan ${className ?? ""}`}
      role="group"
      aria-label="Canvas zoom controls"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="spagbol-control-zoom-stack">
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= 3 - 0.0001}
          onClick={() => {
            void flow.zoomIn();
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= 0.05 + 0.0001}
          onClick={() => {
            void flow.zoomOut();
          }}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Fit graph to view"
          title="Fit graph to view"
          onClick={() => {
            void flow.fitView({ padding: 0.18 });
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
          </svg>
        </button>
      </div>
      <div className="spagbol-control-zoom-extras">
        {extra}
        <button
          type="button"
          className="spagbol-control-zoom-percentage"
          aria-label={label}
          title={label}
          onClick={reset}
        >
          {percentage}
        </button>
      </div>
    </div>
  );
}
