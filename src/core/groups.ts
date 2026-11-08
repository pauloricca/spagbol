import { clone, createId, spagbolGroupKinds, type GraphDocument, type GraphNode, type NodeRegistry, type PortDefinition, type NodeData, type PortEndpoint, type LinkTarget } from './model.js';
import { pruneInvalidPorts } from './graph.js';

export function isGroupBoundary(node: GraphNode): boolean {
  return node.kind === spagbolGroupKinds.inputs || node.kind === spagbolGroupKinds.outputs;
}
export function normalizeGroupPortLabel(label: string): string {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!/^[a-z0-9]+(?: [a-z0-9]+)*$/.test(normalized)) throw new Error('Use a lowercase, human-readable port name with spaces.');
  return normalized;
}
export function createGroupPort(node: GraphNode, label: string, defaultValue = 0): PortDefinition {
  if (!isGroupBoundary(node)) throw new Error('Ports can be added to Ins or Outs nodes.');
  const port: PortDefinition = { id: createId('port'), label: normalizeGroupPortLabel(label), direction: node.kind === spagbolGroupKinds.inputs ? 'output' : 'input', defaultValue };
  node.ports ??= [];
  if (node.ports.some(item => item.label === port.label)) throw new Error('That port name already exists.');
  node.ports.push(port);
  if (node.kind === spagbolGroupKinds.inputs) node.values[port.id] = defaultValue;
  return port;
}

export function createEditablePort(node: GraphNode, registry: NodeRegistry, label: string, defaultValue = 0): PortDefinition {
  if (isGroupBoundary(node)) return createGroupPort(node, label, defaultValue);
  const definition = registry.get(node.kind);
  if (!definition?.editablePorts || !definition.createPort) throw new Error('This node does not expose editable ports.');
  const normalized = normalizeGroupPortLabel(label);
  if (node.ports?.some(port => port.label === normalized)) throw new Error('That port name already exists.');
  const port = definition.createPort(node, normalized);
  node.ports ??= []; node.ports.push(port); node.values[port.id] = port.defaultValue ?? defaultValue;
  return port;
}

/** Apply a boundary change to every linked group instance and prune dependent cables atomically. */
export function synchronizeGroupBoundaries(document: GraphDocument, registry: NodeRegistry): void {
  for (const node of document.nodes) if (node.graph) {
    synchronizeGroupBoundaries(node.graph, registry);
    if (node.kind !== spagbolGroupKinds.group) continue;
    node.ports = [...new Map(node.graph.nodes.filter(isGroupBoundary).flatMap(boundary => (boundary.ports ?? []).map(port => ({ ...port, direction: boundary.kind === spagbolGroupKinds.inputs ? 'input' as const : 'output' as const }))).map(port => [`${port.direction}:${port.id}`, port])).values()];
    const inputs = new Set(node.ports.filter(port => port.direction === 'input').map(port => port.id));
    for (const id of Object.keys(node.values)) if (!inputs.has(id)) delete node.values[id];
    for (const port of node.ports) if (port.direction === 'input' && node.values[port.id] === undefined) node.values[port.id] = port.defaultValue ?? 0;
    pruneInvalidPorts(document, registry, node.id);
    const ids = new Set(node.graph.nodes.map(item => item.id));
    for (const overrides of [node.overrides, node.dataOverrides])
      if (overrides) for (const id of Object.keys(overrides)) if (!ids.has(groupControlPath(id)[0]!)) delete overrides[id];
  }
}

export function groupControlKey(path: string | readonly string[]): string {
  return typeof path === 'string' ? path : path.length === 1 ? path[0]! : JSON.stringify(path);
}
export function groupControlPath(key: string): string[] {
  if (key.startsWith('[')) try { const path: unknown = JSON.parse(key); if (Array.isArray(path) && path.every(id => typeof id === 'string')) return path; } catch { /* A literal node id. */ }
  return [key];
}
export function findGroupControl(group: GraphNode, path: string | readonly string[]): GraphNode | undefined {
  const ids = typeof path === 'string' ? groupControlPath(path) : path;
  let graph = group.graph;
  let node: GraphNode | undefined;
  for (const id of ids) { node = graph?.nodes.find(item => item.id === id); if (!node) return; graph = node.graph; }
  return node;
}
export function effectiveGroupGraph(group: GraphNode): GraphDocument | undefined {
  if (!group.graph) return;
  const result: GraphNode = { ...group, graph: clone(group.graph) };
  for (const node of result.graph!.nodes) if (node.graph) {
    node.graph = effectiveGroupGraph(node)!;
    delete node.overrides; delete node.dataOverrides;
  }
  for (const [id, values] of Object.entries(group.overrides ?? {})) {
    const node = findGroupControl(result, id);
    if (node) Object.assign(node.values, values);
  }
  for (const [id, data] of Object.entries(group.dataOverrides ?? {})) {
    const node = findGroupControl(result, id);
    if (node) Object.assign(node.data, data);
  }
  return result.graph;
}

