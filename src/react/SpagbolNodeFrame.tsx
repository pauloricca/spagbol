import { graphPortStates, emptyPortState } from "./portState.js";
import { SpagbolNodeGroupPortAdd } from "./SpagbolNodeGroupPortAdd.js";
import { SpagbolNodeGroupPort } from "./SpagbolNodeGroupPort.js";
import {
  Handle,
  Position,
  NodeResizer,
  useUpdateNodeInternals,
  useNodeId,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties, type Ref, type ReactNode } from "react";
import {
  portsFor,
  graphAt,
  isGroupBoundary,
  spagbolGroupKinds,
  spagbolNewPortId,
  groupPanelLayout,
  type GraphNode,
  type PortDefinition,
} from "../core/index.js";
import {
  GraphContext,
  useEditorSelector,
  useSpagbol,
  type SpagbolNodeViewProps,
} from "./context.js";
import { SpagbolControlNumber } from "./SpagbolControlNumber.js";
import { SpagbolNodeFrameTypePicker } from './SpagbolNodeFrameTypePicker.js';
import { nodeFlowId, sourceHandle, targetHandle } from "./geometry.js";

export interface SpagbolNodePortProps {
  port: PortDefinition;
  connectable?: boolean;
  style?: CSSProperties;
  position?: Position;
  className?: string;
}
/** Also usable in a completely custom node renderer. */
export function SpagbolNodePort({ port, connectable = true, style, position, className }: SpagbolNodePortProps) {
  const { editor } = useSpagbol();
  const selection = useEditorSelector(editor, snapshot => snapshot.selection);
  const mode = useEditorSelector(editor, snapshot => snapshot.mode);
  const flowId = useNodeId();
  const selectedLink = mode === 'edit' && selection.linkIds.length === 1
    ? editor.graph.links.find(link => link.id === selection.linkIds[0]) : undefined;
  const nodeId = flowId?.startsWith('node:') ? flowId.slice(5) : undefined;
  const reconnecting = selectedLink && (port.direction === 'output'
    ? selectedLink.source.nodeId === nodeId && selectedLink.source.portId === port.id
    : selectedLink.target.type === 'port' && selectedLink.target.nodeId === nodeId && selectedLink.target.portId === port.id);
  const direction = port.direction;
  return (
    <Handle
      id={direction === "input" ? targetHandle(port.id) : sourceHandle(port.id)}
      type={direction === "input" ? "target" : "source"}
      position={position ?? (direction === "input" ? Position.Left : Position.Right)}
      className={`spagbol-node-port${reconnecting ? ' spagbol-node-port-selected-link' : ''} ${className ?? ""}`}
      isConnectable={
        editor.editing && port.connectable !== false && connectable
      }
      style={style}
      aria-label={`${port.label} ${direction}`}
    />
  );
}
export interface SpagbolNodeFrameProps extends SpagbolNodeViewProps {
  children?: ReactNode;
  overlay?: ReactNode;
  rootRef?: Ref<HTMLDivElement>;
  title?: ReactNode;
  className?: string;
  hidePorts?: boolean;
  headerOutput?: boolean;
  portVisible?(port: PortDefinition): boolean;
  style?: CSSProperties;
  /** Domain widgets inside a shared port row. The canvas owns handles and gestures. */
  renderPortContent?(port: PortDefinition): ReactNode;
  portExtras?: ReactNode;
  portsHeader?: ReactNode;
  forceCompact?: boolean;
}
export function SpagbolNodeFrame(props: SpagbolNodeFrameProps) {
  const { node, selected, projected, children } = props;
  const { editor, views, features, connecting, diagnostics } = useSpagbol();
  const [pointerOver, setPointerOver] = useState(false);
  const updateInternals = useUpdateNodeInternals();
  const flowId = useNodeId();
  const selection = useEditorSelector(editor, snapshot => snapshot.selection);
  const mode = useEditorSelector(editor, snapshot => snapshot.mode);
  const path = useEditorSelector(editor, snapshot => snapshot.path);
  const boundary = isGroupBoundary(node);
  const reorder = useRef<{ pointer: number; portId: string; element: HTMLElement } | null>(null);
  const ports = portsFor(node, editor.nodes);
  const inputPorts = ports.filter((port) => port.direction === "input" && props.portVisible?.(port) !== false);
  const outputPorts = ports.filter((port) => port.direction === "output" && props.portVisible?.(port) !== false);
  const compact = !projected && views[node.kind]?.compact !== false && features.compact && (props.forceCompact || node.compact) && !(selected && selection.nodeIds.length === 1) && !(connecting && pointerOver);
  const headerInput = !boundary ? inputPorts.find(port => port.label === 'signal') : undefined;
  const headerOutput = !boundary && props.headerOutput !== false ? outputPorts.find(port => port.label === 'signal') ?? (outputPorts.length === 1 ? outputPorts[0] : undefined) : undefined;
  const portState = useEditorSelector(editor, snapshot => graphPortStates(graphAt(snapshot.document, snapshot.path)).get(node.id) ?? emptyPortState);
  const connectedInputs = portState.inputs;
  const connectedOutputs = portState.outputs;
  const visibleInputs = inputPorts.filter(port => port !== headerInput && (!compact || connectedInputs.has(port.id)));
  const visibleOutputs = outputPorts.filter(port => port !== headerOutput && (!compact || connectedOutputs.has(port.id)));
  const definition = editor.nodes.get(node.kind);
  const view = views[node.kind];
  const newPortDirection = boundary ? (node.kind === spagbolGroupKinds.inputs ? "output" : "input") : definition?.editablePorts;
  const newPortLabel = definition?.newPortLabel ?? (node.kind === spagbolGroupKinds.inputs ? "new input" : "new output");
  const errors = diagnostics.filter((item) => item.nodeId === node.id);
  const portKey = ports
    .map((port) => `${port.direction}:${port.id}:${port.label}`)
    .join("|");
  useEffect(() => {
    if (projected || !flowId) return;
    const frame = requestAnimationFrame(() => updateInternals(flowId));
    return () => cancelAnimationFrame(frame);
  }, [flowId, portKey, compact, projected, updateInternals]);
  const setInput = portState.replaced;
  function movePort(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = reorder.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-group-port]'));
    const target = rows.findIndex(row => event.clientY < row.getBoundingClientRect().bottom);
    editor.moveBoundaryPort(node.id, drag.portId, target < 0 ? rows.length - 1 : target);
  }
  function endPort(event: ReactPointerEvent<HTMLDivElement>, cancel = false) {
    const drag = reorder.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    event.stopPropagation(); reorder.current = null;
    if (drag.element.hasPointerCapture(event.pointerId)) drag.element.releasePointerCapture(event.pointerId);
    if (cancel) editor.cancelGesture(); else editor.commitGesture();
  }
  function row(port: PortDefinition, index: number) {
    const input = port.direction === "input";
    return (
      <div
        className={`spagbol-node-port-row spagbol-node-port-row-${port.direction}`}
        key={`${port.direction}:${port.id}`}
        data-group-port={boundary ? port.id : undefined}
        style={{ gridColumn: boundary || input || inputPorts.length === 0 ? 1 : 2, gridRow: index + 1 + (props.portsHeader ? 1 : 0) }}
      >
        {!projected && !props.hidePorts && <SpagbolNodePort port={port} />}
        {props.renderPortContent ? props.renderPortContent(port) : <>{boundary && !projected ? <SpagbolNodeGroupPort name={port.label} editable={editor.editing && !props.readOnly} draggable={editor.editing && !props.readOnly} selected={selection.port?.nodeId === node.id && selection.port.portId === port.id} onChange={label => { try { editor.renameBoundaryPort(node.id, port.id, label); } catch { /* Keep the valid label. */ } }} onPointerDown={event => {
          if (!editor.editing || props.readOnly || event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          editor.select({ nodeIds: [node.id], port: { nodeId: node.id, portId: port.id, direction: port.direction } });
          editor.beginGesture('Reorder group ports');
          reorder.current = { pointer: event.pointerId, portId: port.id, element: event.currentTarget };
          event.currentTarget.setPointerCapture(event.pointerId);
        }} /> : <span className="spagbol-node-port-name" title={port.label}>{port.label}</span>}
        {((input && node.kind !== spagbolGroupKinds.outputs) || node.kind === spagbolGroupKinds.inputs) && port.valueEditor !== false && (
          <SpagbolControlNumber
            value={node.values[port.id] ?? port.defaultValue ?? 0}
            onChange={(value) => props.setValue(port.id, value)}
            label={`${node.label ?? definition?.label ?? node.kind}: ${port.label}`}
            min={port.min}
            max={port.max}
            step={port.step}
            integer={port.integer}
            disabled={props.readOnly}
            replaced={setInput.has(port.id)}
            onGestureStart={() => props.beginGesture(`Change ${port.label}`)}
            onGestureEnd={(cancel) => props.endGesture(cancel)}
          />
        )}</>}
      </div>
    );
  }
  return (
    <div
      onPointerEnter={() => setPointerOver(true)} onPointerLeave={() => setPointerOver(false)}
      ref={props.rootRef}
      style={{ ...props.style, ...(node.scale ? { zoom: node.scale, width: view?.autoWidth ? props.style?.width ?? "max-content" : `${100 / node.scale}%`, height: `${100 / node.scale}%` } : view?.autoWidth ? { width: props.style?.width ?? "max-content" } : {}) }}
      onPointerMove={movePort} onPointerUp={event => endPort(event)} onPointerCancel={event => endPort(event, true)}
      className={`spagbol-node-frame${selected ? " spagbol-node-frame-selected" : ""}${node.enabled === false ? " spagbol-node-frame-disabled" : ""}${compact ? " spagbol-node-frame-compact" : ""}${props.forceCompact ? " spagbol-node-frame-auto-compact" : ""}${projected ? " spagbol-node-frame-projected nodrag nopan" : ""} ${props.className ?? ""}`}
    >
      {!projected && view?.resizable && editor.editing && (
        <NodeResizer
          isVisible={selected && !compact}
          minWidth={view.minWidth ?? 180}
          minHeight={view.minHeight ?? 80}
          onResizeStart={() => props.beginGesture("Resize node")}
          onResize={(_, size) =>
            editor.updateNode(
              node.id,
              {
                size: { width: size.width / (node.scale ?? 1), height: size.height / (node.scale ?? 1) },
                position: { x: size.x, y: size.y },
              },
              "layout",
            )
          }
          onResizeEnd={() => props.endGesture()}
        />
      )}
      <div
        style={{ position: "relative" }}
        className="spagbol-node-frame-header spagbol-canvas-drag-handle"
        onDoubleClickCapture={event => { if (projected && props.resetOverride) { event.preventDefault(); event.stopPropagation(); props.resetOverride(); } }}
      >
        {!projected && !props.hidePorts && headerInput && <SpagbolNodePort port={headerInput} style={{ top: "50%" }} />}
        {!projected && !props.hidePorts && headerOutput && <SpagbolNodePort port={headerOutput} style={{ top: "50%" }} />}
        <span className="spagbol-node-frame-title">
          {props.title ?? <SpagbolNodeFrameTypePicker node={node} compact={!!compact} selected={selected} disabled={projected || props.readOnly || !editor.editing} />}
        </span>
        {!projected && <button className="spagbol-node-frame-enabled" type="button" aria-label={node.enabled === false ? 'Enable node' : 'Disable node'} title={node.enabled === false ? 'Enable node' : 'Disable node'} aria-pressed={node.enabled !== false} disabled={!editor.editing || props.readOnly} onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onClick={event => { event.preventDefault(); event.stopPropagation(); editor.updateNode(node.id, { enabled: node.enabled === false }, 'structure'); }}><span className="spagbol-node-frame-enabled-icon" aria-hidden="true" /></button>}
        {!projected && features.compact && !props.forceCompact && view?.compact !== false && (
          <button
            className="spagbol-node-frame-header-button nodrag nopan"
            aria-label={node.compact ? "Expand ports" : "Compact ports"}
            title={node.compact ? "Expand ports" : "Compact ports"}
            disabled={!editor.editing}
            onClick={(event) => {
              event.stopPropagation();
              editor.updateNode(node.id, { compact: !node.compact }, "layout");
            }}
          >
            {node.compact ? "+" : "−"}
          </button>
        )}
        {!projected && node.graph && features.nestedGraphs && (
          <button
            className="spagbol-node-frame-header-button nodrag nopan"
            aria-label="Enter nested graph"
            title="Enter nested graph"
            onClick={(event) => {
              event.stopPropagation();
              editor.enter(node.id);
            }}
          >
            ↳
          </button>
        )}
      </div>
      <>
          {children && (
            <div
              className="spagbol-node-frame-body nodrag nopan"
              onPointerDown={(event) => event.stopPropagation()}
            >
              {children}
            </div>
          )}
          {!props.hidePorts && (visibleInputs.length > 0 || visibleOutputs.length > 0 || newPortDirection) && (
            <div style={inputPorts.length === 0 || outputPorts.length === 0 ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined} className={`spagbol-node-frame-ports${boundary ? " spagbol-node-frame-ports-boundary" : ""}`}>
              {props.portsHeader}
          {visibleInputs.map(row)}
              {visibleOutputs.map(row)}
              {newPortDirection && !projected && editor.editing && <div style={{ gridColumn: newPortDirection === "input" || inputPorts.length === 0 ? 1 : 2, gridRow: ports.length + 1 + (props.portsHeader ? 1 : 0), position: "relative" }}><SpagbolNodePort port={{ id: spagbolNewPortId, label: newPortLabel, direction: newPortDirection }} style={{ top: "50%" }} /><SpagbolNodeGroupPortAdd label={newPortLabel} onAdd={label => { try { editor.addBoundaryPort(node.id, label); } catch { /* Keep the valid boundary. */ } }} /></div>}
            </div>
          )}
          {!compact && props.portExtras}
          {errors.length > 0 && (
            <div
              className="spagbol-node-frame-diagnostics"
              role="status"
              title={errors.map((error) => error.message).join("\n")}
            >
              {errors[0]?.message}
            </div>
          )}
      </>
      {props.overlay}
    </div>
  );
}

