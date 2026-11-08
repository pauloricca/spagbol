import {
  clone,
  createId,
  graphAt,
  portsFor,
  type Diagnostic,
  type GraphArea,
  type GraphDocument,
  type GraphLink,
  type GraphNode,
  type GraphPolicy,
  type LinkModeRegistry,
  type LinkTarget,
  type NodeRegistry,
  type Point,
  type PortEndpoint,
} from "./model.js";

export function sameEndpoint(a: PortEndpoint, b: PortEndpoint): boolean {
  return a.nodeId === b.nodeId && a.portId === b.portId;
}
export function sameTarget(a: LinkTarget, b: LinkTarget): boolean {
  return a.type === "port" && b.type === "port"
    ? sameEndpoint(a, b)
    : a.type === "link" &&
        b.type === "link" &&
        a.linkId === b.linkId &&
        a.property === b.property;
}
export function descendantLinks(
  graph: GraphDocument,
  ids: Iterable<string>,
): Set<string> {
  const result = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of graph.links)
      if (
        link.target.type === "link" &&
        result.has(link.target.linkId) &&
        !result.has(link.id)
      ) {
        result.add(link.id);
        changed = true;
      }
  }
  return result;
}
export function connectionError(
  graph: GraphDocument,
  nodes: NodeRegistry,
  modes: LinkModeRegistry,
  policy: GraphPolicy,
  source: PortEndpoint,
  target: LinkTarget,
  mode: string,
  replacingId?: string,
): string | undefined {
  const sourceNode = graph.nodes.find((node) => node.id === source.nodeId);
  const sourcePort =
    sourceNode &&
    portsFor(sourceNode, nodes).find(
      (port) => port.id === source.portId && port.direction === "output",
    );
  if (!sourcePort || sourcePort.connectable === false)
    return "The source must be a connectable output.";
  if (!modes.get(mode) || (policy.modes && !policy.modes.includes(mode)))
    return `Link mode ${mode} is unavailable.`;
  if (target.type === "port") {
    const targetNode = graph.nodes.find((node) => node.id === target.nodeId);
    const targetPort =
      targetNode &&
      portsFor(targetNode, nodes).find(
        (port) => port.id === target.portId && port.direction === "input",
      );
    if (!targetPort || targetPort.connectable === false)
      return "The destination must be a connectable input.";
    if (policy.allowSelfLinks === false && source.nodeId === target.nodeId)
      return "Self connections are disabled.";
    if (
      sourcePort.dataType &&
      targetPort.dataType &&
      sourcePort.dataType !== targetPort.dataType
    )
      return "These port data types are incompatible.";
  } else {
    if (!(policy.linkProperties ?? []).includes(target.property))
      return `Link property ${target.property} is unavailable.`;
    if (!graph.links.some((link) => link.id === target.linkId))
      return "The target link does not exist.";
    if (replacingId && descendantLinks(graph, [replacingId]).has(target.linkId))
      return "A link cannot target itself or one of its descendants.";
  }
  if (
    !policy.allowDuplicateLinks &&
    graph.links.some(
      (link) =>
        link.id !== replacingId &&
        sameEndpoint(link.source, source) &&
        sameTarget(link.target, target),
    )
  )
    return "This connection already exists.";
  return policy.canConnect?.(source, target, graph);
}
export function removeLinks(graph: GraphDocument, ids: Iterable<string>): void {
  const removed = descendantLinks(graph, ids);
  graph.links = graph.links.filter((link) => !removed.has(link.id));
}
export function removeNodes(graph: GraphDocument, ids: Iterable<string>): void {
  const removed = new Set(ids);
  graph.nodes = graph.nodes.filter((node) => !removed.has(node.id));
  removeLinks(
    graph,
    graph.links
      .filter(
        (link) =>
          removed.has(link.source.nodeId) ||
          (link.target.type === "port" && removed.has(link.target.nodeId)),
      )
      .map((link) => link.id),
  );
  for (const area of graph.areas)
    if (area.nodeIds)
      area.nodeIds = area.nodeIds.filter((id) => !removed.has(id));
}
export function pruneInvalidPorts(
  graph: GraphDocument,
  definitions: NodeRegistry,
  changedNodeId?: string,
): void {
  const removed: string[] = [];
  for (const link of graph.links) {
    if (
      changedNodeId &&
      link.source.nodeId !== changedNodeId &&
      !(link.target.type === "port" && link.target.nodeId === changedNodeId)
    )
      continue;
    const source = graph.nodes.find((node) => node.id === link.source.nodeId);
    const sourceValid =
      source &&
      portsFor(source, definitions).some(
        (port) =>
          port.direction === "output" &&
          port.id === link.source.portId &&
          port.connectable !== false,
      );
    const target = link.target;
    const destination =
      target.type === "port"
        ? graph.nodes.find((node) => node.id === target.nodeId)
        : undefined;
    const targetValid =
      target.type === "link" ||
      (destination &&
        portsFor(destination, definitions).some(
          (port) =>
            port.direction === "input" &&
            port.id === target.portId &&
            port.connectable !== false,
        ));
    if (!sourceValid || !targetValid) removed.push(link.id);
  }
  removeLinks(graph, removed);
}
export function validateGraph(
  graph: GraphDocument,
  definitions: NodeRegistry,
  modes: LinkModeRegistry,
  policy: GraphPolicy = {},
  path: readonly string[] = [],
): Diagnostic[] {
  const result: Diagnostic[] = [];
  const error = (
    code: string,
    message: string,
    extra: Partial<Diagnostic> = {},
  ) => result.push({ severity: "error", code, message, path, ...extra });
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id))
      error("duplicate-node", `Duplicate node ${node.id}.`, {
        nodeId: node.id,
      });
    ids.add(node.id);
    const definition = definitions.get(node.kind);
    if (!definition)
      error(
        "unknown-node",
        `Unknown node kind ${node.kind}. Its data is retained.`,
        { nodeId: node.id },
      );
    const portIds = new Set<string>();
    for (const port of portsFor(node, definitions)) {
      const key = `${port.direction}:${port.id}`;
      if (portIds.has(key))
        error("duplicate-port", `Duplicate port ${port.label}.`, {
          nodeId: node.id,
          portId: port.id,
        });
      portIds.add(key);
    }
    for (const message of definition?.validate?.(node) ?? [])
      error("node-data", message, { nodeId: node.id });
    if (node.graph)
      result.push(
        ...validateGraph(node.graph, definitions, modes, policy, [
          ...path,
          node.id,
        ]),
      );
  }
  const links = new Set<string>();
  for (const link of graph.links) {
    if (links.has(link.id))
      error("duplicate-link", `Duplicate link ${link.id}.`, {
        linkId: link.id,
      });
    links.add(link.id);
    const message = connectionError(
      graph,
      definitions,
      modes,
      policy,
      link.source,
      link.target,
      link.mode,
      link.id,
    );
    if (message) error("invalid-connection", message, { linkId: link.id });
  }
  const areas = new Set<string>();
  for (const area of graph.areas) {
    if (areas.has(area.id))
      error("duplicate-area", `Duplicate area ${area.id}.`);
    areas.add(area.id);
  }
  return result;
}
export function contains(area: GraphArea, point: Point): boolean {
  return (
    point.x >= area.position.x &&
    point.y >= area.position.y &&
    point.x < area.position.x + area.size.width &&
    point.y < area.position.y + area.size.height
  );
}
export function areaMembers(
  graph: GraphDocument,
  id: string,
  visited = new Set<string>(),
): { nodeIds: Set<string>; areaIds: Set<string> } {
  const area = graph.areas.find((candidate) => candidate.id === id);
  const nodeIds = new Set<string>(),
    areaIds = new Set<string>();
  if (!area || visited.has(id)) return { nodeIds, areaIds };
  const next = new Set([...visited, id]);
  if (area.ownerNodeId && graph.nodes.some(node => node.id === area.ownerNodeId)) nodeIds.add(area.ownerNodeId);
  for (const node of graph.nodes)
    if (
      area.locked
        ? area.nodeIds?.includes(node.id)
        : contains(area, node.position)
    )
      nodeIds.add(node.id);
  for (const other of graph.areas) {
    if (other.id === id || next.has(other.id)) continue;
    if (
      !(area.locked
        ? area.areaIds?.includes(other.id)
        : contains(area, other.position) &&
          other.size.width <= area.size.width &&
          other.size.height <= area.size.height)
    )
      continue;
    areaIds.add(other.id);
    const children = areaMembers(graph, other.id, next);
    for (const child of children.nodeIds) nodeIds.add(child);
    for (const child of children.areaIds) areaIds.add(child);
  }
  return { nodeIds, areaIds };
}
export interface GraphFragment {
  format: "spagbol-fragment";
  version: 1;
  nodes: GraphNode[];
  links: GraphLink[];
  areas: GraphArea[];
  boundaryLinks: GraphLink[];
}
export function copyFragment(
  graph: GraphDocument,
  nodeIds: Iterable<string>,
  areaIds: Iterable<string> = [],
): GraphFragment {
  const included = new Set(nodeIds),
    includedAreas = new Set(areaIds);
  for (const id of areaIds) {
    const members = areaMembers(graph, id);
    for (const child of members.nodeIds) included.add(child);
    for (const child of members.areaIds) includedAreas.add(child);
  }
  const links = new Set(
    graph.links
      .filter(
        (link) =>
          included.has(link.source.nodeId) &&
          link.target.type === "port" &&
          included.has(link.target.nodeId),
      )
      .map((link) => link.id),
  );
  let length = -1;
  while (length !== links.size) {
    length = links.size;
    for (const link of graph.links)
      if (
        included.has(link.source.nodeId) &&
        link.target.type === "link" &&
        links.has(link.target.linkId)
      )
        links.add(link.id);
  }
  return clone({
    format: "spagbol-fragment",
    version: 1,
    nodes: graph.nodes.filter((node) => included.has(node.id)),
    links: graph.links.filter((link) => links.has(link.id)),
    areas: graph.areas.filter((area) => includedAreas.has(area.id)),
    boundaryLinks: graph.links.filter(
      (link) =>
        !links.has(link.id) &&
        (included.has(link.source.nodeId) ||
          (link.target.type === "port" && included.has(link.target.nodeId))),
    ),
  });
}
export function pasteFragment(
  graph: GraphDocument,
  fragment: GraphFragment,
  definitions: NodeRegistry,
  offset: Point,
  external = false,
): { nodeIds: string[]; areaIds: string[] } {
  const ids = new Map<string, string>();
  for (const node of fragment.nodes) ids.set(node.id, createId("node"));
  const areaIds = new Map(
    fragment.areas.map((area) => [area.id, createId("area")]),
  );
  const candidates = [
    ...fragment.links,
    ...(external ? fragment.boundaryLinks : []),
  ];
  const linkIds = new Map(
    candidates.map((link) => [link.id, createId("link")]),
  );
  const nodes = clone(fragment.nodes).map((node) => ({
    ...node,
    id: ids.get(node.id)!,
    position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
    data: definitions.get(node.kind)?.cloneData?.(node.data, ids) ?? node.data,
  }));
  const available = new Set([
    ...graph.nodes.map((node) => node.id),
    ...nodes.map((node) => node.id),
  ]);
  const links = candidates.flatMap((original) => {
    const link = clone(original);
    link.id = linkIds.get(original.id)!;
    link.source.nodeId =
      ids.get(original.source.nodeId) ?? original.source.nodeId;
    link.target =
      original.target.type === "port"
        ? {
            ...original.target,
            nodeId: ids.get(original.target.nodeId) ?? original.target.nodeId,
          }
        : {
            ...original.target,
            linkId:
              linkIds.get(original.target.linkId) ?? original.target.linkId,
          };
    if (
      !available.has(link.source.nodeId) ||
      (link.target.type === "port" && !available.has(link.target.nodeId))
    )
      return [];
    return [link];
  });
  graph.nodes.push(...nodes);
  graph.links.push(...links);
  // A copied modulation can reference a boundary link which was not included.
  let count = -1;
  while (count !== graph.links.length) {
    count = graph.links.length;
    const existing = new Set(graph.links.map((link) => link.id));
    graph.links = graph.links.filter(
      (link) => link.target.type !== "link" || existing.has(link.target.linkId),
    );
  }
  graph.areas.push(
    ...clone(fragment.areas).map((area) => ({
      ...area,
      id: areaIds.get(area.id)!,
      ...(area.ownerNodeId ? { ownerNodeId: ids.get(area.ownerNodeId) ?? area.ownerNodeId } : {}),
      position: {
        x: area.position.x + offset.x,
        y: area.position.y + offset.y,
      },
      ...(area.nodeIds
        ? {
            nodeIds: area.nodeIds.flatMap((id) =>
              ids.has(id) ? [ids.get(id)!] : [],
            ),
          }
        : {}),
      ...(area.areaIds
        ? {
            areaIds: area.areaIds.flatMap((id) =>
              areaIds.has(id) ? [areaIds.get(id)!] : [],
            ),
          }
        : {}),
    })),
  );
  return {
    nodeIds: nodes.map((node) => node.id),
    areaIds: [...areaIds.values()],
  };
}
/** Propagate a nested graph edit to explicitly linked instances, never their overrides. */
export function synchronizeSharedGraph(
  document: GraphDocument,
  path: readonly string[],
): void {
  if (!path.length) return;
  const parent = graphAt(document, path.slice(0, -1));
  const owner = parent.nodes.find((node) => node.id === path.at(-1));
  if (!owner?.sharedGraphId || !owner.graph) return;
  const sharedId = owner.sharedGraphId,
    content = clone(owner.graph);
  const visit = (graph: GraphDocument) => {
    for (const node of graph.nodes) {
      if (node.sharedGraphId === sharedId) node.graph = clone(content);
      else if (node.graph) visit(node.graph);
    }
  };
  visit(document);
}