/** Teia's UI/Controls area projection, with explicit exposure also supported. */
const panelCache = new WeakMap<GraphNode, ReturnType<typeof computeGroupPanelLayout>>();
export function groupPanelLayout(group: GraphNode) {
  if (!Object.isFrozen(group)) return computeGroupPanelLayout(group);
  if (!panelCache.has(group)) panelCache.set(group, computeGroupPanelLayout(group));
  return panelCache.get(group);
}
function computeGroupPanelLayout(group: GraphNode) {
  const graph = effectiveGroupGraph(group);
  if (!graph) return;
  const areas = graph.areas.filter(area => area.data?.role === 'controls' || (!area.ownerNodeId && ['ui', 'controls'].includes(area.title.trim().toLowerCase())));
  const exposed = graph.data?.exposedNodeIds;
  const ids = new Set<string>([...(group.panelNodeIds ?? []), ...(Array.isArray(exposed) ? exposed.filter((id): id is string => typeof id === 'string') : [])]);
  for (const area of areas) for (const node of graph.nodes) {
    if (area.locked ? area.nodeIds?.includes(node.id) : node.position.x >= area.position.x && node.position.x < area.position.x + area.size.width && node.position.y >= area.position.y && node.position.y < area.position.y + area.size.height) ids.add(node.id);
  }
  const nodes = graph.nodes.filter(node => ids.has(node.id) && !isGroupBoundary(node));
  if (!areas.length && !nodes.length) return;
  const left = areas.length ? Math.min(...areas.map(area => area.position.x)) : Math.min(...nodes.map(node => node.position.x));
  const top = Math.min(...areas.map(area => area.position.y + 32), ...nodes.map(node => node.position.y));
  const right = areas.length ? Math.max(...areas.map(area => area.position.x + area.size.width)) : Math.max(...nodes.map(node => node.position.x + ((node.size?.width ?? 220) * (node.scale ?? 1))));
  const bottom = areas.length ? Math.max(...areas.map(area => area.position.y + area.size.height)) : Math.max(...nodes.map(node => node.position.y + ((node.size?.height ?? 120) * (node.scale ?? 1))));
  return { position: { x: left, y: top }, size: { width: right - left, height: bottom - top }, nodes };
}

/** Transient handle ID; it is resolved to a persistent boundary port in one edit. */
export const spagbolNewPortId = 'spagbol.new-port';
export function resolveNewBoundaryPorts(graph: GraphDocument, source: PortEndpoint, target: LinkTarget, registry: NodeRegistry) {
  const from = { ...source }, to = { ...target };
  const label = (nodeId: string, portId: string) => {
    const node = graph.nodes.find(node => node.id === nodeId);
    return node && (node.ports ?? registry.get(node.kind)?.ports(node) ?? []).find(port => port.id === portId)?.label;
  };
  const create = (nodeId: string, direction: 'input' | 'output', preferred?: string) => {
    const node = graph.nodes.find(node => node.id === nodeId && (node.kind === (direction === 'output' ? spagbolGroupKinds.inputs : spagbolGroupKinds.outputs) || registry.get(node.kind)?.editablePorts === direction));
    if (!node) return spagbolNewPortId;
    const base = preferred?.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() || 'value';
    let name = base, suffix = 2;
    while (node.ports?.some(port => port.label === name)) name = `${base} ${suffix++}`;
    return createEditablePort(node, registry, name).id;
  };
  if (from.portId === spagbolNewPortId) from.portId = create(from.nodeId, "output", to.type === 'port' ? label(to.nodeId, to.portId) : 'strength');
  if (to.type === 'port' && to.portId === spagbolNewPortId) to.portId = create(to.nodeId, "input", label(from.nodeId, from.portId));
  return { source: from, target: to };
}