export function useNodeViewProps(
  node: GraphNode,
  selected = false,
  projected = false,
  groupId?: string,
): SpagbolNodeViewProps {
  const { editor, projection } = useSpagbol();
  const owner = projection?.groupId ?? groupId;
  const controlPath = projection?.path ?? [node.id];
  const selection = useEditorSelector(editor, snapshot => snapshot.selection);
  const mode = useEditorSelector(editor, snapshot => snapshot.mode);
  const path = useEditorSelector(editor, snapshot => snapshot.path);
  return useMemo(
    () => ({
      node,
      selected,
      projected,
      path: projection ? [...path, projection.groupId, ...projection.path.slice(0, -1)] : path,
      resetOverride: owner ? () => editor.resetOverride(owner, controlPath) : undefined,
      readOnly: mode === "readonly",
      setValue: (portId: string, value: number) =>
        owner
          ? editor.setOverride(owner, controlPath, portId, value)
          : editor.setValue(node.id, portId, value),
      patchData: (data: Partial<GraphNode["data"]>, structural = false) => {
        if (projected) { if (!structural && owner) editor.setDataOverride(owner, controlPath, data); return; }
        editor.updateNode(
          node.id,
          { data: { ...node.data, ...data } as GraphNode["data"] },
          structural ? "structure" : "values",
        );
      },
      beginGesture: (label = "Edit control") => {
        if (!editor.getSnapshot().gesture) editor.beginGesture(label);
      },
      endGesture: (cancel = false) =>
        cancel ? editor.cancelGesture() : editor.commitGesture(),
    }),
    [editor, owner, projection, node, projected, selected, mode, path],
  );
}

