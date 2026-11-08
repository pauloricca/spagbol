import { createEditablePort, resolveNewBoundaryPorts, spagbolNewPortId, createGroupPort, findGroupControl, groupControlKey, isGroupBoundary, normalizeGroupPortLabel, synchronizeGroupBoundaries } from "./groups.js";
import {
  clone,
  createId,
  emptyGraph,
  emptySelection,
  spagbolGroupKinds,
  graphAt,
  portsFor,
  validPath,
  LinkModeRegistry,
  NodeRegistry,
  type ChangeEvent,
  type ChangeKind,
  type GraphArea,
  type NodeData,
  type GraphDocument,
  type GraphLink,
  type GraphNode,
  type GraphPolicy,
  type LinkTarget,
  type Point,
  type Selection,
  type Size,
} from "./model.js";
import {
  areaMembers,
  connectionError,
  copyFragment,
  pasteFragment,
  pruneInvalidPorts,
  removeLinks,
  removeNodes,
  synchronizeSharedGraph,
  validateGraph,
  type GraphFragment,
} from "./graph.js";
import { assertDocument } from "./serialization.js";
import { groupNodes, type GroupOptions } from "./grouping.js";

export interface EditorSnapshot {
  document: GraphDocument;
  path: readonly string[];
  selection: Selection;
  canUndo: boolean;
  canRedo: boolean;
  gesture: string | null;
  mode: "edit" | "controls" | "readonly";
}
export interface EditorOptions {
  document?: GraphDocument;
  nodes: NodeRegistry;
  modes?: LinkModeRegistry;
  policy?: GraphPolicy;
  historyLimit?: number;
  onCommit?(event: ChangeEvent): void;
  onPreview?(event: ChangeEvent | null): void;
  onPaste?(event: { fragment: GraphFragment; nodeIds: readonly string[]; areaIds: readonly string[]; path: readonly string[]; document: GraphDocument }): void;
  /** Pure domain invariants, applied within the same atomic edit/history entry. */
  normalizeDocument?(document: GraphDocument, previous: GraphDocument): void;
}
interface HistoryEntry {
  before: GraphDocument;
  after: GraphDocument;
  label: string;
  kinds: ChangeKind[];
  path: string[];
}
interface Gesture {
  before: GraphDocument;
  label: string;
  kinds: Set<ChangeKind>;
  path: string[];
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Retain immutable identities for unchanged document branches after an atomic edit. */
function shareUnchanged<T>(before: T, after: T): T {
  if (Object.is(before, after)) return before;
  if (after && typeof after === "object" && Object.isFrozen(after)) return after;
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) !== Array.isArray(after)) return after;
  const previous = before as Record<string, unknown>, next = after as Record<string, unknown>;
  const keys = Object.keys(next);
  let equal = keys.length === Object.keys(previous).length;
  for (const key of keys) {
    if (!(key in previous)) { equal = false; continue; }
    next[key] = shareUnchanged(previous[key], next[key]);
    if (!Object.is(previous[key], next[key])) equal = false;
  }
  return equal ? before : after;
}
/** One controller per document. Nothing is stored in module-level mutable state. */
export class GraphEditor {
  readonly nodes: NodeRegistry;
  readonly modes: LinkModeRegistry;
  readonly policy: GraphPolicy;
  readonly #options: EditorOptions;
  readonly #listeners = new Set<() => void>();
  readonly #commits = new Set<(event: ChangeEvent) => void>();
  #snapshot: EditorSnapshot;
  #past: HistoryEntry[] = [];
  #future: HistoryEntry[] = [];
  #gesture: Gesture | null = null;
  #clipboard: GraphFragment | null = null;

