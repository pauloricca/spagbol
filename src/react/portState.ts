import type { GraphDocument } from "../core/index.js";
export type PortState = { inputs: Set<string>; outputs: Set<string>; replaced: Set<string> };
const documentCache = new WeakMap<GraphDocument, Map<string, PortState>>();
const connectionCache = new WeakMap<GraphDocument['links'], { enabled: string; state: Map<string, PortState> }>();
export const emptyPortState: PortState = { inputs: new Set(), outputs: new Set(), replaced: new Set() };
/** Value edits share connection state; rewiring/mode/enabled edits invalidate it. */
export function graphPortStates(graph: GraphDocument) {
  const cached = documentCache.get(graph); if (cached) return cached;
  const enabledKey = JSON.stringify(graph.nodes.map(node => [node.id, node.enabled !== false]));
  const connections = Object.isFrozen(graph) ? connectionCache.get(graph.links) : undefined;
  if (connections?.enabled === enabledKey) { documentCache.set(graph, connections.state); return connections.state; }
  const result = new Map<string, PortState>();
  const enabled = new Set(graph.nodes.filter(node => node.enabled !== false).map(node => node.id));
  const state = (id: string) => { let value = result.get(id); if (!value) { value = { inputs: new Set(), outputs: new Set(), replaced: new Set() }; result.set(id, value); } return value; };
  for (const link of graph.links) {
    state(link.source.nodeId).outputs.add(link.source.portId);
    if (link.target.type === 'port') {
      state(link.target.nodeId).inputs.add(link.target.portId);
      if (link.enabled !== false && link.mode === 'set' && enabled.has(link.source.nodeId)) state(link.target.nodeId).replaced.add(link.target.portId);
    }
  }
  if (Object.isFrozen(graph)) { documentCache.set(graph, result); connectionCache.set(graph.links, { enabled: enabledKey, state: result }); }
  return result;
}
