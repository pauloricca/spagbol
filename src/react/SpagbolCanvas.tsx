import { SPAGBOL_ZOOM_BASELINE, spagbolHeaderTitleScale } from "./zoom.js";
import { previewNodePositions, applyNodePositions } from "./nodeDrag.js";
import { createPortal } from "react-dom";
import { SpagbolCanvasLinkControls } from "./SpagbolCanvasLinkControls.js";
import { SpagbolCanvasFlow } from "./SpagbolCanvasFlow.js";
import {
  applyNodeChanges,
  BaseEdge,
  ConnectionLineType,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ViewportPortal,
  useReactFlow,
  useStore,
  useStoreApi,
  useUpdateNodeInternals,
  useNodeId,
  useNodesInitialized,
  useViewport,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type NodeChange,
  type EdgeChange,
  type OnConnectStartParams,
  type Viewport,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  areaMembers,
  groupPanelLayout,
  spagbolGroupKinds,
  copyFragment,
  createId,
  portsFor,
  readFragment,
  type Diagnostic,
  type GraphArea,
  type GraphEditor,
  type GraphLink,
  type GraphNode,
  type LinkTarget,
  type Point,
} from "../core/index.js";
import {
  GraphContext,
  useEditorSnapshot,
  useEditorSelector,
  useSpagbol,
  type SpagbolCanvasSlots,
  type SpagbolCanvasFeatures,
  type SpagbolTheme,
  type SpagbolNodeView,
} from "./context.js";
import { SpagbolNodeFrame, SpagbolNodePanel, useNodeViewProps } from "./SpagbolNodeFrame.js";
import { SpagbolControlNumber } from "./SpagbolControlNumber.js";
import {
  SpagbolCanvasControls,
  type SpagbolCanvasControlsOptions,
} from "./SpagbolCanvasControls.js";
import {
  rememberMeasurements,
  reuseFlowPresentations,
  stationaryReconnectEdge,
} from "./flowPresentation.js";
import {
  duplicateDragPresentation,
  type DuplicateDrag,
} from "./duplicateDrag.js";
import {
  translateExtentForVisibleContent,
  clampViewportToTranslateExtent,
  infiniteCanvasExtent,
} from "./viewport.js";
import {
  anchorFlowId,
  areaFlowId,
  linkPath,
  nodeFlowId,
  parseHandle,
  sourceHandle,
  targetHandle,
} from "./geometry.js";

interface FlowData extends Record<string, unknown> {
  node?: GraphNode;
  area?: GraphArea;
  linkId?: string;
  projected?: boolean;
  stationaryOriginal?: boolean;
}
type FlowNode = Node<FlowData, "spagbolNode" | "spagbolArea" | "spagbolAnchor">;
interface LinkData extends Record<string, unknown> {
  link: GraphLink;
  emphasized?: boolean;
  dimmed?: boolean;
  feedback?: boolean;
  control?: boolean;
  virtual?: boolean;
  disabled?: boolean;
  preview?: boolean;
}
type FlowLink = Edge<LinkData, "spagbolLink">;
export interface SpagbolLinkPresentation {
  feedback?: boolean;
  control?: boolean;
  virtual?: boolean;
}
export interface SpagbolCanvasProps extends SpagbolCanvasSlots {
  editor: GraphEditor;
  views?: Readonly<Record<string, SpagbolNodeView>>;
  /** Limit creation/type conversion without discarding existing unsupported nodes. */
  nodeKinds?: readonly string[];
  /** Domain conversion, e.g. capturing an asset before replacing a DSP node. */
  onChangeNodeKind?(id: string, kind: string): void | Promise<void>;
  features?: SpagbolCanvasFeatures;
  diagnostics?: readonly Diagnostic[];
  linkPresentation?: Readonly<Record<string, SpagbolLinkPresentation>>;
  /** Read-only domain relationships, never stored, copied or selected. */
  virtualLinks?: readonly GraphLink[];
  className?: string;
  style?: SpagbolTheme;
  defaultViewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
  onInit?(instance: ReactFlowInstance): void;
  /** Teia-style content bounds by default; optional margin in screen proportions. */
  panBounds?: false | { emptyScreenRatio?: number };
  onRenderTarget?(key: string, element: HTMLElement | null): void;
  toolbar?: boolean | ReactNode;
  controls?: SpagbolCanvasControlsOptions | false;
  ariaLabel?: string;
}
const defaultGraphViewport = { x: 0, y: 0, zoom: SPAGBOL_ZOOM_BASELINE };
const emptyFlowNodes: FlowNode[] = [];
const emptyViews: Readonly<Record<string, SpagbolNodeView>> = Object.freeze({});
const emptyPresentations: Readonly<Record<string, SpagbolLinkPresentation>> =
  Object.freeze({});
const defaultFeatures: SpagbolCanvasFeatures = { compact: true, nestedGraphs: true, panels: true, areas: true, linkProperties: true };