  constructor(options: EditorOptions) {
    this.#options = options;
    this.nodes = options.nodes;
    this.modes = options.modes ?? new LinkModeRegistry();
    this.policy = { linkProperties: ['weight'], ...options.policy };
    const source = options.document ?? emptyGraph();
    assertDocument(source);
    const document = clone(source);
    this.#snapshot = freeze({
      document,
      path: [],
      selection: emptySelection(),
      canUndo: false,
      canRedo: false,
      gesture: null,
      mode: "edit",
    });
  }
  getSnapshot = (): EditorSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  onCommit(listener: (event: ChangeEvent) => void): () => void {
    this.#commits.add(listener);
    return () => {
      this.#commits.delete(listener);
    };
  }
  get graph(): GraphDocument {
    return graphAt(this.#snapshot.document, this.#snapshot.path);
  }
  get editing(): boolean {
    return this.#snapshot.mode === "edit";
  }
  diagnostics() {
    return validateGraph(
      this.#snapshot.document,
      this.nodes,
      this.modes,
      this.policy,
    );
  }
  #publish(patch: Partial<EditorSnapshot> = {}): void {
    const document = patch.document ?? this.#snapshot.document;
    const path = shareUnchanged(this.#snapshot.path, validPath(document, patch.path ?? this.#snapshot.path));
    const graph = graphAt(document, path);
    const selection = patch.selection ?? this.#snapshot.selection;
    this.#snapshot = freeze({
      ...this.#snapshot,
      ...patch,
      document,
      path,
      selection: shareUnchanged(this.#snapshot.selection, {
        port: selection.port && graph.nodes.some(node => node.id === selection.port!.nodeId && portsFor(node, this.nodes).some(port => port.id === selection.port!.portId && port.direction === selection.port!.direction)) ? selection.port : undefined,
        nodeIds: selection.nodeIds.filter((id) =>
          graph.nodes.some((node) => node.id === id),
        ),
        linkIds: selection.linkIds.filter((id) =>
          graph.links.some((link) => link.id === id),
        ),
        areaIds: selection.areaIds.filter((id) =>
          graph.areas.some((area) => area.id === id),
        ),
      }),
      canUndo: this.#past.length > 0,
      canRedo: this.#future.length > 0,
      gesture: this.#gesture?.label ?? null,
    });
    for (const listener of this.#listeners) listener();
  }
  #event(
    entry: Pick<HistoryEntry, "label" | "kinds" | "path">,
    origin: ChangeEvent["origin"],
  ): ChangeEvent {
    return {
      label: entry.label,
      kinds: [...entry.kinds],
      path: [...entry.path],
      document: this.#snapshot.document,
      origin,
    };
  }
  #emit(event: ChangeEvent): void {
    this.#options.onCommit?.(event);
    for (const listener of this.#commits) listener(event);
  }
  #remember(entry: HistoryEntry): void {
    this.#past = [...this.#past, entry].slice(
      -Math.max(1, this.#options.historyLimit ?? 100),
    );
    this.#future = [];
  }
  /** App transformations use this same atomic path as built-in commands. */
  edit(
    label: string,
    kinds: ChangeKind | readonly ChangeKind[],
    transform: (graph: GraphDocument) => void,
  ): void {
    if (this.#snapshot.mode === "readonly") return;
    const changes = typeof kinds === "string" ? [kinds] : [...kinds];
    if (!this.editing && changes.some((kind) => kind !== "values")) return;
    const before = this.#snapshot.document;
    let after = clone(before);
    transform(graphAt(after, this.#snapshot.path));
    this.#options.normalizeDocument?.(after, before);
    synchronizeSharedGraph(after, this.#snapshot.path);
    synchronizeGroupBoundaries(after, this.nodes);
    assertDocument(after);
    after = shareUnchanged(before, after);
    if (before === after) return;
    const entry: HistoryEntry = {
      before,
      after,
      label,
      kinds: changes,
      path: [...this.#snapshot.path],
    };
    if (this.#gesture)
      for (const kind of changes) this.#gesture.kinds.add(kind);
    else this.#remember(entry);
    this.#publish({ document: after });
    if (this.#gesture) this.#options.onPreview?.(this.#event(entry, "edit"));
    else this.#emit(this.#event(entry, "edit"));
  }
  beginGesture(label: string): void {
    if (this.#gesture)
      throw new Error("Finish or cancel the current gesture first.");
    this.#gesture = {
      before: this.#snapshot.document,
      label,
      kinds: new Set(),
      path: [...this.#snapshot.path],
    };
    this.#publish();
  }
  commitGesture(): void {
    const gesture = this.#gesture;
    if (!gesture) return;
    this.#gesture = null;
    const entry: HistoryEntry = {
      ...gesture,
      after: this.#snapshot.document,
      kinds: [...gesture.kinds],
    };
    const changed =
      JSON.stringify(entry.before) !== JSON.stringify(entry.after);
    if (changed) this.#remember(entry);
    this.#publish();
    this.#options.onPreview?.(null);
    if (changed) this.#emit(this.#event(entry, "edit"));
  }
  cancelGesture(): void {
    const gesture = this.#gesture;
    if (!gesture) return;
    this.#gesture = null;
    this.#publish({ document: gesture.before, path: gesture.path });
    this.#options.onPreview?.(null);
  }
  setMode(mode: EditorSnapshot["mode"]): void {
    this.cancelGesture();
    this.#publish({ mode, selection: emptySelection() });
  }
  select(selection: Partial<Selection>): void {
    const next = shareUnchanged(this.#snapshot.selection, { ...emptySelection(), port: undefined, ...selection });
    if (next !== this.#snapshot.selection) this.#publish({ selection: next });
  }
  enter(nodeId: string): void {
    if (!this.graph.nodes.find((node) => node.id === nodeId)?.graph) return;
    this.commitGesture();
    this.#publish({
      path: [...this.#snapshot.path, nodeId],
      selection: emptySelection(),
    });
  }
  navigate(path: readonly string[]): void {
    this.commitGesture();
    this.#publish({ path, selection: emptySelection() });
  }
  exit(): void {
    this.navigate(this.#snapshot.path.slice(0, -1));
  }
  undo(): void {
    if (!this.editing) return;
    this.cancelGesture();
    const entry = this.#past.pop();
    if (!entry) return;
    this.#future.push(entry);
    this.#publish({
      document: entry.before,
      path: entry.path,
      selection: emptySelection(),
    });
    this.#emit(this.#event(entry, "undo"));
  }
  redo(): void {
    if (!this.editing) return;
    this.cancelGesture();
    const entry = this.#future.pop();
    if (!entry) return;
    this.#past.push(entry);
    this.#publish({
      document: entry.after,
      path: entry.path,
      selection: emptySelection(),
    });
    this.#emit(this.#event(entry, "redo"));
  }
  replace(document: GraphDocument): void {
    if (!this.editing) return;
    assertDocument(document);
    this.cancelGesture();
    this.#past = [];
    this.#future = [];
    this.#publish({
      document: clone(document),
      path: [],
      selection: emptySelection(),
    });
    this.#emit({
      label: "Load graph",
      kinds: ["structure", "values", "layout", "metadata"],
      path: [],
      document: this.#snapshot.document,
      origin: "replace",
    });
  }
  addNode(kind: string, position: Point): string | undefined {
    if (!this.editing) return;
    const node = this.nodes.create(kind, position);
    this.edit("Add node", "structure", (graph) => {
      graph.nodes.push(node);
    });
    this.select({ nodeIds: [node.id] });
    return node.id;
  }
  updateNode(
    id: string,
    update: Partial<Omit<GraphNode, "id" | "graph">>,
    kind: ChangeKind = "metadata",
  ): void {
    this.edit("Edit node", kind, (graph) => {
      const node = graph.nodes.find((node) => node.id === id);
      if (!node) return;
      Object.assign(node, clone(update));
      if (kind === "structure") pruneInvalidPorts(graph, this.nodes, id);
    });
  }
  changeNodeKind(id: string, kind: string, data: NodeData = {}): void {
    if (!this.editing) return;
    const previous = this.graph.nodes.find(node => node.id === id);
    if (!previous || previous.kind === kind) return;
    const replacement = this.nodes.create(kind, previous.position, id);
    Object.assign(replacement.data, clone(data));
    const oldPorts = portsFor(previous, this.nodes);
    const newPorts = portsFor(replacement, this.nodes);
    if (previous.enabled !== undefined) replacement.enabled = previous.enabled;
    if (previous.compact !== undefined) replacement.compact = previous.compact;
    if (previous.compactLabel !== undefined) replacement.compactLabel = previous.compactLabel;
    if (previous.scale !== undefined) replacement.scale = previous.scale;
    if (!replacement.size && previous.size) replacement.size = { ...previous.size };
    for (const port of portsFor(replacement, this.nodes))
      if (port.direction === 'input' && previous.values[port.id] !== undefined)
        replacement.values[port.id] = port.integer
          ? Math.round(Math.max(port.min ?? -Infinity, Math.min(port.max ?? Infinity, previous.values[port.id]!)))
          : Math.max(port.min ?? -Infinity, Math.min(port.max ?? Infinity, previous.values[port.id]!));
    this.edit('Change node type', 'structure', graph => {
      graph.nodes = graph.nodes.map(node => node.id === id ? replacement : node);
      for (const link of graph.links) {
        for (const direction of ['input', 'output'] as const) {
          const endpoint = direction === 'output' ? link.source : link.target.type === 'port' ? link.target : undefined;
          if (!endpoint || endpoint.nodeId !== id) continue;
          const before = oldPorts.filter(port => port.direction === direction);
          const after = newPorts.filter(port => port.direction === direction);
          const next = after[Math.max(0, before.findIndex(port => port.id === endpoint.portId))];
          endpoint.portId = next?.id ?? '__spagbol_removed_port__';
        }
      }
      pruneInvalidPorts(graph, this.nodes, id);
    });
  }
  /** Scale selected nodes around their shared visual center in one undo entry. */
  scaleSelection(factor: number, measuredSizes: ReadonlyMap<string, Size> = new Map()): void {
    if (!this.editing || !Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    const selected = this.graph.nodes.filter(node => this.getSnapshot().selection.nodeIds.includes(node.id));
    if (!selected.length) return;
    const bounds = selected.map(node => ({ node, size: measuredSizes.get(node.id) ?? {
      width: (node.size?.width ?? 180) * (node.scale ?? 1),
      height: (node.size?.height ?? 100) * (node.scale ?? 1),
    } }));
    const center = {
      x: (Math.min(...bounds.map(({node}) => node.position.x)) + Math.max(...bounds.map(({node, size}) => node.position.x + size.width))) / 2,
      y: (Math.min(...bounds.map(({node}) => node.position.y)) + Math.max(...bounds.map(({node, size}) => node.position.y + size.height))) / 2,
    };
    const ids = new Set(selected.map(node => node.id));
    this.edit('Scale selection', 'layout', graph => {
      for (const node of graph.nodes) if (ids.has(node.id)) {
        node.position = { x: center.x + (node.position.x - center.x) * factor, y: center.y + (node.position.y - center.y) * factor };
        node.scale = (node.scale ?? 1) * factor;
      }
    });
  }
  setValue(id: string, portId: string, value: number): void {
    this.setValues(id, { [portId]: value });
  }
  /** Several control values are one edit, with no intermediate document states. */
  setValues(id: string, values: Readonly<Record<string, number>>): void {
    const current = this.graph.nodes.find(node => node.id === id);
    if (!current) return;
    const ports = portsFor(current, this.nodes);
    const changes: Record<string, number> = {};
    for (const [portId, value] of Object.entries(values)) {
      if (!Number.isFinite(value)) continue;
      const port = ports.find(port => port.id === portId);
      const bounded = Math.min(port?.max ?? Infinity, Math.max(port?.min ?? -Infinity, value));
      const next = port?.integer ? Math.round(bounded) : bounded;
      if (current.values[portId] !== next) changes[portId] = next;
    }
    if (!Object.keys(changes).length) return;
    this.edit('Change values', 'values', graph => {
      const node = graph.nodes.find(node => node.id === id)!;
      Object.assign(node.values, changes);
      if (node.kind === spagbolGroupKinds.inputs) for (const port of node.ports ?? [])
        if (changes[port.id] !== undefined) port.defaultValue = changes[port.id];
    });
  }
  setOverride(
    groupId: string,
    nodeId: string | readonly string[],
    portId: string,
    value: number,
  ): void {
    const key = groupControlKey(nodeId);
    if (!Number.isFinite(value)) return;
    this.edit("Change instance control", "values", (graph) => {
      const group = graph.nodes.find((node) => node.id === groupId);
      const node = group && findGroupControl(group, nodeId);
      if (!group || !node) return;
      const port = portsFor(node, this.nodes).find(
        (port) => port.id === portId,
      );
      const bounded = Math.max(
        port?.min ?? -Infinity,
        Math.min(port?.max ?? Infinity, value),
      );
      group.overrides ??= {};
      group.overrides[key] ??= {};
      group.overrides[key]![portId] = port?.integer
        ? Math.round(bounded)
        : bounded;
    });
  }
  resetOverride(groupId: string, nodeId: string | readonly string[]): void {
    const key = groupControlKey(nodeId);
    this.edit("Reset instance control", "values", (graph) => {
      const group = graph.nodes.find((node) => node.id === groupId);
      if (group?.overrides) delete group.overrides[key];
      if (group?.dataOverrides) delete group.dataOverrides[key];
    });
  }
  addBoundaryPort(nodeId: string, label: string, defaultValue = 0): void {
    this.edit('Add group port', 'structure', graph => {
      const node = graph.nodes.find(item => item.id === nodeId);
      if (node) createEditablePort(node, this.nodes, label, defaultValue);
    });
  }
  renameBoundaryPort(nodeId: string, portId: string, label: string): void {
    const normalized = normalizeGroupPortLabel(label);
    this.edit('Rename group port', 'structure', graph => {
      const node = graph.nodes.find(item => item.id === nodeId);
      if (!node || !isGroupBoundary(node)) return;
      if (node.ports?.some(port => port.id !== portId && port.label === normalized)) throw new Error('That port name already exists.');
      const port = node.ports?.find(item => item.id === portId);
      if (port) port.label = normalized;
    });
  }
  removeBoundaryPort(nodeId: string, portId: string): void {
    this.edit('Remove group port', 'structure', graph => {
      const node = graph.nodes.find(item => item.id === nodeId);
      if (!node || !isGroupBoundary(node)) return;
      node.ports = node.ports?.filter(port => port.id !== portId);
      delete node.values[portId];
      pruneInvalidPorts(graph, this.nodes, nodeId);
    });
  }
  moveBoundaryPort(nodeId: string, portId: string, index: number): void {
    this.edit('Reorder group port', 'structure', graph => {
      const node = graph.nodes.find(item => item.id === nodeId);
      if (!node || !isGroupBoundary(node) || !node.ports) return;
      const previous = node.ports.findIndex(port => port.id === portId);
      if (previous < 0) return;
      const [port] = node.ports.splice(previous, 1);
      node.ports.splice(Math.max(0, Math.min(node.ports.length, index)), 0, port!);
    });
  }
  exposeSelection(exposed = true): void {
    this.edit('Expose group controls', 'metadata', graph => {
      const current = Array.isArray(graph.data?.exposedNodeIds) ? graph.data!.exposedNodeIds.filter((id): id is string => typeof id === 'string') : [];
      const ids = new Set(current);
      for (const id of this.#snapshot.selection.nodeIds) {
        const node = graph.nodes.find(item => item.id === id);
        if (!node || isGroupBoundary(node)) continue;
        if (exposed) ids.add(id); else ids.delete(id);
      }
      graph.data ??= {};
      graph.data.exposedNodeIds = [...ids];
    });
  }
  setDataOverride(groupId: string, nodeId: string | readonly string[], update: Partial<NodeData>): void {
    const key = groupControlKey(nodeId);
    this.edit('Change instance control', 'values', graph => {
      const group = graph.nodes.find(node => node.id === groupId);
      if (!group || !findGroupControl(group, nodeId)) return;
      group.dataOverrides ??= {};
      group.dataOverrides[key] = { ...group.dataOverrides[key], ...update } as NodeData;
    });
  }
  canConnect(
    source: GraphLink["source"],
    target: LinkTarget,
    mode: string,
    replacingId?: string,
  ): string | undefined {
    const graph = source.portId === spagbolNewPortId || (target.type === 'port' && target.portId === spagbolNewPortId) ? clone(this.graph) : this.graph;
    const prepared = graph === this.graph ? { source, target } : resolveNewBoundaryPorts(graph, source, target, this.nodes);
    return connectionError(
      graph,
      this.nodes,
      this.modes,
      this.policy,
      prepared.source,
      prepared.target,
      mode,
      replacingId,
    );
  }
  connect(
    source: GraphLink["source"],
    target: LinkTarget,
    mode = "set",
    settings: Partial<Pick<GraphLink, "weight" | "enabled" | "data">> = {},
  ): string | undefined {
    if (!this.editing) return;
    const error = this.canConnect(source, target, mode);
    if (error) throw new Error(error);
    const id = createId("link");
    this.edit("Connect ports", "structure", (graph) => {
      const prepared = resolveNewBoundaryPorts(graph, source, target, this.nodes);
      graph.links.push({
        id,
        source: prepared.source,
        target: prepared.target,
        mode,
        weight: 1,
        ...settings,
      });
    });
    this.select({ linkIds: [id] });
    return id;
  }
  reconnect(
    id: string,
    source: GraphLink["source"],
    target: LinkTarget,
    duplicate = false,
  ): string | undefined {
    if (!this.editing) return;
    const original = this.graph.links.find((link) => link.id === id);
    if (!original) return;
    const error = this.canConnect(
      source,
      target,
      original.mode,
      duplicate ? undefined : id,
    );
    if (error) throw new Error(error);
    const newId = duplicate ? createId("link") : id;
    this.edit(
      duplicate ? "Duplicate connection" : "Reconnect link",
      "structure",
      (graph) => {
        const prepared = resolveNewBoundaryPorts(graph, source, target, this.nodes);
        const next = {
          ...clone(original),
          id: newId,
          source: prepared.source,
          target: prepared.target,
        };
        if (duplicate) graph.links.push(next);
        else
          graph.links = graph.links.map((link) =>
            link.id === id ? next : link,
          );
      },
    );
    this.select({ linkIds: [newId] });
    return newId;
  }
  updateLink(
    id: string,
    update: Partial<Pick<GraphLink, "mode" | "weight" | "enabled" | "data">>,
  ): void {
    if (
      update.mode &&
      (!this.modes.get(update.mode) ||
        (this.policy.modes && !this.policy.modes.includes(update.mode)))
    )
      throw new Error("Unavailable link mode.");
    if (update.weight !== undefined && !Number.isFinite(update.weight)) return;
    this.edit("Edit link", "values", (graph) => {
      const link = graph.links.find((link) => link.id === id);
      if (link) Object.assign(link, clone(update));
    });
  }
  deleteSelection(bridge = false): void {
    const port = this.#snapshot.selection.port;
    if (port && this.graph.nodes.some(node => node.id === port.nodeId && isGroupBoundary(node))) {
      this.removeBoundaryPort(port.nodeId, port.portId);
      this.select({ nodeIds: [port.nodeId] });
      return;
    }
    if (port && this.policy.deletePort) {
      this.edit('Delete port', 'structure', graph => {
        const node = graph.nodes.find(node => node.id === port.nodeId);
        const definition = node && portsFor(node, this.nodes).find(item => item.id === port.portId && item.direction === port.direction);
        if (node && definition) { this.policy.deletePort!(node, definition); pruneInvalidPorts(graph, this.nodes, node.id); }
      });
      this.select({ nodeIds: [port.nodeId] });
      return;
    }
    const selection = this.#snapshot.selection;
    this.edit(bridge ? 'Delete and bridge' : 'Delete selection', 'structure', (graph) => {
      const selected = new Set(selection.nodeIds);
      const bridges = bridge ? graph.nodes.flatMap(node => {
        if (!selected.has(node.id)) return [];
        const incoming = graph.links.filter(link => link.target.type === 'port' && link.target.nodeId === node.id && !selected.has(link.source.nodeId));
        const outgoing = graph.links.filter(link => link.source.nodeId === node.id && link.target.type === 'port' && !selected.has(link.target.nodeId));
        return incoming.flatMap(input => outgoing.map(output => ({ id: createId('link'), source: { ...input.source }, target: { ...output.target }, mode: output.mode, weight: output.weight, enabled: input.enabled !== false && output.enabled !== false })));
      }) : [];
      const owned = graph.areas.filter(area => selection.areaIds.includes(area.id) && area.ownerNodeId).map(area => area.ownerNodeId!);
      removeNodes(graph, [...selection.nodeIds, ...owned]);
      for (const link of bridges) if (!connectionError(graph, this.nodes, this.modes, this.policy, link.source, link.target, link.mode)) graph.links.push(link);
      removeLinks(graph, selection.linkIds);
      graph.areas = graph.areas.filter(
        (area) => !selection.areaIds.includes(area.id),
      );
      for (const area of graph.areas)
        if (area.areaIds)
          area.areaIds = area.areaIds.filter(
            (id) => !selection.areaIds.includes(id),
          );
    });
    this.select({});
  }
  copy(): GraphFragment {
    this.#clipboard = copyFragment(
      this.graph,
      this.#snapshot.selection.nodeIds,
      this.#snapshot.selection.areaIds,
    );
    return clone(this.#clipboard);
  }
  paste(
    fragment = this.#clipboard,
    offset: Point = { x: 36, y: 36 },
    external = false,
  ): void {
    if (!fragment || !this.editing) return;
    let selection: Partial<Selection> = {};
    this.edit("Paste graph", "structure", (graph) => {
      selection = pasteFragment(graph, fragment, this.nodes, offset, external);
    });
    this.select(selection);
    this.#options.onPaste?.({ fragment: clone(fragment), nodeIds: selection.nodeIds ?? [], areaIds: selection.areaIds ?? [], path: [...this.#snapshot.path], document: this.#snapshot.document });
  }
  duplicate(offset: Point = { x: 36, y: 36 }, external = false): void {
    this.paste(
      copyFragment(
        this.graph,
        this.#snapshot.selection.nodeIds,
        this.#snapshot.selection.areaIds,
      ),
      offset,
      external,
    );
  }
  groupSelection(options?: GroupOptions): string | undefined {
    if (!this.editing) return;
    let id: string | undefined;
    this.edit("Group selection", "structure", (graph) => {
      id = groupNodes(
        graph,
        this.#snapshot.selection.nodeIds.filter(id => !isGroupBoundary(graph.nodes.find(node => node.id === id)!)),
        this.nodes,
        options,
      );
    });
    if (id) this.select({ nodeIds: [id] });
    return id;
  }
  insertNode(
    linkId: string,
    kind: string,
    position: Point,
    inputId: string,
    outputId: string,
  ): string | undefined {
    if (!this.editing) return;
    const old = this.graph.links.find((link) => link.id === linkId);
    if (!old) return;
    const node = this.nodes.create(kind, position);
    const ports = portsFor(node, this.nodes);
    if (
      !ports.some(
        (port) => port.id === inputId && port.direction === "input",
      ) ||
      !ports.some((port) => port.id === outputId && port.direction === "output")
    )
      throw new Error("Insertion requires an explicit input and output.");
    const candidate = clone(this.graph);
    candidate.nodes.push(node);
    const source = { nodeId: node.id, portId: outputId };
    const input = { type: "port" as const, nodeId: node.id, portId: inputId };
    const error =
      connectionError(
        candidate,
        this.nodes,
        this.modes,
        this.policy,
        old.source,
        input,
        "set",
      ) ??
      connectionError(
        candidate,
        this.nodes,
        this.modes,
        this.policy,
        source,
        old.target,
        old.mode,
        old.id,
      );
    if (error) throw new Error(error);
    this.edit("Insert node", "structure", (graph) => {
      graph.nodes.push(node);
      graph.links = graph.links.map((link) =>
        link.id === linkId ? { ...link, source } : link,
      );
      graph.links.push({
        id: createId("link"),
        source: { ...old.source },
        target: input,
        mode: "set",
        weight: 1,
      });
    });
    this.select({ nodeIds: [node.id] });
    return node.id;
  }
  convertNodeToArea(nodeId: string): string | undefined {
    if (!this.editing || !this.graph.nodes.some(node => node.id === nodeId)) return;
    const id = createId('area');
    this.edit('Convert node to area', 'structure', graph => {
      const node = graph.nodes.find(node => node.id === nodeId)!;
      graph.areas.push({ id, title: node.label ?? 'Area', position: { ...node.position }, size: node.size ?? { width: 420, height: 280 } });
      removeNodes(graph, [nodeId]);
    });
    this.select({ areaIds: [id] });
    return id;
  }
  addArea(
    position: Point,
    size: Size = { width: 420, height: 280 },
  ): string | undefined {
    if (!this.editing) return;
    const id = createId("area");
    this.edit("Add area", "layout", (graph) => {
      graph.areas.push({
        id,
        title: "Area",
        position: { ...position },
        size: { ...size },
      });
    });
    this.select({ areaIds: [id] });
    return id;
  }
  updateArea(id: string, update: Partial<Omit<GraphArea, "id">>): void {
    this.edit("Edit area", "layout", (graph) => {
      const area = graph.areas.find((area) => area.id === id);
      if (area) Object.assign(area, clone(update));
    });
  }
  lockArea(id: string, locked: boolean): void {
    this.edit("Lock area membership", "layout", (graph) => {
      const area = graph.areas.find((area) => area.id === id);
      if (!area) return;
      const members = areaMembers(graph, id);
      area.locked = locked;
      if (locked) {
        area.nodeIds = [...members.nodeIds];
        area.areaIds = [...members.areaIds];
      } else {
        delete area.nodeIds;
        delete area.areaIds;
      }
    });
  }
  moveArea(id: string, position: Point): void {
    this.edit("Move area", "layout", (graph) => {
      const area = graph.areas.find((area) => area.id === id);
      if (!area) return;
      const members = areaMembers(graph, id);
      const delta = {
        x: position.x - area.position.x,
        y: position.y - area.position.y,
      };
      area.position = { ...position };
      for (const node of graph.nodes)
        if (members.nodeIds.has(node.id)) {
          node.position.x += delta.x;
          node.position.y += delta.y;
        }
      for (const child of graph.areas)
        if (members.areaIds.has(child.id)) {
          child.position.x += delta.x;
          child.position.y += delta.y;
        }
    });
  }
}
