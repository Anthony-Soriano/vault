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

test("every child remains closer to its own parent than an unrelated project branch", () => {
  const model = createHierarchyModel(hierarchy), unrelated = model.nodeById.get("project-b")!;
  for (const id of ["folder-a", "nested-a", "note-a"]) {
    const node = model.nodeById.get(id)!, parent = model.nodeById.get(node.parentId!)!;
    assert.ok(Math.hypot(node.targetX-parent.targetX,node.targetY-parent.targetY) < Math.hypot(node.targetX-unrelated.targetX,node.targetY-unrelated.targetY));
  }
});
