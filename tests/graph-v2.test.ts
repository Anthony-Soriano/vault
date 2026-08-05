import test from "node:test";
import assert from "node:assert/strict";
import type { AtlasNode } from "@orbit/vault-types";
import { ancestorIds, assertHierarchyModel, createHierarchyModel, isHiddenByCollapse } from "../apps/vault-desktop/renderer/src/hierarchyGraph.ts";

const hierarchy: AtlasNode[] = [
  { id: "vault-root", name: "Vault", type: "vault", parentId: null, projectId: null, path: "Vault" },
  { id: "project-a", name: "Project A", type: "project", parentId: "vault-root", projectId: "project-a", path: "Project A" },
  { id: "project-b", name: "Project B", type: "project", parentId: "vault-root", projectId: "project-b", path: "Project B" },
  { id: "folder-a", name: "Folder A", type: "folder", parentId: "project-a", projectId: "project-a", path: "Folder A" },
  { id: "nested-a", name: "Nested A", type: "folder", parentId: "folder-a", projectId: "project-a", path: "Folder A/Nested A" },
  { id: "note-a", name: "note.md", type: "file", parentId: "nested-a", projectId: "project-a", path: "Folder A/Nested A/note.md" },
  { id: "knowledge-a", name: "Use SQLite", type: "knowledge", parentId: "note-a", projectId: "project-a", path: "Knowledge/decision/Use SQLite" },
  { id: "folder-b", name: "Folder B", type: "folder", parentId: "project-b", projectId: "project-b", path: "Folder B" },
];

test("Graph V2 layout is deterministic regardless of canonical query order", () => {
  const first = createHierarchyModel(hierarchy), second = createHierarchyModel([...hierarchy].reverse());
  assertHierarchyModel(first); assertHierarchyModel(second);
  for (const node of first.nodes) {
    const other = second.nodeById.get(node.id)!;
    assert.equal(node.targetX, other.targetX); assert.equal(node.targetY, other.targetY);
  }
});

test("recursive collapse hides every descendant and search ancestry is complete", () => {
  const model = createHierarchyModel(hierarchy), note = model.nodeById.get("note-a")!;
  assert.equal(isHiddenByCollapse(note, new Set(["folder-a"]), model.nodeById), true);
  assert.equal(isHiddenByCollapse(note, new Set(["project-b"]), model.nodeById), false);
  assert.deepEqual(ancestorIds(note, model.nodeById), ["nested-a", "folder-a", "project-a", "vault-root"]);
});

test("project nodes remain closer to their own cluster centroid than another project", () => {
  const model=createHierarchyModel(hierarchy),distance=(node:any,point:{x:number;y:number})=>Math.hypot(node.targetX-point.x,node.targetY-point.y);
  const centroid=(branchId:string)=>{const branch=model.nodes.filter(node=>node.branchId===branchId);return{x:branch.reduce((sum,node)=>sum+node.targetX,0)/branch.length,y:branch.reduce((sum,node)=>sum+node.targetY,0)/branch.length};};
  const a=centroid("project-a"),b=centroid("project-b");
  for(const node of model.nodes.filter(node=>node.branchId==="project-a"))assert.ok(distance(node,a)<distance(node,b));
  for(const node of model.nodes.filter(node=>node.branchId==="project-b"))assert.ok(distance(node,b)<distance(node,a));
});

test("Atlas derives knowledge beneath its evidence document without graph-only identity", () => {
  const model=createHierarchyModel(hierarchy), knowledge=model.nodeById.get("knowledge-a")!;
  assert.equal(knowledge.type,"knowledge");
  assert.equal(knowledge.parentId,"note-a");
  assert.deepEqual(ancestorIds(knowledge,model.nodeById),["note-a","nested-a","folder-a","project-a","vault-root"]);
});

test("force collision leaves no overlapping node circles", () => {
  const crowded: AtlasNode[] = [
    { id: "root", name: "Vault", type: "vault", parentId: null, projectId: null, path: "Vault" },
    { id: "project", name: "Project", type: "project", parentId: "root", projectId: "project", path: "Project" },
    { id: "loose", name: "readme.md", type: "file", parentId: "project", projectId: "project", path: "readme.md" },
    { id: "folder-one", name: "One", type: "folder", parentId: "project", projectId: "project", path: "One" },
    { id: "folder-two", name: "Two", type: "folder", parentId: "project", projectId: "project", path: "Two" },
    { id: "one-file", name: "one.md", type: "file", parentId: "folder-one", projectId: "project", path: "One/one.md" },
    { id: "two-file", name: "two.md", type: "file", parentId: "folder-two", projectId: "project", path: "Two/two.md" },
  ];
  const model=createHierarchyModel(crowded);
  for(let index=0;index<model.nodes.length;index++)for(let other=index+1;other<model.nodes.length;other++){
    const a=model.nodes[index],b=model.nodes[other],distance=Math.hypot(a.targetX-b.targetX,a.targetY-b.targetY);
    assert.ok(distance>=a.radius+b.radius,`${a.id} overlaps ${b.id}`);
  }
});

test("the Vault root participates in physics instead of being pinned at the origin", () => {
  const singleProject=hierarchy.filter(node=>node.id!=="project-b"&&node.id!=="folder-b");
  const model=createHierarchyModel(singleProject),project=model.nodeById.get("project-a")!,root=model.nodeById.get("vault-root")!;
  assert.notDeepEqual([root.targetX,root.targetY],[0,0]);
  assert.ok(root.radius<project.radius);
});