export function SpagbolCanvas(props: SpagbolCanvasProps) {
  const margin =
    props.panBounds === false ? undefined : props.panBounds?.emptyScreenRatio;
  if (margin !== undefined && (!Number.isFinite(margin) || margin < 0))
    throw new Error(
      "Pan margin must be a finite, nonnegative screen proportion.",
    );
  const features = useMemo(() => ({ ...defaultFeatures, ...props.features }), [props.features]);
  if (features.panels && !features.nestedGraphs)
    throw new Error("Projected panels require the nestedGraphs feature.");
  return (
    <ReactFlowProvider>
      <SpagbolCanvasInner {...props} features={features} />
    </ReactFlowProvider>
  );
}
const SpagbolNodeRenderer = memo(function SpagbolNodeRenderer({ data, selected }: NodeProps<FlowNode>) {
  const node = data.node!;
  const { views, features, editor } = useSpagbol();
  const updateInternals = useUpdateNodeInternals();
  const flowId = useNodeId();
  const portKey = portsFor(node, editor.nodes)
    .map((port) => `${port.direction}:${port.id}`)
    .join("|");
  useEffect(() => {
    if (data.projected || !flowId) return;
    const frame = requestAnimationFrame(() => updateInternals(flowId));
    return () => cancelAnimationFrame(frame);
  }, [flowId, portKey, data.projected, updateInternals]);
  const baseProps = useNodeViewProps(node, selected, data.projected === true);
  const props = {
    ...baseProps,
    readOnly: baseProps.readOnly || data.stationaryOriginal === true,
  };
  const view = views[node.kind];
  const Renderer = data.projected ? view?.projected : view?.render;
  const Body = view?.body;
  const content = Renderer ? (
    <Renderer {...props} />
  ) : (
    <SpagbolNodeFrame {...props}>
      {features.panels && node.graph && groupPanelLayout(node) ? (
        <SpagbolNodePanel group={node} />
      ) : null}
      {Body ? <Body {...props} /> : null}
    </SpagbolNodeFrame>
  );
  return data.stationaryOriginal ? (
    <div className="spagbol-canvas-duplicate-origin" inert>
      {content}
    </div>
  ) : (
    content
  );
}, (previous, next) => previous.selected === next.selected && previous.data.node === next.data.node && previous.data.projected === next.data.projected && previous.data.stationaryOriginal === next.data.stationaryOriginal);
const SpagbolCanvasLinkAnchor = memo(function SpagbolCanvasLinkAnchor({ data }: NodeProps<FlowNode>) {
  const { editor, connecting } = useSpagbol();
  return (
    <div className="spagbol-canvas-link-anchor">
      {(editor.policy.linkProperties ?? []).map((property) => (
        <Handle
          key={property}
          id={`property:${property}`}
          type="target"
          position={Position.Left}
          className="spagbol-property-port"
          isConnectable={editor.editing && connecting}
          style={{ opacity: 0 }}
          aria-label={`Link ${property}`}
        />
      ))}
    </div>
  );
}, (before, after) => before.data.linkId === after.data.linkId);
function SpagbolCanvasArea({ data, selected }: NodeProps<FlowNode>) {
  const area = data.area!;
  const { editor, zoom, areaDuplicate } = useSpagbol();
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(area.title);
  const drag = useRef<{
    pointer: number;
    start: Point;
    position: Point;
    size: { width: number; height: number };
    resize: boolean;
    duplicate: boolean;
    offset: Point;
    moved: boolean;
    title: boolean;
  } | null>(null);
  function start(event: PointerEvent<HTMLElement>, resize = false) {
    if (!editor.editing || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    editor.select({ areaIds: [area.id] });
    editor.beginGesture(resize ? "Resize area" : event.altKey ? "Duplicate area" : "Move area");
    if (!resize && event.altKey) areaDuplicate?.(area.id, "start", { x: 0, y: 0 }, event.metaKey || event.ctrlKey || event.shiftKey);
    drag.current = {
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      position: { ...area.position },
      size: { ...area.size },
      resize,
      duplicate: !resize && event.altKey, offset: { x: 0, y: 0 }, moved: false, title: !!(event.target as HTMLElement).closest(".spagbol-canvas-area-title"),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    event.stopPropagation();
    const x = (event.clientX - current.start.x) / zoom,
      y = (event.clientY - current.start.y) / zoom;
    current.offset = { x, y };
    current.moved ||= Math.abs(x) + Math.abs(y) > 3 / zoom;
    if (current.duplicate) { areaDuplicate?.(area.id, "move", { x, y }); return; }
    if (current.resize) {
      const members = areaMembers(editor.graph, area.id);
      const minWidth = area.locked
        ? Math.max(
            140,
            ...editor.graph.nodes
              .filter((node) => members.nodeIds.has(node.id))
              .map(
                (node) =>
                  node.position.x - area.position.x + (node.size?.width ?? 220),
              ),
          )
        : 140;
      const minHeight = area.locked
        ? Math.max(
            80,
            ...editor.graph.nodes
              .filter((node) => members.nodeIds.has(node.id))
              .map(
                (node) =>
                  node.position.y -
                  area.position.y +
                  (node.size?.height ?? 120),
              ),
          )
        : 80;
      editor.updateArea(area.id, {
        size: {
          width: Math.max(minWidth, current.size.width + x),
          height: Math.max(minHeight, current.size.height + y),
        },
      });
    } else
      editor.moveArea(area.id, {
        x: current.position.x + x,
        y: current.position.y + y,
      });
  }
  function end(event: PointerEvent<HTMLElement>, cancel = false) {
    const current = drag.current;
    if (current?.pointer !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.duplicate) areaDuplicate?.(area.id, cancel || !current.moved ? 'cancel' : 'end', current.offset);
    else {
      if (cancel) editor.cancelGesture(); else editor.commitGesture();
      if (!cancel && !current.moved && current.title) { setTitleDraft(area.title); setTitleEditing(true); }
    }
  }
  const pointerHandlers = {
    onPointerMove: move,
    onPointerUp: (event: PointerEvent<HTMLElement>) => end(event),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => end(event, true),
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) =>
      end(event, true),
  };
  return (
    <div
      inert={data.stationaryOriginal === true}
      className={`spagbol-canvas-area${selected ? " spagbol-canvas-area-selected" : ""}${area.collapsed ? " spagbol-canvas-area-collapsed" : ""}`}
      style={{
        width: area.size.width,
        height: area.collapsed
          ? 34 + (area.controlHeight ?? 0)
          : area.size.height,
      }}
    >
      <div
        className="spagbol-canvas-area-header nodrag nopan"
        onPointerDown={(event) => start(event)}
        {...pointerHandlers}
      >
        {titleEditing ? <input autoFocus className="spagbol-canvas-area-title-input nodrag nopan" aria-label="Area title" value={titleDraft} onFocus={event => event.currentTarget.select()} onChange={event => setTitleDraft(event.currentTarget.value)} onPointerDown={event => event.stopPropagation()} onBlur={() => { editor.updateArea(area.id, { title: titleDraft.trim() || 'Container' }); setTitleEditing(false); }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setTitleDraft(area.title); setTitleEditing(false); } }} /> : <span className="spagbol-canvas-area-title" onDoubleClick={event => { event.stopPropagation(); if (editor.editing) { setTitleDraft(area.title); setTitleEditing(true); } }}>{area.title}</span>}
        <div
          className="spagbol-canvas-area-actions"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="spagbol-canvas-area-lock"
            title={area.locked ? "Unlock area membership" : "Lock area membership"}
            aria-label={area.locked ? "Unlock area membership" : "Lock area membership"}
            aria-pressed={area.locked === true}
            disabled={!editor.editing}
            onDoubleClick={event => event.stopPropagation()}
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              editor.lockArea(area.id, !area.locked);
            }}
          >
            <span className="spagbol-canvas-area-lock-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="spagbol-canvas-area-compact"
            aria-pressed={area.collapsed === true}
            title={area.collapsed ? "Expand area" : "Collapse area"}
            aria-label={area.collapsed ? "Expand area" : "Collapse area"}
            disabled={!editor.editing}
            onClick={() =>
              editor.updateArea(area.id, { collapsed: !area.collapsed })
            }
          >
            {area.collapsed ? "+" : "−"}
          </button>
        </div>
      </div>
      {!area.collapsed && area.controlHeight ? (
        <div
          className="spagbol-canvas-area-divider"
          style={{ top: 34 + area.controlHeight }}
        />
      ) : null}
      {!area.collapsed && editor.editing && (
        <button
          className="spagbol-canvas-area-resize nodrag nopan"
          aria-label="Resize area"
          onPointerDown={(event) => start(event, true)}
          {...pointerHandlers}
        />
      )}
      <Handle
        id="collapsed:in"
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="spagbol-canvas-area-pin"
        style={{ top: 17 }}
      />
      <Handle
        id="collapsed:out"
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="spagbol-canvas-area-pin"
        style={{ top: 17 }}
      />
    </div>
  );
}

