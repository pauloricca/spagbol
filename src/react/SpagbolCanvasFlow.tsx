import {
  Background,
  ReactFlow,
  type Node,
  type Edge,
  type ReactFlowProps,
} from "@xyflow/react";

/** Controlled integration boundary for hosts with an existing graph controller.
 * Node/edge payloads and all edit callbacks belong to the host. Use inside a
 * ReactFlowProvider so specialised host nodes retain access to the flow store.
 */
export type SpagbolCanvasFlowProps<
  N extends Node = Node,
  E extends Edge = Edge,
> = ReactFlowProps<N, E> & {
  grid?: false | { color?: string; gap?: number; size?: number };
};
export function SpagbolCanvasFlow<
  N extends Node = Node,
  E extends Edge = Edge,
>({ grid, children, className, ...props }: SpagbolCanvasFlowProps<N, E>) {
  return (
    <ReactFlow<N, E>
      {...props}
      className={`spagbol-canvas-flow ${className ?? ""}`}
    >
      {children}
      {grid !== false && (
        <Background
          color={grid?.color ?? "var(--spagbol-grid, rgba(255,255,255,0.08))"}
          gap={grid?.gap ?? 28}
          size={grid?.size ?? 1}
        />
      )}
    </ReactFlow>
  );
}
