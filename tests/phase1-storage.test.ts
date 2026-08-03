import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VaultService } from "@orbit/vault-core";
import { SqliteVaultRepository, __testing } from "@orbit/vault-storage";

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "orbit-vault-phase1-"));
  const repository = new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root });
  const service = new VaultService(repository); service.initialize();
  return { root, repository, service, dispose: () => { service.close(); rmSync(root, { recursive: true, force: true }); } };
};

test("migrations are repeatable and entities survive restart", () => {
  const ctx = fixture(); try {
    const project = ctx.service.projects.create({ name: "Project" });
    const folder = ctx.service.folders.create({ projectId: project.id, parentFolderId: null, name: "docs" });
    const note = ctx.service.documents.createMarkdown({ projectId: project.id, parentFolderId: folder.id, title: "plan", content: "# Plan\nSQLite persists." });
    ctx.service.close(); ctx.service.initialize();
    assert.equal(ctx.service.snapshot().documents[0].id, note.id);
    assert.match(ctx.service.documents.read(note.id).content, /SQLite persists/);
  } finally { ctx.dispose(); }
});

test("folder moves reject cycles and documents track rename/move/status", () => {
  const ctx = fixture(); try {
    const project = ctx.service.projects.create({ name: "Moves" });
    const a = ctx.service.folders.create({ projectId: project.id, parentFolderId: null, name: "a" });
    const b = ctx.service.folders.create({ projectId: project.id, parentFolderId: a.id, name: "b" });
    assert.throws(() => ctx.service.folders.move(a.id, b.id), /descendant/);
    const note = ctx.service.documents.createMarkdown({ projectId: project.id, parentFolderId: a.id, title: "note" });
    const renamed = ctx.service.documents.rename(note.id, "renamed"); assert.equal(renamed.title, "renamed.md");
    const moved = ctx.service.documents.move(note.id, b.id); assert.equal(moved.relativePath, "a/b/renamed.md");
    ctx.service.documents.updateContent(note.id, "durable");
    assert.equal(readFileSync(join(ctx.root, "projects", project.id, "files", "a", "b", "renamed.md"), "utf8"), "durable");
    ctx.service.folders.trash(a.id); assert.equal(ctx.service.snapshot().documents.length, 0);
    ctx.service.folders.restore(a.id); assert.equal(ctx.service.snapshot().documents.length, 1);
  } finally { ctx.dispose(); }
});

test("substring search, duplicate handling, safe paths, seed and reset", () => {
  const ctx = fixture(); try {
    const project = ctx.service.projects.create({ name: "Search" });
    ctx.service.projects.create({ name: "Search" });
    assert.equal(ctx.service.projects.list().some(item => item.name === "Search (2)"), true);
    ctx.service.documents.createMarkdown({ projectId: project.id, parentFolderId: null, title: "memory", content: "Evidence lives in Markdown." });
    assert.equal(ctx.service.search({ query: "evidence" })[0].entityType, "document");
    assert.throws(() => __testing.safeResolve(ctx.root, "..", "escape"), /Unsafe path/);
    assert.equal(ctx.service.development.seed().seeded, true);
    assert.equal(ctx.service.development.seed().seeded, false);
    assert.equal(ctx.service.development.reset().projects.length, 0);
  } finally { ctx.dispose(); }
});

test("two real Vault directories remain isolated across switching and restart", () => {
  const first = fixture(), second = fixture(); try {
    const firstProject = first.service.projects.create({ name: "First Vault Project" });
    const firstFolder = first.service.folders.create({ projectId: firstProject.id, parentFolderId: null, name: "first-folder" });
    const firstNote = first.service.documents.createMarkdown({ projectId: firstProject.id, parentFolderId: firstFolder.id, title: "first-note", content: "first vault content" });
    const secondProject = second.service.projects.create({ name: "Second Vault Project" });
    const secondNote = second.service.documents.createMarkdown({ projectId: secondProject.id, parentFolderId: null, title: "second-note", content: "second vault content" });
    first.service.close(); second.service.close();

    const reopenedSecond = new VaultService(new SqliteVaultRepository({ vaultRoot: second.root, developmentMode: true, developmentRoot: second.root })); reopenedSecond.initialize();
    assert.equal(reopenedSecond.snapshot().vaultName, second.root.split(/[\\/]/).at(-1));
    assert.equal(reopenedSecond.projects.list()[0].id, secondProject.id);
    assert.equal(reopenedSecond.documents.read(secondNote.id).content, "second vault content"); reopenedSecond.close();

    const reopenedFirst = new VaultService(new SqliteVaultRepository({ vaultRoot: first.root, developmentMode: true, developmentRoot: first.root })); reopenedFirst.initialize();
    assert.equal(reopenedFirst.projects.list()[0].id, firstProject.id);
    assert.equal(reopenedFirst.documents.read(firstNote.id).content, "first vault content");
    assert.equal(reopenedFirst.search({ query: "second vault" }).length, 0); reopenedFirst.close();
  } finally { first.dispose(); second.dispose(); }
});

test("project archive, trash, and restore preserve the complete hierarchy", () => {
  const ctx = fixture(); try {
    const project = ctx.service.projects.create({ name: "Recoverable" });
    const folder = ctx.service.folders.create({ projectId: project.id, parentFolderId: null, name: "nested" });
    const note = ctx.service.documents.createMarkdown({ projectId: project.id, parentFolderId: folder.id, title: "keep", content: "never delete silently" });
    ctx.service.projects.archive(project.id);
    assert.equal(ctx.service.projects.list({ status: "archived" })[0].id, project.id);
    assert.equal(ctx.service.folders.list(project.id)[0].status, "archived");
    ctx.service.projects.trash(project.id); assert.equal(ctx.service.documents.list(project.id)[0].status, "trashed");
    ctx.service.projects.restore(project.id);
    assert.equal(ctx.service.documents.read(note.id).content, "never delete silently");
    assert.equal(ctx.service.snapshot().atlasNodes.some(node => node.id === note.id), true);
  } finally { ctx.dispose(); }
});
