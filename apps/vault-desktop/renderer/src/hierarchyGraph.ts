import type { AtlasNode } from "@orbit/vault-types";
type VaultItem = AtlasNode;
type VaultItemType = AtlasNode["type"];

export type GraphNode = VaultItem & {
  depth: number;
  childCount: number;
  descendantCount: number;
  path: string;
  branchId: string;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  offsetX: number;
  offsetY: number;
  radius: number;
  regionRadius: number;
};

export type StructuralEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: "contains";
};

export type SemanticEdgeType = "references" | "supports" | "contradicts" | "related_to";
export type SemanticEdge = { id: string; sourceId: string; targetId: string; type: SemanticEdgeType };
export type AggregatedRelationshipBridge = { sourceBranchId: string; targetBranchId: string; count: number; edgeIds: string[] };

export type HierarchyModel = {
  nodes: GraphNode[];
  nodeById: Map<string, GraphNode>;
  childrenById: Map<string, GraphNode[]>;
  structuralEdges: StructuralEdge[];
  semanticEdges: SemanticEdge[];
};

const CLUSTER_ANCHORS: Record<string, { x: number; y: number }> = {
  projects: { x: -285, y: -175 },
  notes: { x: 255, y: -185 },
  ideas: { x: 245, y: 205 },
  archive: { x: -230, y: 220 },
};
const distanceForDepth = (depth: number) => depth === 2 ? 105 : depth === 3 ? 62 : depth === 4 ? 42 : 30;
const stableAngle = (id: string) => [...id].reduce((total, character) => total + character.charCodeAt(0), 0) % 360 * Math.PI / 180;

const radiusFor = (type: VaultItemType, depth: number, childCount: number) => {
  if (depth === 0) return 17;
  if (depth === 1) return 12.5 + Math.min(2, childCount * 0.22);
  if (type === "project") return 11 + Math.min(1.5, childCount * 0.15);
  if (type === "folder") return 7.5 + Math.min(1.8, childCount * 0.16);
  return 3.7;
};

export function createHierarchyModel(items: VaultItem[]): HierarchyModel {
  const itemById = new Map(items.map(item => [item.id, item]));
  const rawChildren = new Map<string, VaultItem[]>();
  for (const item of items) {
    if (item.parentId && !itemById.has(item.parentId)) throw new Error(`Missing parent ${item.parentId} for ${item.id}`);
    if (item.parentId) rawChildren.set(item.parentId, [...(rawChildren.get(item.parentId) ?? []), item]);
  }
  const roots = items.filter(item => item.parentId === null);
  if (roots.length !== 1) throw new Error("The demo hierarchy must contain exactly one root");

  const depthOf = (item: VaultItem): number => item.parentId ? depthOf(itemById.get(item.parentId)!) + 1 : 0;
  const pathOf = (item: VaultItem): string => item.parentId ? `${pathOf(itemById.get(item.parentId)!)} / ${item.name}` : item.name;
  const branchOf = (item: VaultItem): string => {
    if (!item.parentId) return item.id;
    const parent = itemById.get(item.parentId)!;
    return parent.parentId === null ? item.id : branchOf(parent);
  };
  const descendantCountOf = (item: VaultItem): number => (rawChildren.get(item.id) ?? []).reduce((total, child) => total + 1 + descendantCountOf(child), 0);

  const nodes = items.map(item => ({
    ...item,
    depth: depthOf(item),
    childCount: rawChildren.get(item.id)?.length ?? 0,
    descendantCount: descendantCountOf(item),
    path: pathOf(item),
    branchId: branchOf(item),
    targetX: 0, targetY: 0, x: 0, y: 0, vx: 0, vy: 0, offsetX: 0, offsetY: 0, radius: 0, regionRadius: 0,
  }));
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const childrenById = new Map<string, GraphNode[]>();
  for (const node of nodes) if (node.parentId) childrenById.set(node.parentId, [...(childrenById.get(node.parentId) ?? []), node]);

  const root = nodeById.get(roots[0].id)!;
  for (const children of childrenById.values()) children.sort((a, b) => a.id.localeCompare(b.id));
  const rootChildren = childrenById.get(root.id) ?? [];
  const placeDescendants = (parent: GraphNode) => {
    const children = childrenById.get(parent.id) ?? [];
    const startAngle = stableAngle(parent.id);
    children.forEach((child, index) => {
      const angle = startAngle + index * Math.PI * 2 / Math.max(1, children.length);
      const distance = distanceForDepth(child.depth);
      child.targetX = parent.targetX + Math.cos(angle) * distance;
      child.targetY = parent.targetY + Math.sin(angle) * distance;
      placeDescendants(child);
    });
  };
  rootChildren.forEach((branch, index) => {
    const fallbackAngle = -Math.PI + index * Math.PI * 2 / rootChildren.length;
    const anchor = CLUSTER_ANCHORS[branch.id] ?? { x: Math.cos(fallbackAngle) * 280, y: Math.sin(fallbackAngle) * 210 };
    branch.targetX = anchor.x;
    branch.targetY = anchor.y;
    placeDescendants(branch);
  });
  nodes.forEach(node => {
    node.radius = radiusFor(node.type, node.depth, node.childCount);
    node.regionRadius = node.depth === 1
      ? 128 + Math.sqrt(node.descendantCount) * 12
      : node.type === "project"
        ? 72 + Math.sqrt(node.descendantCount) * 7
        : node.type === "folder" && node.childCount > 0
          ? 38 + Math.sqrt(node.descendantCount) * 4
          : 0;
    node.x = node.targetX;
    node.y = node.targetY;
  });

  const structuralEdges: StructuralEdge[] = nodes
    .filter((node): node is GraphNode & { parentId: string } => node.parentId !== null)
    .map(node => ({ id: `${node.parentId}->${node.id}`, sourceId: node.parentId, targetId: node.id, type: "contains" }));

  return { nodes, nodeById, childrenById, structuralEdges, semanticEdges: [] };
}