export function SpagbolNodePanel({ group }: { group: GraphNode }) {
  const context = useSpagbol();
  const layout = groupPanelLayout(group);
  if (!layout) return null;
  return <div className="spagbol-node-panel nodrag nopan" style={{ position: 'relative', width: layout.size.width, height: layout.size.height }} aria-label="Instance controls" onPointerDown={event => event.stopPropagation()}>
    {layout.nodes.map(node => <GraphContext.Provider key={node.id} value={{ ...context, projection: { groupId: context.projection?.groupId ?? group.id, path: [...(context.projection?.path ?? []), node.id] } }}>
      <div className="spagbol-node-panel-item" style={{ position: 'absolute', left: node.position.x - layout.position.x, top: node.position.y - layout.position.y, width: context.views[node.kind]?.autoWidth ? "max-content" : (node.size?.width ?? 220) * (node.scale ?? 1) }}>
        <SpagbolNodePanelItem node={node} />
      </div>
    </GraphContext.Provider>)}
  </div>;
}
function SpagbolNodePanelItem({ node }: { node: GraphNode }) {
  const { views } = useSpagbol();
  const props = useNodeViewProps(node, false, true);
  const Renderer = views[node.kind]?.projected ?? views[node.kind]?.render;
  if (Renderer) return <Renderer {...props} />;
  const Body = views[node.kind]?.body;
  return <SpagbolNodeFrame {...props} hidePorts={!!Body}>{Body ? <Body {...props} /> : null}</SpagbolNodeFrame>;
}
