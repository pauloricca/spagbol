import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  type Diagnostic,
  type GraphEditor,
  type EditorSnapshot,
  type GraphNode,
  type NodeData,
  type ObservationStore,
  type Point,
} from "../core/index.js";

export interface SpagbolCanvasFeatures {
  compact?: boolean;
  selectable?: boolean;
  draggable?: boolean;
  areas?: boolean;
  linkProperties?: boolean;
  nestedGraphs?: boolean;
  panels?: boolean;
}
export interface SpagbolNodeViewProps<D extends NodeData = NodeData> {
  node: GraphNode<D>;
  selected: boolean;
  projected: boolean;
  path: readonly string[];
  resetOverride?(): void;
  readOnly: boolean;
  setValue(portId: string, value: number): void;
  patchData(data: Partial<D>, structural?: boolean): void;
  beginGesture(label?: string): void;
  endGesture(cancel?: boolean): void;
}
export interface SpagbolNodeView {
  body?: ComponentType<SpagbolNodeViewProps>;
  /** Complete custom geometry; use SpagbolNodePort and the supplied command props. */
  render?: ComponentType<SpagbolNodeViewProps>;
  projected?: ComponentType<SpagbolNodeViewProps>;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  autoWidth?: boolean;
  compact?: boolean;
  selectable?: boolean;
  draggable?: boolean;
}
/** Keep application body props typed while the renderer registry erases payloads. */
export function defineNodeView<D extends NodeData>(view: {
  body?: ComponentType<SpagbolNodeViewProps<D>>;
  render?: ComponentType<SpagbolNodeViewProps<D>>;
  projected?: ComponentType<SpagbolNodeViewProps<D>>;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  autoWidth?: boolean;
  compact?: boolean;
  selectable?: boolean;
  draggable?: boolean;
}): SpagbolNodeView {
  const wrap = (
    component?: ComponentType<SpagbolNodeViewProps<D>>,
  ): ComponentType<SpagbolNodeViewProps> | undefined =>
    component
      ? (props) => createElement(component, props as SpagbolNodeViewProps<D>)
      : undefined;
  return {
    ...view,
    body: wrap(view.body),
    render: wrap(view.render),
    projected: wrap(view.projected),
  };
}
export interface GraphContextValue {
  editor: GraphEditor;
  views: Readonly<Record<string, SpagbolNodeView>>;
  features: SpagbolCanvasFeatures;
  diagnostics: readonly Diagnostic[];
  nodeKinds?: readonly string[];
  changeNodeKind?(id: string, kind: string): void | Promise<void>;
  zoom: number;
  connecting: boolean;
  linkOverlay: HTMLElement | null;
  projection?: { groupId: string; path: readonly string[] };
  instanceId: string;
  areaDuplicate?(id: string, phase: "start" | "move" | "end" | "cancel", offset: Point, external?: boolean): void;
  registerTarget(key: string, element: HTMLElement | null): void;
}
export const GraphContext = createContext<GraphContextValue | null>(null);
export function useSpagbol(): GraphContextValue {
  const context = useContext(GraphContext);
  if (!context)
    throw new Error("Spagbol components must be inside SpagbolCanvas.");
  return context;
}
export function useGraphEditor() {
  return useSpagbol().editor;
}
export function useEditorSnapshot(editor: GraphEditor) {
  return useSyncExternalStore(
    editor.subscribe,
    editor.getSnapshot,
    editor.getSnapshot,
  );
}
/** Subscribe to a stable slice, so value changes do not redraw selection-only UI. */
export function useEditorSelector<T>(editor: GraphEditor, select: (snapshot: EditorSnapshot) => T): T {
  return useSyncExternalStore(editor.subscribe, () => select(editor.getSnapshot()), () => select(editor.getSnapshot()));
}
export function useObservation<T>(
  store: ObservationStore<T>,
  path: readonly string[],
  nodeId: string,
  instance = "",
): T | undefined {
  const key = store.key(path, nodeId, instance);
  return useSyncExternalStore(
    (listener) => store.subscribe(key, listener),
    () => store.get(key),
    () => undefined,
  );
}
/** Register a scoped DOM target for app-owned GPU/canvas rendering. */
export function useRenderTarget(nodeId: string, slot = "preview") {
  const { editor, registerTarget, projection } = useSpagbol();
  const path = [...editor.getSnapshot().path, ...(projection ? [projection.groupId, ...projection.path.slice(0, -1)] : [])];
  const key = JSON.stringify([path, nodeId, slot]);
  return useCallback(
    (element: HTMLElement | null) => registerTarget(key, element),
    [key, registerTarget],
  );
}
export type SpagbolTheme = CSSProperties & {
  [key: `--spagbol-${string}`]: string | number;
};
export interface SpagbolCanvasSlots {
  background?: ReactNode;
  overlay?: ReactNode;
}