const SpagbolCanvasLink = memo(function SpagbolCanvasLink(props: EdgeProps<FlowLink>) {
  const { editor, diagnostics, linkOverlay, connecting } = useSpagbol();
  const flow = useReactFlow();
  const viewport = useViewport();
  const [controlsVisible, setControlsVisible] = useState(false);
  const selectedLinkId = useEditorSelector(editor, snapshot => snapshot.selection.linkIds.length === 1 ? snapshot.selection.linkIds[0] : undefined);
  const showControls = props.selected && selectedLinkId === props.id && editor.editing && !connecting && !props.data?.virtual;
  useEffect(() => {
    if (!showControls) { setControlsVisible(false); return; }
    const timer = window.setTimeout(() => setControlsVisible(true), 260);
    return () => window.clearTimeout(timer);
  }, [showControls]);
  const link = props.data!.link;
  const [path, x, y] = linkPath(
    { x: props.sourceX, y: props.sourceY },
    { x: props.targetX, y: props.targetY },
    props.data?.feedback,
    link.target.type === "port" && link.source.nodeId === link.target.nodeId,
  );
  const mode = editor.modes.get(link.mode);
  const errors = diagnostics.filter((item) => item.linkId === link.id);
  const selected = props.selected;
  const className = `spagbol-canvas-link${selected || props.data?.emphasized ? " spagbol-canvas-link-emphasized" : ""}${props.data?.dimmed ? " spagbol-canvas-link-dimmed" : ""}${props.data?.disabled ? " spagbol-canvas-link-disabled" : ""}${props.data?.control ? " spagbol-canvas-link-control" : ""}${props.data?.virtual ? " spagbol-canvas-link-virtual" : ""}${errors.length ? " spagbol-canvas-link-error" : ""}`;
  return (
    <>
      <path
        d={path}
        className="spagbol-canvas-link-underlay"
        fill="none"
        style={{ strokeWidth: selected || props.data?.emphasized ? 7 : 5 }}
      />
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={
          link.source.nodeId ===
          (link.target.type === "port" ? link.target.nodeId : null)
            ? 38
            : 22
        }
        className={`${className}${props.data?.preview ? " spagbol-canvas-link-preview" : ""}`}
        style={{ stroke: mode?.color ?? "var(--spagbol-muted)" }}
      />
      <path
        d={path}
        className="spagbol-canvas-link-hit"
        data-spagbol-link={link.id}
        fill="none"
        pointerEvents="none"
      />
      {showControls && controlsVisible && linkOverlay && createPortal(
        <SpagbolCanvasLinkControls
          style={{ left: flow.flowToScreenPosition({ x, y }).x, top: flow.flowToScreenPosition({ x, y: !(props.data?.feedback || props.source === props.target) && Math.hypot(props.targetX - props.sourceX, props.targetY - props.sourceY) < 144 ? y - 52 : y }).y, transform: `translate(-50%, -50%) scale(${viewport.zoom})` }}
          weight={link.weight} mode={link.mode} enabled={link.enabled !== false}
          modes={editor.modes.list().filter(mode => !editor.policy.modes || editor.policy.modes.includes(mode.id))}
          onWeightChange={weight => editor.updateLink(link.id, { weight })}
          onModeChange={mode => editor.updateLink(link.id, { mode })}
          onEnabledChange={enabled => editor.updateLink(link.id, { enabled })}
        />, linkOverlay)}
      {errors.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className="spagbol-canvas-link-diagnostic"
            role="status"
            style={{
              transform: `translate(-50%, -50%) translate(${x}px,${y + 18}px)`,
            }}
            title={errors.map((error) => error.message).join("\n")}
          >
            !
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}, (before, after) => {
  if (before.id !== after.id || before.selected !== after.selected || before.source !== after.source || before.target !== after.target || before.sourceX !== after.sourceX || before.sourceY !== after.sourceY || before.targetX !== after.targetX || before.targetY !== after.targetY) return false;
  const keys = Object.keys(before.data ?? {});
  return keys.length === Object.keys(after.data ?? {}).length && keys.every(key => before.data?.[key] === after.data?.[key]);
});
const nodeTypes = {
  spagbolNode: SpagbolNodeRenderer,
  spagbolArea: SpagbolCanvasArea,
  spagbolAnchor: SpagbolCanvasLinkAnchor,
};
const edgeTypes = { spagbolLink: SpagbolCanvasLink };

interface Picker {
  point: Point;
  screen: Point;
  linkId?: string;
  origin?: { nodeId: string; portId: string; direction: "input" | "output" };
}
function SpagbolCanvasInner({
  editor,
  views = emptyViews,
  features = defaultFeatures,
  linkPresentation = emptyPresentations,
  ...props
}: SpagbolCanvasProps) {
  const snapshot = useEditorSnapshot(editor);
  const graph = editor.graph;
  const root = useRef<HTMLDivElement>(null);
  const [linkOverlay, setLinkOverlay] = useState<HTMLDivElement | null>(null);
  const instanceId = useId();
  const flow = useReactFlow<FlowNode, FlowLink>();
  const flowStore = useStoreApi();
  const nodesInitialized = useNodesInitialized();
  // Only cable-property anchors need live native geometry. Subscribing to every
  // position change otherwise causes redundant full-canvas renders during drags.
  const flowNodes = useStore((state) => features.linkProperties ? state.nodes : emptyFlowNodes);
  // Measurements are canvas state, not saved graph data. Retaining them keeps
  // React Flow from hiding/reinitializing every node on each drag preview frame.
  const measuredSizes = useRef(
    new Map<string, { width: number; height: number }>(),
  );
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const [zoom, setZoom] = useState(props.defaultViewport?.zoom ?? SPAGBOL_ZOOM_BASELINE);
  const [settledViewport, setSettledViewport] = useState<Viewport>(
    props.defaultViewport ?? defaultGraphViewport,
  );
  const [editorSize, setEditorSize] = useState({ width: 0, height: 0 });
  const viewportMoving = useRef(false);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      setEditorSize((previous) =>
        previous.width === bounds.width && previous.height === bounds.height
          ? previous
          : { width: bounds.width, height: bounds.height },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [connecting, setConnecting] = useState(false);
  const [revealedNodeId, setRevealedNodeId] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState(
    editor.policy.modes?.[0] ?? editor.modes.list()[0]?.id ?? "set",
  );
  const [picker, setPicker] = useState<Picker | null>(null);
  const [search, setSearch] = useState("");
  const [pickerIndex, setPickerIndex] = useState(0);
  const pickerListId = useId();
  const pickerList = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<{
    start: Point;
    end: Point;
    pointer: number;
  } | null>(null);
  const connection = useRef<OnConnectStartParams | null>(null);
  const connectionDone = useRef(false);
  const reconnecting = useRef<string | null>(null);
  const reconnectDuplicate = useRef(false);
  const [reconnectOriginal, setReconnectOriginal] = useState<FlowLink | null>(
    null,
  );
  const duplicate = useRef<DuplicateDrag | null>(null);
  const [duplicatePreview, setDuplicatePreview] =
    useState<DuplicateDrag | null>(null);
  const cancelledNodeDrag = useRef(false);
  // Position previews belong to the canvas, not the persistent document. A drag
  // commits once, avoiding whole-document edits/validation on every pointer move.
  const nodeDrag = useRef<ReadonlyMap<string, Point> | null>(null);
  const [positionRevision, setPositionRevision] = useState(0);
  const clearNodeDrag = () => {
    nodeDrag.current = null;
    // Force a controlled refresh on cancellation, even though the saved position
    // never changed: React Flow currently holds the transient pointer position.
    setPositionRevision(value => value + 1);
  };

  useEffect(() => {
    if (!snapshot.gesture && nodeDrag.current) {
      cancelledNodeDrag.current = true;
      clearNodeDrag();
    }
    if (!snapshot.gesture && duplicate.current) {
      cancelledNodeDrag.current = true;
      duplicate.current = null;
      setDuplicatePreview(null);
    }
  }, [snapshot.gesture]);
  const duplicatePresentation = useMemo(
    () =>
      duplicatePreview
        ? duplicateDragPresentation(graph, duplicatePreview)
        : null,
    [graph, duplicatePreview],
  );
  const baseRenderGraph = duplicatePresentation?.graph ?? graph;
  const renderGraph = useMemo(() => props.virtualLinks?.length ? { ...baseRenderGraph, links: [...baseRenderGraph.links, ...props.virtualLinks] } : baseRenderGraph, [baseRenderGraph, props.virtualLinks]);
  const targets = useRef(new Map<string, HTMLElement>());
  const coreDiagnostics = useMemo(() => editor.diagnostics(), [editor, snapshot.document]);
  const diagnosticKey = JSON.stringify([coreDiagnostics, props.diagnostics ?? []]);
  const diagnostics = useMemo(
    () =>
      [...coreDiagnostics, ...(props.diagnostics ?? [])].filter(
        (item) =>
          item.path.length === snapshot.path.length &&
          item.path.every((id, index) => id === snapshot.path[index]),
      ),
    [diagnosticKey, snapshot.path],
  );
  const registerTarget = useCallback(
    (key: string, element: HTMLElement | null) => {
      if (element) targets.current.set(key, element);
      else targets.current.delete(key);
      props.onRenderTarget?.(key, element);
    },
    [props.onRenderTarget],
  );
  useEffect(
    () => () => {
      for (const key of targets.current.keys())
        props.onRenderTarget?.(key, null);
      targets.current.clear();
    },
    [props.onRenderTarget],
  );
  useEffect(() => {
    setPicker(null);
    setError(null);
  }, [snapshot.path.join("/")]);
  const areaDuplicate = useCallback((id: string, phase: 'start' | 'move' | 'end' | 'cancel', offset: Point, external = false) => {
    if (phase === 'start') {
      const area = editor.graph.areas.find(area => area.id === id);
      if (!area) return;
      cancelledNodeDrag.current = false;
      const fragment = copyFragment(editor.graph, [], [id]);
      duplicate.current = { namespace: createId('preview'), fragment, nodeId: '', origin: area.position, positions: new Map(fragment.nodes.map(node => [node.id, node.position])), areaPositions: new Map(fragment.areas.map(area => [area.id, area.position])), external };
      setDuplicatePreview(duplicate.current);
      return;
    }
    const current = duplicate.current;
    if (!current) return;
    if (phase === 'move') {
      duplicate.current = { ...current,
        positions: new Map(current.fragment.nodes.map(node => [node.id, { x: node.position.x + offset.x, y: node.position.y + offset.y }])),
        areaPositions: new Map(current.fragment.areas.map(area => [area.id, { x: area.position.x + offset.x, y: area.position.y + offset.y }])),
      };
      setDuplicatePreview(duplicate.current);
      return;
    }
    duplicate.current = null; setDuplicatePreview(null);
    if (phase === 'cancel') editor.cancelGesture();
    else { editor.paste(current.fragment, offset, current.external); editor.commitGesture(); }
  }, [editor]);
  const context = useMemo(
    () => ({
      editor,
      views,
      nodeKinds: props.nodeKinds,
      changeNodeKind: props.onChangeNodeKind,
      features,
      diagnostics,
      zoom,
      connecting,
      instanceId,
      areaDuplicate,
      registerTarget,
      linkOverlay,
    }),
    [
      editor,
      views,
      features,
      diagnostics,
      zoom,
      connecting,
      instanceId,
      registerTarget,
      linkOverlay,
      areaDuplicate,
      props.nodeKinds,
      props.onChangeNodeKind,
    ],
  );
  const attempt = useCallback((action: () => void) => {
    try {
      action();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const collapsed = useMemo(() => {
    const nodes = new Map<string, GraphArea>(),
      projected = new Set<string>(),
      hiddenAreas = new Set<string>();
    if (features.areas)
      for (const area of renderGraph.areas.filter((area) => area.collapsed)) {
        const members = areaMembers(renderGraph, area.id);
        for (const id of members.nodeIds) {
          const node = renderGraph.nodes.find((node) => node.id === id);
          if (
            node &&
            (area.controlHeight ?? 0) > 0 &&
            node.position.y >= area.position.y + 34 &&
            node.position.y < area.position.y + 34 + (area.controlHeight ?? 0)
          )
            projected.add(id);
          else nodes.set(id, area);
        }
        for (const id of members.areaIds) hiddenAreas.add(id);
      }
    return { nodes, projected, hiddenAreas };
  }, [renderGraph, features.areas]);
  const modelNodes: FlowNode[] = useMemo(
    () => [
      ...(features.areas
        ? renderGraph.areas.map(
            (area): FlowNode => ({
              id: areaFlowId(area.id),
              type: "spagbolArea",
              position: area.position,
              selected: snapshot.selection.areaIds.includes(area.id),
              hidden: collapsed.hiddenAreas.has(area.id),
              draggable: false,
              selectable: false,
              connectable: false,
              deletable: false,
              zIndex: -1,
              data: { area, stationaryOriginal: duplicatePresentation?.originalAreas.has(area.id) },
              measured: measuredSizes.current.get(areaFlowId(area.id)),
              style: {
                width: area.size.width,
                height: area.collapsed
                  ? 34 + (area.controlHeight ?? 0)
                  : area.size.height,
              },
            }),
          )
        : []),
      ...renderGraph.nodes.map(
        (node): FlowNode => ({
          id: nodeFlowId(node.id),
          type: "spagbolNode",
          position: nodeDrag.current?.get(node.id) ?? node.position,
          selected: snapshot.selection.nodeIds.includes(node.id),
          hidden: collapsed.nodes.has(node.id),
          draggable:
            editor.editing && views[node.kind]?.draggable !== false &&
            !collapsed.projected.has(node.id) &&
            !duplicatePresentation?.originalNodes.has(node.id),
          selectable:
            editor.editing && views[node.kind]?.selectable !== false &&
            !collapsed.projected.has(node.id) &&
            !duplicatePresentation?.originalNodes.has(node.id),
          connectable:
            editor.editing &&
            !collapsed.projected.has(node.id) &&
            !duplicatePresentation?.originalNodes.has(node.id),
          focusable: !duplicatePresentation?.originalNodes.has(node.id),
          deletable: false,
          dragHandle: ".spagbol-canvas-drag-handle",
          data: {
            positionRevision,
            node: duplicatePresentation?.originalNodes.get(node.id) ?? node,
            projected: collapsed.projected.has(node.id),
            stationaryOriginal: duplicatePresentation?.originalNodes.has(
              node.id,
            ),
          },
          measured:
            measuredSizes.current.get(nodeFlowId(node.id)) ??
            (duplicatePresentation?.originalNodes.has(node.id)
              ? measuredSizes.current.get(
                  nodeFlowId(
                    duplicatePresentation.originalNodes.get(node.id)!.id,
                  ),
                )
              : undefined),
          className: duplicatePresentation?.previewNodeIds.has(node.id)
            ? "spagbol-canvas-duplicate-preview"
            : undefined,
          style: {
            width: views[node.kind]?.autoWidth && !node.size?.width ? "max-content" : (node.size?.width ?? Math.max(220, (groupPanelLayout(node)?.size.width ?? 0) + 2)) * (node.scale ?? 1),
            ...(node.size?.height ? { height: node.size.height * (node.scale ?? 1) } : {}),
          },
          zIndex: connecting && revealedNodeId === node.id ? 5 : snapshot.selection.nodeIds.includes(node.id) ? 3 : 1,
        }),
      ),
    ],
    [
      renderGraph,
      positionRevision,
      duplicatePresentation,
      snapshot.selection,
      snapshot.mode,
      editor,
      features.areas,
      collapsed,
      measurementRevision,
      connecting,
      revealedNodeId,
    ],
  );
  // React Flow publishes handle measurements. Only measured geometry participates
  // in anchor derivation, so updating invisible anchors cannot form a render loop.
  const measurementKey = flowNodes
    .filter(
      (node) => node.id.startsWith("node:") || node.id.startsWith("area:"),
    )
    .map((node) => {
      const internal = flow.getInternalNode(node.id);
      return JSON.stringify([
        node.id,
        node.position,
        node.measured,
        internal?.internals.handleBounds,
      ]);
    })
    .join("|");
  const panExtent = useMemo(() => {
    if (props.panBounds === false) return infiniteCanvasExtent;
    // Use saved content, not temporary duplication nodes or invisible link anchors.
    const items = graph.nodes.map((node) => {
      const internal = flow.getInternalNode(nodeFlowId(node.id));
      return {
        position: node.position,
        hidden: collapsed.nodes.has(node.id),
        size: {
          width: internal?.measured?.width ?? node.size?.width ?? 220,
          height: internal?.measured?.height ?? node.size?.height ?? 96,
        },
      };
    });
    if (features.areas)
      items.push(
        ...graph.areas.map((area) => ({
          position: area.position,
          hidden: collapsed.hiddenAreas.has(area.id),
          size: {
            width: area.size.width,
            height: area.collapsed
              ? 34 + (area.controlHeight ?? 0)
              : area.size.height,
          },
        })),
      );
    return translateExtentForVisibleContent(
      items,
      settledViewport,
      editorSize,
      props.panBounds?.emptyScreenRatio ?? 0.7,
    );
  }, [
    graph,
    features.areas,
    collapsed,
    flow,
    measurementKey,
    measurementRevision,
    settledViewport.zoom,
    editorSize,
    props.panBounds,
  ]);
  useEffect(() => {
    if (
      props.panBounds === false ||
      !flow.viewportInitialized ||
      !nodesInitialized ||
      viewportMoving.current ||
      snapshot.gesture
    )
      return;
    const current = flow.getViewport();
    const clamped = clampViewportToTranslateExtent(
      current,
      panExtent,
      editorSize,
    );
    if (
      Math.abs(current.x - clamped.x) < 0.0001 &&
      Math.abs(current.y - clamped.y) < 0.0001 &&
      current.zoom === clamped.zoom
    )
      return;
    setSettledViewport((previous) =>
      previous.x === clamped.x &&
      previous.y === clamped.y &&
      previous.zoom === clamped.zoom
        ? previous
        : clamped,
    );
    void flow.setViewport(clamped);
  }, [
    panExtent,
    editorSize,
    flow,
    settledViewport,
    nodesInitialized,
    snapshot.gesture,
    props.panBounds,
  ]);
  const anchors: FlowNode[] = useMemo(() => {
    if (!features.linkProperties || snapshot.mode !== "edit") return [];
    function endpoint(
      point: { nodeId: string; portId: string },
      direction: "input" | "output",
    ): Point {
      const area = collapsed.nodes.get(point.nodeId);
      if (area)
        return {
          x: area.position.x + (direction === "output" ? area.size.width : 0),
          y: area.position.y + 17,
        };
      const internal = flow.getInternalNode(nodeFlowId(point.nodeId));
      const handle = internal?.internals.handleBounds?.[
        direction === "output" ? "source" : "target"
      ]?.find(
        (handle) =>
          handle.id ===
          (direction === "output"
            ? sourceHandle(point.portId)
            : targetHandle(point.portId)),
      );
      if (internal && handle)
        return {
          x:
            internal.internals.positionAbsolute.x + handle.x + handle.width / 2,
          y:
            internal.internals.positionAbsolute.y +
            handle.y +
            handle.height / 2,
        };
      const node = renderGraph.nodes.find((node) => node.id === point.nodeId);
      return {
        x:
          (node?.position.x ?? 0) +
          (direction === "output" ? (node?.size?.width ?? 220) : 0),
        y: (node?.position.y ?? 0) + 56,
      };
    }
    const cache = new Map<string, Point>();
    function midpoint(link: GraphLink, visited = new Set<string>()): Point {
      const cached = cache.get(link.id);
      if (cached) return cached;
      if (visited.has(link.id)) return { x: 0, y: 0 };
      const next = new Set([...visited, link.id]);
      // Keep the target reference narrowed across callback boundaries.
      const reference =
        link.target.type === "link" ? link.target.linkId : undefined;
      const parent = reference
        ? renderGraph.links.find((candidate) => candidate.id === reference)
        : undefined;
      const destination =
        link.target.type === "port"
          ? endpoint(link.target, "input")
          : parent
            ? midpoint(parent, next)
            : { x: 0, y: 0 };
      const [, x, y] = linkPath(
        endpoint(link.source, "output"),
        destination,
        linkPresentation[
          duplicatePresentation?.previewLinks.get(link.id) ?? link.id
        ]?.feedback,
        link.target.type === "port" &&
          link.source.nodeId === link.target.nodeId,
      );
      const result = { x, y };
      cache.set(link.id, result);
      return result;
    }
    const targeted = new Set(renderGraph.links.flatMap(link => link.target.type === 'link' ? [link.target.linkId] : []));
    return renderGraph.links.filter(link => connecting || targeted.has(link.id)).map((link) => ({
      id: anchorFlowId(link.id),
      type: "spagbolAnchor",
      position: midpoint(link),
      data: { linkId: link.id },
      measured: { width: 1, height: 1 },
      draggable: false,
      selectable: false,
      deletable: false,
      focusable: false,
      zIndex: 4,
      style: { width: 1, height: 1 },
    }));
  }, [
    renderGraph,
    duplicatePresentation,
    features.linkProperties,
    connecting,
    snapshot.mode,
    collapsed,
    linkPresentation,
    measurementKey,
    flow,
  ]);
  const nodePresentations = useRef<FlowNode[]>([]);
  const displayNodes = useMemo(
    () => { const result = reuseFlowPresentations(nodePresentations.current, [...modelNodes, ...anchors]); nodePresentations.current = result; return result; },
    [modelNodes, anchors],
  );
  const graphLinks: FlowLink[] = useMemo(
    () =>
      snapshot.mode === "controls"
        ? []
        : renderGraph.links.flatMap((link): FlowLink[] => {
            if (link.target.type === "link" && !features.linkProperties)
              return [];
            const sourceArea = collapsed.nodes.get(link.source.nodeId);
            const targetArea =
              link.target.type === "port"
                ? collapsed.nodes.get(link.target.nodeId)
                : undefined;
            if (sourceArea && sourceArea.id === targetArea?.id) return [];
            const sourceNode = renderGraph.nodes.find(
              (node) => node.id === link.source.nodeId,
            );
            const targetNodeId =
              link.target.type === "port" ? link.target.nodeId : undefined;
            const targetNode = renderGraph.nodes.find(
              (node) => node.id === targetNodeId,
            );
            const preview =
              duplicatePresentation?.previewLinks.has(link.id) ?? false;
            const presentation = props.virtualLinks?.some(item => item.id === link.id) ? { virtual: true } :
              linkPresentation[
                duplicatePresentation?.previewLinks.get(link.id) ?? link.id
              ];
            const related =
              snapshot.selection.nodeIds.includes(link.source.nodeId) ||
              (!!targetNodeId &&
                snapshot.selection.nodeIds.includes(targetNodeId));
            const selected =
              !duplicatePreview && snapshot.selection.linkIds.includes(link.id);
            return [
              {
                id: link.id,
                type: "spagbolLink",
                source: sourceArea
                  ? areaFlowId(sourceArea.id)
                  : nodeFlowId(link.source.nodeId),
                sourceHandle: sourceArea
                  ? "collapsed:out"
                  : sourceHandle(link.source.portId),
                target: targetArea
                  ? areaFlowId(targetArea.id)
                  : link.target.type === "port"
                    ? nodeFlowId(link.target.nodeId)
                    : anchorFlowId(link.target.linkId),
                targetHandle: targetArea
                  ? "collapsed:in"
                  : link.target.type === "port"
                    ? targetHandle(link.target.portId)
                    : `property:${link.target.property}`,
                selected,
                reconnectable:
                  selected &&
                  editor.editing &&
                  !presentation?.virtual &&
                  !sourceArea &&
                  !targetArea,
                selectable:
                  editor.editing && !presentation?.virtual && !duplicatePreview,
                deletable: false,
                zIndex: selected ? 10 : 0,
                data: {
                  link,
                  preview,
                  ...presentation,
                  emphasized: related || preview,
                  dimmed:
                    !duplicatePreview &&
                    (snapshot.selection.nodeIds.length > 0 ||
                      snapshot.selection.linkIds.length > 0) &&
                    !selected &&
                    !related,
                  disabled:
                    link.enabled === false ||
                    sourceNode?.enabled === false ||
                    targetNode?.enabled === false,
                },
              },
            ];
          }),
    [
      renderGraph,
      duplicatePresentation,
      duplicatePreview,
      snapshot.mode,
      snapshot.selection,
      features.linkProperties,
      collapsed,
      linkPresentation,
      editor,
    ],
  );
  const rawDisplayLinks = useMemo(
    () =>
      reconnectOriginal && snapshot.mode === "edit"
        ? [...graphLinks, reconnectOriginal]
        : graphLinks,
    [graphLinks, reconnectOriginal, snapshot.mode],
  );

  const linkPresentations = useRef<FlowLink[]>([]);
  const displayLinks = useMemo(() => {
    const result = reuseFlowPresentations(linkPresentations.current, rawDisplayLinks);
    linkPresentations.current = result; return result;
  }, [rawDisplayLinks]);

  function modelConnection(
    value: Pick<Connection, "source" | "target"> & {
      sourceHandle?: string | null;
      targetHandle?: string | null;
    },
  ): { source: GraphLink["source"]; target: LinkTarget } | undefined {
    const source = parseHandle(value.sourceHandle),
      target = parseHandle(value.targetHandle);
    if (
      !source ||
      source.direction !== "output" ||
      !value.source.startsWith("node:")
    )
      return;
    if (
      value.target.startsWith("anchor:") &&
      value.targetHandle?.startsWith("property:")
    )
      return {
        source: { nodeId: value.source.slice(5), portId: source.id },
        target: {
          type: "link",
          linkId: value.target.slice(7),
          property: value.targetHandle.slice(9),
        },
      };
    if (
      !target ||
      target.direction !== "input" ||
      !value.target.startsWith("node:")
    )
      return;
    return {
      source: { nodeId: value.source.slice(5), portId: source.id },
      target: {
        type: "port",
        nodeId: value.target.slice(5),
        portId: target.id,
      },
    };
  }
  function onNodesChange(changes: NodeChange<FlowNode>[]) {
    const remeasured = rememberMeasurements(measuredSizes.current, changes);
    if (remeasured) setMeasurementRevision((value) => value + 1);
    const selected = new Set(editor.getSnapshot().selection.nodeIds);
    let selectionChanged = false;
    for (const change of changes)
      if (
        change.type === "select" &&
        change.id.startsWith("node:") &&
        graph.nodes.some((node) => nodeFlowId(node.id) === change.id)
      ) {
        const id = change.id.slice(5);
        if (change.selected) selected.add(id);
        else selected.delete(id);
        selectionChanged = true;
      }
    if (selectionChanged)
      editor.select({
        nodeIds: [...selected],
        linkIds: editor.getSnapshot().selection.linkIds,
      });
    const positions = changes.filter(
      (change) =>
        change.type === "position" &&
        change.position &&
        change.id.startsWith("node:"),
    );
    if (positions.length && duplicate.current) {
      const next = {
        ...duplicate.current,
        positions: new Map(duplicate.current.positions),
      };
      let changed = false;
      for (const change of positions)
        if (
          change.type === "position" &&
          change.position &&
          next.positions.has(change.id.slice(5))
        ) {
          const previous = next.positions.get(change.id.slice(5));
          if (
            previous?.x !== change.position.x ||
            previous?.y !== change.position.y
          ) {
            next.positions.set(change.id.slice(5), { ...change.position });
            changed = true;
          }
        }
      if (!changed) return;
      duplicate.current = next;
      setDuplicatePreview(next);
      return;
    }
    if (cancelledNodeDrag.current) return;
    if (positions.length && nodeDrag.current) {
      const next = previewNodePositions(nodeDrag.current, positions);
      if (next !== nodeDrag.current) nodeDrag.current = next;
      // This is a controlled React Flow: recording positions in a ref does not
      // update native geometry. Publish only the transient node presentation;
      // the graph, validation and history still change once, on drop.
      const state = flowStore.getState();
      state.setNodes(applyNodeChanges(positions, state.nodes));
      return;
    }
    if (positions.length)
      editor.edit("Move nodes", "layout", (graph) => {
        for (const change of positions)
          if (change.type === "position" && change.position) {
            const node = graph.nodes.find(
              (node) => nodeFlowId(node.id) === change.id,
            );
            if (node) node.position = { ...change.position };
          }
      });
  }
  function onEdgesChange(changes: EdgeChange<FlowLink>[]) {
    const selected = new Set(editor.getSnapshot().selection.linkIds);
    let changed = false;
    for (const change of changes)
      if (change.type === "select") {
        if (change.selected) selected.add(change.id);
        else selected.delete(change.id);
        changed = true;
      }
    if (changed)
      editor.select({
        nodeIds: editor.getSnapshot().selection.nodeIds,
        linkIds: [...selected],
      });
  }
  function openPicker(client: Point, extra: Partial<Picker> = {}) {
    if (!editor.editing) return;
    const bounds = root.current?.getBoundingClientRect();
    setSearch("");
    setPickerIndex(0);
    setPicker({
      point: flow.screenToFlowPosition(client),
      screen: {
        x: Math.min(
          client.x - (bounds?.left ?? 0),
          Math.max(8, (bounds?.width ?? 400) - 260),
        ),
        y: Math.min(
          client.y - (bounds?.top ?? 0),
          Math.max(8, (bounds?.height ?? 500) - 320),
        ),
      },
      ...extra,
    });
  }
  function chooseNode(kind: string) {
    if (!picker) return;
    attempt(() => {
      if (kind === 'spagbol.area') { editor.addArea(picker.point); setPicker(null); return; }
      const definition = editor.nodes.get(kind)!;
      if (picker.linkId) {
        const prototype = editor.nodes.create(kind, picker.point);
        const ports = portsFor(prototype, editor.nodes),
          input = ports.find(
            (port) => port.direction === "input" && port.connectable !== false,
          ),
          output = ports.find(
            (port) => port.direction === "output" && port.connectable !== false,
          );
        if (!input || !output)
          throw new Error(
            "Choose a node with an input and an output to insert it into a link.",
          );
        editor.insertNode(
          picker.linkId,
          kind,
          picker.point,
          input.id,
          output.id,
        );
      } else {
        editor.beginGesture(
          picker.origin ? "Create connected node" : "Create node",
        );
        try {
          const id = editor.addNode(kind, picker.point)!;
          if (picker.origin) {
            const node = editor.graph.nodes.find((node) => node.id === id)!;
            const opposite =
              picker.origin.direction === "output" ? "input" : "output";
            const port = definition
              .ports(node)
              .find(
                (port) =>
                  port.direction === opposite && port.connectable !== false,
              );
            if (!port)
              throw new Error(`This node has no connectable ${opposite}.`);
            if (opposite === "input")
              editor.connect(
                { nodeId: picker.origin.nodeId, portId: picker.origin.portId },
                { type: "port", nodeId: id, portId: port.id },
                activeMode,
              );
            else
              editor.connect(
                { nodeId: id, portId: port.id },
                {
                  type: "port",
                  nodeId: picker.origin.nodeId,
                  portId: picker.origin.portId,
                },
                activeMode,
              );
          }
          editor.commitGesture();
        } catch (cause) {
          editor.cancelGesture();
          throw cause;
        }
      }
      setPicker(null);
    });
  }
  function linkAt(
    point: Point,
    source: GraphLink["source"],
    mode: string,
    replacingId?: string,
  ): string | undefined {
    if (
      !features.linkProperties ||
      !(editor.policy.linkProperties ?? []).includes("weight")
    )
      return;
    let best: { id: string; distance: number } | undefined;
    for (const path of root.current?.querySelectorAll<SVGPathElement>(
      "[data-spagbol-link]",
    ) ?? []) {
      const id = path.dataset.spagbolLink;
      if (
        !id ||
        editor.canConnect(
          source,
          { type: "link", linkId: id, property: "weight" },
          mode,
          replacingId,
        )
      )
        continue;
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      const local = new DOMPoint(point.x, point.y).matrixTransform(
        matrix.inverse(),
      );
      const length = path.getTotalLength();
      let distance = Infinity;
      for (let i = 0; i <= 48; i++) {
        const p = path.getPointAtLength((length * i) / 48);
        distance = Math.min(
          distance,
          Math.hypot(p.x - local.x, p.y - local.y) * zoom,
        );
      }
      if (distance < 14 && (!best || distance < best.distance))
        best = { id, distance };
    }
    return best?.id;
  }
  async function paste() {
    let fragment: ReturnType<typeof readFragment> | undefined;
    try {
      const text = await navigator.clipboard?.readText();
      if (text) fragment = readFragment(text);
    } catch {
      /* Fall back to this controller's clipboard. */
    }
    attempt(() => editor.paste(fragment));
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        'input,textarea,select,[contenteditable="true"],[role="spinbutton"]',
      )
    )
      return;
    const command = event.metaKey || event.ctrlKey,
      key = event.key.toLowerCase();
    if (key === "escape") {
      if (duplicate.current || nodeDrag.current) cancelledNodeDrag.current = true;
      if (nodeDrag.current) clearNodeDrag();
      duplicate.current = null;
      setDuplicatePreview(null);
      editor.cancelGesture();
      flowStore.getState().cancelConnection();
      setPicker(null);
      setDrawing(null);
      setConnecting(false);
      connection.current = null;
      connectionDone.current = true;
      setReconnectOriginal(null);
      return;
    }
    if (command && key === "z") {
      event.preventDefault();
      event.shiftKey ? editor.redo() : editor.undo();
      return;
    }
    if (command && key === "y") {
      event.preventDefault();
      editor.redo();
      return;
    }
    if (!editor.editing) return;
    if (command && key === "c") {
      event.preventDefault();
      const fragment = editor.copy();
      void navigator.clipboard
        ?.writeText(JSON.stringify(fragment))
        .catch(() => undefined);
      return;
    }
    if (command && key === "v") {
      event.preventDefault();
      void paste();
      return;
    }
    if (command && key === "d") {
      event.preventDefault();
      attempt(() => editor.duplicate());
      return;
    }
    if (command && key === "a") {
      event.preventDefault();
      editor.select({ nodeIds: graph.nodes.filter(node => views[node.kind]?.selectable !== false).map((node) => node.id) });
      return;
    }
    if (command && key === "0") {
      event.preventDefault();
      void flow.zoomTo(SPAGBOL_ZOOM_BASELINE);
      return;
    }
    if (key === "delete" || key === "backspace") {
      event.preventDefault();
      editor.deleteSelection(command);
      return;
    }
    if (!command && key === "x") {
      editor.edit("Toggle enabled", "values", (graph) => {
        const nodes = graph.nodes.filter((node) =>
          snapshot.selection.nodeIds.includes(node.id),
        );
        if (nodes.length) {
          const enabled = nodes.every((node) => node.enabled === false);
          for (const node of nodes) node.enabled = enabled;
        } else {
          const links = graph.links.filter((link) =>
            snapshot.selection.linkIds.includes(link.id),
          );
          const enabled = links.every((link) => link.enabled === false);
          for (const link of links) link.enabled = enabled;
        }
      });
      return;
    }
    const mode = editor.modes
      .list()
      .find(
        (mode) =>
          mode.shortcut === key &&
          (!editor.policy.modes || editor.policy.modes.includes(mode.id)),
      );
    if (mode && !command) {
      setActiveMode(mode.id);
      if (!connecting)
        editor.edit("Change link mode", "values", (graph) => {
          for (const link of graph.links)
            if (snapshot.selection.linkIds.includes(link.id))
              link.mode = mode.id;
        });
    }
  }
  function pointFromEvent(event: MouseEvent | TouchEvent): Point | undefined {
    if ("clientX" in event) return { x: event.clientX, y: event.clientY };
    const touch = event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : undefined;
  }
  const availableNodes = [...editor.nodes.list().filter(definition => !props.nodeKinds || props.nodeKinds.includes(definition.kind)), ...(features.areas && !picker?.origin && !picker?.linkId ? [{ kind: 'spagbol.area', label: 'Container', createData: () => ({}), ports: () => [] } as import('../core/index.js').NodeDefinition] : [])]
    .filter(definition => snapshot.path.length > 0 || ![spagbolGroupKinds.inputs, spagbolGroupKinds.outputs].includes(definition.kind as typeof spagbolGroupKinds.inputs))
    .filter((definition) =>
      `${definition.label} ${definition.category ?? ""} ${definition.keywords?.join(" ") ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  const selectedPickerIndex = Math.min(pickerIndex, Math.max(0, availableNodes.length - 1));
  const selectedPickerNode = availableNodes[selectedPickerIndex];
  useEffect(() => {
    if (picker) pickerList.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [picker, selectedPickerIndex, search]);

  return (
    <GraphContext.Provider value={context}>
      <div
        ref={root}
        className={`spagbol-canvas ${props.className ?? ""}`}
        style={
          {
            ...props.style,
            "--spagbol-title-scale": spagbolHeaderTitleScale(zoom),
            "--spagbol-canvas-height": `${editorSize.height}px`,
          } as CSSProperties
        }
        tabIndex={0}
        aria-label={props.ariaLabel ?? "Graph editor"}
        onKeyDown={keyDown}
        onDoubleClick={(event) => {
          if (
            (event.target as HTMLElement).classList.contains("react-flow__pane")
          ) {
            event.preventDefault();
            openPicker({ x: event.clientX, y: event.clientY });
          }
        }}
        onPointerDownCapture={(event) => {
          const pane = (event.target as HTMLElement).classList.contains(
            "react-flow__pane",
          );
          if (pane) root.current?.focus({ preventScroll: true });
          if (
            pane &&
            features.areas &&
            editor.editing &&
            (event.metaKey || event.ctrlKey) &&
            event.button === 0
          ) {
            event.preventDefault();
            event.stopPropagation();
            const point = flow.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });
            setDrawing({ start: point, end: point, pointer: event.pointerId });
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          if (drawing?.pointer === event.pointerId)
            setDrawing({
              ...drawing,
              end: flow.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              }),
            });
        }}
        onPointerUp={(event) => {
          if (drawing?.pointer !== event.pointerId) return;
          const position = {
              x: Math.min(drawing.start.x, drawing.end.x),
              y: Math.min(drawing.start.y, drawing.end.y),
            },
            size = {
              width: Math.abs(drawing.start.x - drawing.end.x),
              height: Math.abs(drawing.start.y - drawing.end.y),
            };
          if (size.width >= 40 && size.height >= 40)
            editor.addArea(position, size);
          setDrawing(null);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          if (duplicate.current || nodeDrag.current) cancelledNodeDrag.current = true;
          if (nodeDrag.current) clearNodeDrag();
          duplicate.current = null;
          setDuplicatePreview(null);
          setDrawing(null);
          editor.cancelGesture();
        }}
      >
        {props.background && (
          <div className="spagbol-canvas-background">{props.background}</div>
        )}
        <SpagbolCanvasFlow<FlowNode, FlowLink>
          nodes={displayNodes}
          onlyRenderVisibleElements
          edges={displayLinks}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeMouseEnter={(_, node) => { if (connecting && node.data.node?.compact && !node.data.stationaryOriginal) setRevealedNodeId(node.data.node.id); }}
          onNodeMouseLeave={(_, node) => setRevealedNodeId(id => id === node.data.node?.id ? null : id)}
          onNodeDoubleClick={(event, flowNode) => {
            const node = flowNode.data.node;
            if (node?.graph && features.nestedGraphs && !(event.target as HTMLElement).closest('.spagbol-node-frame-header')) { event.preventDefault(); editor.enter(node.id); }
          }}
          onPaneClick={() => {
            editor.select({});
            setPicker(null);
          }}
          onNodeDragStart={(event, node) => {
            if (!node.data.node) return;
            cancelledNodeDrag.current = false;
            editor.beginGesture(
              event.altKey ? "Duplicate nodes" : "Move nodes",
            );
            if (!event.altKey) nodeDrag.current = new Map();
            if (event.altKey) {
              const selection = editor.getSnapshot().selection;
              const ids = selection.nodeIds.includes(node.data.node.id)
                ? selection.nodeIds
                : [node.data.node.id];
              duplicate.current = {
                namespace: createId("duplicate-preview"),
                fragment: copyFragment(graph, ids),
                origin: { ...node.position },
                nodeId: node.data.node.id,
                positions: new Map(
                  graph.nodes
                    .filter((node) => ids.includes(node.id))
                    .map((node) => [node.id, { ...node.position }]),
                ),
                external: event.ctrlKey || event.metaKey || event.shiftKey,
              };
              setDuplicatePreview(duplicate.current);
            }
          }}
          onNodeDragStop={(_event, node) => {
            const positions = nodeDrag.current;
            if (positions) clearNodeDrag();
            const current = duplicate.current;
            duplicate.current = null;
            setDuplicatePreview(null);
            if (cancelledNodeDrag.current) {
              cancelledNodeDrag.current = false;
              editor.cancelGesture();
              editor.select(editor.getSnapshot().selection);
              return;
            }
            if (current) {
              const position =
                current.positions.get(current.nodeId) ?? node.position;
              const delta = {
                x: position.x - current.origin.x,
                y: position.y - current.origin.y,
              };
              try {
                editor.paste(current.fragment, delta, current.external);
              } catch (cause) {
                editor.cancelGesture();
                setError(
                  cause instanceof Error ? cause.message : String(cause),
                );
                return;
              }
            }
            if (positions?.size)
              editor.edit("Move nodes", "layout", graph => applyNodePositions(graph, positions));
            editor.commitGesture();
          }}
          onConnectStart={(_event, params) => {
            setRevealedNodeId(params.nodeId?.startsWith("node:") ? params.nodeId.slice(5) : null);
            connection.current = params;
            connectionDone.current = false;
            setConnecting(true);
          }}
          onConnect={(value) => {
            connectionDone.current = true;
            const next = modelConnection(value);
            if (next)
              attempt(() => {
                editor.connect(next.source, next.target, activeMode);
              });
          }}
          onConnectEnd={(event, state) => {
            const origin = connection.current;
            connection.current = null;
            setConnecting(false);
            if (
              connectionDone.current ||
              reconnecting.current ||
              !origin ||
              state.toHandle
            )
              return;
            const point = pointFromEvent(event),
              port = parseHandle(origin.handleId);
            if (!point || !port || !origin.nodeId?.startsWith("node:")) return;
            const source = { nodeId: origin.nodeId.slice(5), portId: port.id };
            const hit =
              port.direction === "output"
                ? linkAt(point, source, activeMode)
                : undefined;
            if (hit)
              attempt(() => {
                editor.connect(
                  source,
                  { type: "link", linkId: hit, property: "weight" },
                  activeMode,
                );
              });
            else if ("metaKey" in event && (event.metaKey || event.ctrlKey))
              openPicker(point, {
                origin: { ...source, direction: port.direction },
              });
          }}
          reconnectRadius={12}
          onReconnectStart={(event, edge) => {
            reconnecting.current = edge.id;
            reconnectDuplicate.current =
              event.ctrlKey || event.metaKey || event.altKey;
            setReconnectOriginal(
              reconnectDuplicate.current ? stationaryReconnectEdge(edge) : null,
            );
            connectionDone.current = false;
            setConnecting(true);
          }}
          onReconnect={(edge, value) => {
            connectionDone.current = true;
            const next = modelConnection(value);
            if (next)
              attempt(() => {
                editor.reconnect(
                  edge.id,
                  next.source,
                  next.target,
                  reconnectDuplicate.current,
                );
              });
          }}
          onReconnectEnd={(event, edge, handleType, state) => {
            if (
              !connectionDone.current &&
              !state.toHandle &&
              handleType === "source"
            ) {
              const point = pointFromEvent(event),
                link = edge.data?.link;
              if (point && link) {
                const hit = linkAt(point, link.source, link.mode, edge.id);
                if (hit)
                  attempt(() => {
                    editor.reconnect(
                      edge.id,
                      link.source,
                      { type: "link", linkId: hit, property: "weight" },
                      event.ctrlKey || event.metaKey || event.altKey,
                    );
                  });
              }
            }
            reconnecting.current = null;
            setReconnectOriginal(null);
            setConnecting(false);
          }}
          isValidConnection={(value) => {
            const next = modelConnection(value);
            const old =
              reconnecting.current &&
              graph.links.find((link) => link.id === reconnecting.current);
            return (
              !!next &&
              !editor.canConnect(
                next.source,
                next.target,
                old ? old.mode : activeMode,
                reconnecting.current ?? undefined,
              )
            );
          }}
          onEdgeDoubleClick={(event, edge) => {
            event.preventDefault();
            if (edge.data?.virtual) return;
            openPicker(
              { x: event.clientX, y: event.clientY },
              { linkId: edge.id },
            );
          }}
          connectionLineType={ConnectionLineType.Bezier}
          connectionLineStyle={{
            stroke: editor.modes.get(activeMode)?.color,
            strokeWidth: 2,
          }}
          defaultViewport={props.defaultViewport ?? defaultGraphViewport}
          onInit={instance => props.onInit?.(instance as unknown as ReactFlowInstance)}
          onMoveStart={() => {
            viewportMoving.current = true;
          }}
          onMove={(_, viewport) => setZoom(viewport.zoom)}
          onMoveEnd={(_, viewport) => {
            viewportMoving.current = false;
            setSettledViewport(viewport);
            props.onViewportChange?.(viewport);
          }}
          translateExtent={panExtent}
          fitView={!props.defaultViewport}
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.05}
          maxZoom={3}
          panOnScroll
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          multiSelectionKeyCode={["Meta", "Shift"]}
          nodesDraggable={editor.editing}
          nodesConnectable={editor.editing}
          elementsSelectable={editor.editing}
          autoPanOnConnect
          autoPanOnNodeDrag
          proOptions={{ hideAttribution: true }}
        >
          {drawing && (
            <ViewportPortal>
              <div
                className="spagbol-canvas-area-draft"
                style={{
                  transform: `translate(${Math.min(drawing.start.x, drawing.end.x)}px, ${Math.min(drawing.start.y, drawing.end.y)}px)`,
                  width: Math.abs(drawing.start.x - drawing.end.x),
                  height: Math.abs(drawing.start.y - drawing.end.y),
                }}
              />
            </ViewportPortal>
          )}
        </SpagbolCanvasFlow>
        <div ref={setLinkOverlay} className="spagbol-canvas-link-overlay" />
        {(props.toolbar ?? true) === true ? (
          props.controls === false ? null : (
            <SpagbolCanvasControls {...props.controls} />
          )
        ) : (
          props.toolbar
        )}
        {picker && (
          <div
            className="spagbol-canvas-picker nodrag nopan"
            role="dialog"
            aria-label="Add node"
            style={{ left: picker.screen.x, top: picker.screen.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="spagbol-canvas-picker-heading">
              <span className="spagbol-canvas-picker-title">
                {picker.linkId ? "Insert a node" : "Add a node"}
              </span>
              <button
                aria-label="Cancel node creation"
                onClick={() => setPicker(null)}
              >
                ×
              </button>
            </div>
            <input
              autoFocus
              aria-label="Search node types"
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={pickerListId}
              aria-activedescendant={selectedPickerNode ? `${pickerListId}-${selectedPickerIndex}` : undefined}
              placeholder="Search nodes…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPickerIndex(0);
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.nativeEvent.isComposing) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setPickerIndex(Math.min(selectedPickerIndex + 1, Math.max(0, availableNodes.length - 1)));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setPickerIndex(Math.max(0, selectedPickerIndex - 1));
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setPicker(null);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  if (selectedPickerNode) chooseNode(selectedPickerNode.kind);
                }
              }}
            />
            <div ref={pickerList} id={pickerListId} className="spagbol-canvas-picker-list nowheel" role="listbox" aria-label="Node types">
              {availableNodes.map((definition, index) => (
                <button
                  key={definition.kind}
                  id={`${pickerListId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === selectedPickerIndex}
                  tabIndex={-1}
                  onPointerMove={() => setPickerIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseNode(definition.kind)}
                >
                  <span>{definition.label}</span>
                  <small>{definition.category}</small>
                </button>
              ))}
              {!availableNodes.length && <p>No matching nodes.</p>}
            </div>
          </div>
        )}
        {error && (
          <div className="spagbol-canvas-error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        )}
        {props.overlay && (
          <div className="spagbol-canvas-overlay">{props.overlay}</div>
        )}
      </div>
    </GraphContext.Provider>
  );
}
