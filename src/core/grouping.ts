import { areaMembers } from "./graph.js";
import {
  clone,
  createId,
  portsFor,
  emptyGraph,
  spagbolGroupKinds,
  type GraphDocument,
  type GraphLink,
  type GraphNode,
  type NodeRegistry,
  type PortDefinition,
  type PortEndpoint,
} from "./model.js";

export interface GroupOptions {
  groupKind: string;
  inputKind: string;
  outputKind: string;
  label?: string;
}
/** Structural grouping only. Consumers decide how these boundary kinds execute. */
export function groupNodes(
  graph: GraphDocument,
  ids: readonly string[],
  definitions: NodeRegistry,
  options: GroupOptions = { groupKind: spagbolGroupKinds.group, inputKind: spagbolGroupKinds.inputs, outputKind: spagbolGroupKinds.outputs },
): string | undefined {
  const selected = new Set(ids),
    members = graph.nodes.filter((node) => selected.has(node.id));
  if (!members.length) return;
  for (const kind of [options.groupKind, options.inputKind, options.outputKind])
    if (!definitions.get(kind))
      throw new Error(`Grouping requires registered kind ${kind}.`);
  const owner = new Map<string, boolean>();
  const byId = new Map(graph.links.map((link) => [link.id, link]));
  function inside(link: GraphLink, seen = new Set<string>()): boolean {
    if (owner.has(link.id)) return owner.get(link.id)!;
    if (seen.has(link.id))
      throw new Error("Cannot group a cyclic link-property dependency.");
    const next = new Set([...seen, link.id]);
    const target = link.target;
    const parent = target.type === "link" ? byId.get(target.linkId) : undefined;
    if (target.type === "link" && !parent)
      throw new Error("Cannot group a dangling link-property target.");
    const value =
      target.type === "port"
        ? selected.has(target.nodeId)
        : inside(parent!, next);
    owner.set(link.id, value);
    return value;
  }
  const minX = Math.min(...members.map((node) => node.position.x)),
    minY = Math.min(...members.map((node) => node.position.y));
  const maxX = Math.max(
    ...members.map((node) => node.position.x + (node.size?.width ?? 220)),
  );
  const group = definitions.create(options.groupKind, { x: minX, y: minY });
  const input = definitions.create(options.inputKind, {
    x: minX - 270,
    y: minY,
  });
  const output = definitions.create(options.outputKind, {
    x: maxX + 70,
    y: minY,
  });
  group.label = options.label ?? "Group";
  group.graph = emptyGraph();
  group.sharedGraphId = createId("shared");
  group.ports = [];
  input.ports = [];
  output.ports = [];
  const inputPorts = new Map<string, string>(),
    outputPorts = new Map<string, string>();
  const outerInputs: GraphLink[] = [],
    innerOutputs: GraphLink[] = [];
  const key = (endpoint: PortEndpoint) =>
    JSON.stringify([endpoint.nodeId, endpoint.portId]);
  function expose(
    source: PortEndpoint,
    direction: "input" | "output",
    preferredLabel?: string,
  ): PortEndpoint {
    const map = direction === "input" ? inputPorts : outputPorts;
    const previous = map.get(key(source));
    if (previous)
      return {
        nodeId: direction === "input" ? input.id : group.id,
        portId: previous,
      };
    const id = createId("port");
    const sourceNode = graph.nodes.find(node => node.id === source.nodeId);
    const sourcePort = sourceNode && portsFor(sourceNode, definitions).find(port => port.id === source.portId && port.direction === 'output');
    const base = (preferredLabel ?? sourcePort?.label ?? source.portId).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase() || 'signal';
    let label = base, suffix = 2;
    while (group.ports!.some(port => port.direction === direction && port.label === label)) label = `${base} ${suffix++}`;
    const port: PortDefinition = { id, label, direction, defaultValue: 0 };
    group.ports!.push(port);
    map.set(key(source), id);
    if (direction === "input") {
      group.values[id] = 0;
      input.ports!.push({ ...port, direction: "output" });
      outerInputs.push({
        id: createId("link"),
        source: { ...source },
        target: { type: "port", nodeId: group.id, portId: id },
        mode: "set",
        weight: 1,
      });
    } else {
      output.ports!.push({ ...port, direction: "input" });
      output.values[id] = 0;
      innerOutputs.push({
        id: createId("link"),
        source: { ...source },
        target: { type: "port", nodeId: output.id, portId: id },
        mode: "set",
        weight: 1,
      });
    }
    return { nodeId: direction === "input" ? input.id : group.id, portId: id };
  }
  const innerLinks: GraphLink[] = [],
    outerLinks: GraphLink[] = [];
  for (const original of graph.links) {
    const link = clone(original);
    if (inside(original)) {
      if (!selected.has(original.source.nodeId))
        link.source = expose(original.source, "input", original.target.type === 'link' ? 'strength' : (() => {
          const targetNode = graph.nodes.find(node => original.target.type === 'port' && node.id === original.target.nodeId);
          return targetNode && portsFor(targetNode, definitions).find(port => port.direction === 'input' && original.target.type === 'port' && port.id === original.target.portId)?.label;
        })());
      innerLinks.push(link);
    } else {
      if (selected.has(original.source.nodeId))
        link.source = expose(original.source, "output");
      outerLinks.push(link);
    }
  }
  group.graph.nodes = [input, ...members, output];
  group.graph.links = [...innerLinks, ...innerOutputs];
  const movedAreas = graph.areas.filter(area => {
    const members = areaMembers(graph, area.id).nodeIds;
    return members.size > 0 && [...members].every(id => selected.has(id));
  });
  const movedAreaIds = new Set(movedAreas.map(area => area.id));
  group.graph.areas = movedAreas;
  graph.areas = graph.areas.filter(area => !movedAreaIds.has(area.id));
  graph.nodes = [
    ...graph.nodes.filter((node) => !selected.has(node.id)),
    group,
  ];
  graph.links = [...outerLinks, ...outerInputs];
  for (const area of graph.areas) {
    if (area.nodeIds) area.nodeIds = [...new Set(area.nodeIds.map(id => selected.has(id) ? group.id : id))];
    if (area.areaIds) area.areaIds = area.areaIds.filter(id => !movedAreaIds.has(id));
  }
  return group.id;
}
