/** Saved data is JSON only. Functions, observers and UI state never enter documents. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type NodeData = { [key: string]: JsonValue };
export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface PortDefinition {
  id: string;
  label: string;
  direction: "input" | "output";
  dataType?: string;
  connectable?: boolean;
  valueEditor?: boolean;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
}
export interface GraphNode<D extends NodeData = NodeData> {
  id: string;
  kind: string;
  label?: string;
  position: Point;
  size?: Size;
  compact?: boolean;
  compactLabel?: string;
  scale?: number;
  enabled?: boolean;
  data: D;
  values: Record<string, number>;
  /** Explicit/dynamic instance ports; a definition may derive ports instead. */
  ports?: PortDefinition[];
  graph?: GraphDocument;
  /** Equal IDs opt into shared nested structure; instance values stay local. */
  sharedGraphId?: string;
  /** Explicit nested nodes to show on this parent. No title conventions in core. */
  panelNodeIds?: string[];
  overrides?: Record<string, Record<string, number>>;
  dataOverrides?: Record<string, NodeData>;
}
export interface PortEndpoint {
  nodeId: string;
  portId: string;
}
export type LinkTarget =
  | ({ type: "port" } & PortEndpoint)
  | { type: "link"; linkId: string; property: string };
export interface GraphLink {
  id: string;
  source: PortEndpoint;
  target: LinkTarget;
  mode: string;
  weight: number;
  enabled?: boolean;
  data?: NodeData;
}
export interface GraphArea {
  id: string;
  /** A domain node whose UI/layout is owned by this area. */
  ownerNodeId?: string;
  title: string;
  position: Point;
  size: Size;
  collapsed?: boolean;
  locked?: boolean;
  nodeIds?: string[];
  areaIds?: string[];
  /** The top portion remains operable while the rest is collapsed. */
  controlHeight?: number;
  data?: NodeData;
}
export interface GraphDocument {
  format: "spagbol";
  version: 1;
  nodes: GraphNode[];
  links: GraphLink[];
  areas: GraphArea[];
  data?: NodeData;
}
export interface Selection {
  port?: { nodeId: string; portId: string; direction: "input" | "output" };
  nodeIds: string[];
  linkIds: string[];
  areaIds: string[];
}
export interface Diagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  path: readonly string[];
  nodeId?: string;
  linkId?: string;
  portId?: string;
}
export interface LinkModeDefinition {
  id: string;
  label: string;
  color: string;
  shortcut?: string;
  description: string;
}
export interface NodeDefinition<D extends NodeData = NodeData> {
  kind: string;
  label: string;
  category?: string;
  description?: string;
  keywords?: string[];
  createData(): D;
  createGraph?(): GraphDocument;
  editablePorts?: "input" | "output";
  newPortLabel?: string;
  createPort?(node: GraphNode<D>, label: string): PortDefinition;
  ports(node: GraphNode<D>): readonly PortDefinition[];
  defaultSize?: Size;
  validate?(node: GraphNode<D>): readonly string[];
  /** App code can remap asset or domain references when duplicating. */
  cloneData?(data: D, ids: ReadonlyMap<string, string>): D;
}
export interface GraphPolicy {
  /** All registered modes are allowed unless the consumer supplies a subset. */
  modes?: readonly string[];
  linkProperties?: readonly string[];
  allowSelfLinks?: boolean;
  allowDuplicateLinks?: boolean;
  /** Host metadata update when deleting a selected editable domain port. */
  deletePort?(node: GraphNode, port: PortDefinition): void;
  canConnect?(
    source: PortEndpoint,
    target: LinkTarget,
    graph: GraphDocument,
  ): string | undefined;
}
export interface ChangeEvent {
  label: string;
  kinds: readonly ChangeKind[];
  document: GraphDocument;
  path: readonly string[];
  origin: "edit" | "undo" | "redo" | "replace";
}
export type ChangeKind = "structure" | "values" | "layout" | "metadata";
export function emptyGraph(): GraphDocument {
  return { format: "spagbol", version: 1, nodes: [], links: [], areas: [] };
}
export function emptySelection(): Selection {
  return { nodeIds: [], linkIds: [], areaIds: [] };
}
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function createId(prefix = "item"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export function graphAt(
  document: GraphDocument,
  path: readonly string[],
): GraphDocument {
  let graph = document;
  for (const id of path) {
    const nested = graph.nodes.find((node) => node.id === id)?.graph;
    if (!nested) throw new Error(`Nested graph ${id} does not exist.`);
    graph = nested;
  }
  return graph;
}
export function validPath(
  document: GraphDocument,
  path: readonly string[],
): string[] {
  const result: string[] = [];
  let graph = document;
  for (const id of path) {
    const nested = graph.nodes.find((node) => node.id === id)?.graph;
    if (!nested) break;
    result.push(id);
    graph = nested;
  }
  return result;
}
const immutablePortCache = new WeakMap<GraphNode, WeakMap<NodeRegistry, readonly PortDefinition[]>>();
export function portsFor(
  node: GraphNode,
  definitions: NodeRegistry,
): readonly PortDefinition[] {
  if (!Object.isFrozen(node)) return definitions.get(node.kind)?.ports(node) ?? node.ports ?? [];
  let registries = immutablePortCache.get(node);
  if (!registries) { registries = new WeakMap(); immutablePortCache.set(node, registries); }
  let ports = registries.get(definitions);
  if (!ports) { ports = definitions.get(node.kind)?.ports(node) ?? node.ports ?? []; registries.set(definitions, ports); }
  return ports;
}
export const spagbolGroupKinds = { group: "spagbol.group", inputs: "spagbol.group.inputs", outputs: "spagbol.group.outputs" } as const;
const groupDefinitions: readonly NodeDefinition[] = [
  { kind: spagbolGroupKinds.group, label: 'Group', category: 'graph', createData: () => ({}), ports: node => node.ports ?? [], createGraph: () => ({ ...emptyGraph(), nodes: [
    { id: createId('node'), kind: spagbolGroupKinds.inputs, position: { x: 0, y: 0 }, data: {}, values: {}, ports: [] },
    { id: createId('node'), kind: spagbolGroupKinds.outputs, position: { x: 500, y: 0 }, data: {}, values: {}, ports: [] },
  ] }) },
  { kind: spagbolGroupKinds.inputs, label: 'Ins', category: 'graph', createData: () => ({}), ports: node => node.ports ?? [] },
  { kind: spagbolGroupKinds.outputs, label: 'Outs', category: 'graph', createData: () => ({}), ports: node => node.ports ?? [] },
];

export class NodeRegistry {
  readonly #definitions = new Map<string, NodeDefinition>();
  constructor(definitions: readonly NodeDefinition[] = []) {
    for (const definition of [...groupDefinitions, ...definitions]) {
      if (this.#definitions.has(definition.kind))
        throw new Error(`Duplicate node kind ${definition.kind}.`);
      this.#definitions.set(definition.kind, definition);
    }
  }
  get(kind: string): NodeDefinition | undefined {
    return this.#definitions.get(kind);
  }
  list(): readonly NodeDefinition[] {
    return [...this.#definitions.values()];
  }
  create(kind: string, position: Point, id = createId("node")): GraphNode {
    const definition = this.get(kind);
    if (!definition) throw new Error(`Unknown node kind ${kind}.`);
    const node: GraphNode = {
      id,
      kind,
      position: { ...position },
      data: definition.createData(),
      values: {},
    };
    if (definition.createGraph) {
      node.graph = definition.createGraph();
      node.sharedGraphId = createId('shared');
      node.ports = [];
    }
    if (definition.defaultSize) node.size = { ...definition.defaultSize };
    node.values = Object.fromEntries(
      definition
        .ports(node)
        .filter((port) => port.direction === "input")
        .map((port) => [port.id, port.defaultValue ?? 0]),
    );
    return node;
  }
}
export function defineNode<D extends NodeData>(
  definition: NodeDefinition<D>,
): NodeDefinition<D> {
  return definition;
}
export const standardLinkModes: readonly LinkModeDefinition[] = Object.freeze([
  {
    id: "set",
    label: "set",
    color: "#fff",
    shortcut: "s",
    description:
      "Average weighted set sources, replacing the local base value.",
  },
  {
    id: "add",
    label: "add",
    color: "#ffe45c",
    shortcut: "a",
    description: "Add weighted sources after set values or the local base.",
  },
  {
    id: "multiply",
    label: "multiply",
    color: "#8fdcff",
    shortcut: "m",
    description: "Multiply by each weighted source after addition.",
  },
  {
    id: "bend",
    label: "bend",
    color: "#c084fc",
    shortcut: "b",
    description: "Scale by 2^(source × weight) after multiplication.",
  },
]);
export class LinkModeRegistry {
  readonly #definitions = new Map<string, LinkModeDefinition>();
  constructor(definitions: readonly LinkModeDefinition[] = standardLinkModes) {
    for (const definition of definitions) {
      if (this.#definitions.has(definition.id))
        throw new Error(`Duplicate link mode ${definition.id}.`);
      this.#definitions.set(definition.id, Object.freeze({ ...definition }));
    }
  }
  get(id: string): LinkModeDefinition | undefined {
    return this.#definitions.get(id);
  }
  list(): readonly LinkModeDefinition[] {
    return [...this.#definitions.values()];
  }
}