export function ancestorIds(node: GraphNode, nodeById: Map<string, GraphNode>) {
  const ids: string[] = [];
  let current: GraphNode | undefined = node;
  while (current?.parentId) {
    ids.push(current.parentId);
    current = nodeById.get(current.parentId);
  }
  return ids;
}

export function isHiddenByCollapse(node: GraphNode, collapsed: Set<string>, nodeById: Map<string, GraphNode>) {
  let parentId = node.parentId;
  while (parentId) {
    if (collapsed.has(parentId)) return true;
    parentId = nodeById.get(parentId)?.parentId ?? null;
  }
  return false;
}

export function assertHierarchyModel(model: HierarchyModel) {
  if (model.structuralEdges.length !== model.nodes.length - 1) throw new Error("Every non-root node must have exactly one structural edge");
  for (const edge of model.structuralEdges) {
    const child = model.nodeById.get(edge.targetId);
    if (!child || child.parentId !== edge.sourceId || edge.type !== "contains") throw new Error(`Invalid structural edge ${edge.id}`);
  }
  for (const node of model.nodes) {
    if (node.type !== "file" || !node.parentId) continue;
    const parent = model.nodeById.get(node.parentId);
    if (!parent || node.radius >= parent.radius) throw new Error(`File ${node.id} must remain smaller than its parent`);
  }
}

/** Future far-zoom overlay. It aggregates meaning without changing structural positions. */
export function aggregateRelationshipBridges(edges: SemanticEdge[], nodeById: Map<string, GraphNode>) {
  const bridges = new Map<string, AggregatedRelationshipBridge>();
  for (const edge of edges) {
    const source = nodeById.get(edge.sourceId), target = nodeById.get(edge.targetId);
    if (!source || !target || source.branchId === target.branchId) continue;
    const pair = [source.branchId, target.branchId].sort();
    const key = pair.join("::");
    const bridge = bridges.get(key) ?? { sourceBranchId: pair[0], targetBranchId: pair[1], count: 0, edgeIds: [] };
    bridge.count += 1; bridge.edgeIds.push(edge.id); bridges.set(key, bridge);
  }
  return [...bridges.values()];
}
