import type {
  GraphDocument,
  GraphFragment,
  GraphNode,
  GraphArea,
  Point,
} from "../core/index.js";

export interface DuplicateDrag {
  namespace: string;
  fragment: GraphFragment;
  origin: Point;
  nodeId: string;
  positions: Map<string, Point>;
  external: boolean;
  areaPositions?: Map<string, Point>;
}

/** Rendering only: originals and moving copies coexist without editing the document. */
export function duplicateDragPresentation(
  graph: GraphDocument,
  drag: DuplicateDrag,
) {
  const aliases = new Map(
    drag.fragment.nodes.map((node) => [
      node.id,
      `${drag.namespace}:origin:${node.id}`,
    ]),
  );
  const areaAliases = new Map(drag.fragment.areas.map(area => [area.id, `${drag.namespace}:origin:${area.id}`]));
  const originalAreas = new Map<string, GraphArea>();
  const originalNodes = new Map<string, GraphNode>();
  const previewNodeIds = new Set(drag.fragment.nodes.map((node) => node.id));
  const candidates = [
    ...drag.fragment.links,
    ...(drag.external ? drag.fragment.boundaryLinks : []),
  ];
  const previewLinks = new Map(
    candidates.map((link) => [`${drag.namespace}:link:${link.id}`, link.id]),
  );
  const linkIds = new Map(
    candidates.map((link) => [link.id, `${drag.namespace}:link:${link.id}`]),
  );
  const stationary = graph.nodes.map((node) => {
    const alias = aliases.get(node.id);
    if (!alias) return node;
    originalNodes.set(alias, node);
    return { ...node, id: alias };
  });
  const moving = drag.fragment.nodes.map((node) => ({
    ...node,
    position: drag.positions.get(node.id) ?? node.position,
  }));
  const originalLinks = graph.links.map((link) => ({
    ...link,
    source: {
      ...link.source,
      nodeId: aliases.get(link.source.nodeId) ?? link.source.nodeId,
    },
    target:
      link.target.type === "port"
        ? {
            ...link.target,
            nodeId: aliases.get(link.target.nodeId) ?? link.target.nodeId,
          }
        : link.target,
  }));
  const movingLinks = candidates.map((link) => ({
    ...link,
    id: linkIds.get(link.id)!,
    target:
      link.target.type === "link"
        ? {
            ...link.target,
            linkId: linkIds.get(link.target.linkId) ?? link.target.linkId,
          }
        : link.target,
  }));
  const presentation: GraphDocument = {
    ...graph,
    nodes: [...stationary, ...moving],
    links: [...originalLinks, ...movingLinks],
    areas: [
      ...graph.areas.map(area => {
        const alias = areaAliases.get(area.id);
        if (alias) originalAreas.set(alias, area);
        return { ...area, id: alias ?? area.id,
          ...(area.ownerNodeId ? { ownerNodeId: aliases.get(area.ownerNodeId) ?? area.ownerNodeId } : {}),
          ...(area.nodeIds ? { nodeIds: area.nodeIds.map(id => aliases.get(id) ?? id) } : {}),
          ...(area.areaIds ? { areaIds: area.areaIds.map(id => areaAliases.get(id) ?? id) } : {}),
        };
      }),
      ...drag.fragment.areas.map(area => ({ ...area, position: drag.areaPositions?.get(area.id) ?? area.position })),
    ],
  };
  return { graph: presentation, originalAreas, originalNodes, previewNodeIds, previewLinks };
}
