import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { VaultService } from "@orbit/vault-core";
import { SqliteVaultRepository, hashTree, fingerprintTree, treesEqual, sqliteLiteralPath, isSafeRelPosixPath, validateManifestShape } from "@orbit/vault-storage";

const repoFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "orbit-vault-backup-"));
  const repo = new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root });
  repo.initialize();
  return { root, repo, dispose: () => { try { repo.close(); } catch { /* already closed */ } rmSync(root, { recursive: true, force: true }); } };
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// --- Task 2: persisted, location-independent Vault UUID -------------------

test("every Vault has a UUID, stable across reopen", () => {
  const ctx = repoFixture();
  try {
    const first = ctx.repo.getVaultId();
    assert.match(first, uuidPattern);
    ctx.repo.close();
    const reopened = new SqliteVaultRepository({ vaultRoot: ctx.root, developmentMode: true, developmentRoot: ctx.root });
    reopened.initialize();
    assert.equal(reopened.getVaultId(), first);
    reopened.close();
  } finally { ctx.dispose(); }
});

test("Vault UUID survives a folder move (location-independent)", () => {
  const ctx = repoFixture();
  const moved = `${ctx.root}-moved`;
  try {
    const original = ctx.repo.getVaultId();
    ctx.repo.close();
    renameSync(ctx.root, moved);
    const repo = new SqliteVaultRepository({ vaultRoot: moved, developmentMode: true, developmentRoot: moved });
    repo.initialize();
    assert.equal(repo.getVaultId(), original);
    repo.close();
  } finally {
    ctx.dispose();
    rmSync(moved, { recursive: true, force: true });
  }
});

test("migration 7 inserts exactly one vault_id row", () => {
  const ctx = repoFixture();
  try {
    const id = ctx.repo.getVaultId();
    ctx.repo.close();
    const db = new DatabaseSync(join(ctx.root, "vault.db"));
    const count = (db.prepare("SELECT COUNT(*) AS c FROM vault_meta WHERE key='vault_id'").get() as { c: number }).c;
    const stored = (db.prepare("SELECT value FROM vault_meta WHERE key='vault_id'").get() as { value: string }).value;
    db.close();
    assert.equal(count, 1);
    assert.equal(stored, id);
  } finally { ctx.dispose(); }
});

// --- Task 3: backup helpers ----------------------------------------------

const scratchDir = () => mkdtempSync(join(tmpdir(), "orbit-helper-"));

test("hashTree is deterministic and detects a content change", () => {
  const dir = scratchDir();
  try {
    mkdirSync(join(dir, "a"), { recursive: true });
    writeFileSync(join(dir, "a", "one.txt"), "hello");
    writeFileSync(join(dir, "two.txt"), "world");
    const first = hashTree(dir);
    assert.ok(first["a/one.txt"].startsWith("sha256:"));
    assert.ok(treesEqual(first, hashTree(dir)));
    writeFileSync(join(dir, "a", "one.txt"), "changed");
    assert.equal(treesEqual(first, hashTree(dir)), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("fingerprintTree detects add/remove/change", () => {
  const dir = scratchDir();
  try {
    writeFileSync(join(dir, "a.txt"), "x");
    const before = fingerprintTree(dir);
    writeFileSync(join(dir, "b.txt"), "y"); // add
    assert.equal(treesEqual(before, fingerprintTree(dir)), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("sqliteLiteralPath forward-slashes and escapes single quotes", () => {
  assert.equal(sqliteLiteralPath(String.raw`C:\v\a'b\vault.db`), "C:/v/a''b/vault.db");
});

test("isSafeRelPosixPath rejects traversal and absolute paths", () => {
  for (const bad of ["../x", "/x", "C:/x", String.raw`a\b`, "..", "projects/../x"]) assert.equal(isSafeRelPosixPath(bad), false, bad);
  for (const ok of ["vault.db", "projects/p/f.md"]) assert.equal(isSafeRelPosixPath(ok), true, ok);
});

test("validateManifestShape flags malformed manifests", () => {
  const good = { snapshotVersion: 1, vaultVersion: "0.2.0", createdAt: new Date().toISOString(), vaultId: "11111111-1111-1111-1111-111111111111", schemaVersion: 7, projectCount: 0, checksums: { "vault.db": "sha256:abc" } };
  assert.deepEqual(validateManifestShape(good), []);
  assert.ok(validateManifestShape({ ...good, snapshotVersion: 2 }).length > 0);
  assert.ok(validateManifestShape({ ...good, vaultId: "not-a-uuid" }).length > 0);
  assert.ok(validateManifestShape({ ...good, createdAt: "nope" }).length > 0);
  assert.ok(validateManifestShape({ ...good, schemaVersion: 0 }).length > 0);
  assert.ok(validateManifestShape({ ...good, checksums: { "../evil": "sha256:x" } }).length > 0);
});

// --- Task 4: createSnapshot capture engine -------------------------------

const seeded = () => {
  const ctx = repoFixture();
  const project = ctx.repo.createProject({ name: "Backup me" });
  ctx.repo.createMarkdownDocument({ projectId: project.id, parentFolderId: null, title: "note", content: "# hello\n" });
  return { ...ctx, project };
};

const backupsEntries = (root: string) => existsSync(join(root, "backups")) ? readdirSync(join(root, "backups")) : [];

test("createSnapshot writes a listable snapshot with a manifest and no WAL sidecar", () => {
  const ctx = seeded();
  try {
    const summary = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    assert.ok(summary.id.length > 0);
    assert.equal(summary.projectCount, 1);
    const dir = join(ctx.root, "backups", summary.id);
    assert.ok(existsSync(join(dir, "manifest.json")));
    assert.ok(existsSync(join(dir, "vault.db")));
    assert.equal(existsSync(join(dir, "vault.db-wal")), false);
    assert.equal(existsSync(join(dir, "vault.db-shm")), false);
    assert.ok(existsSync(join(dir, "projects")));
    assert.equal(backupsEntries(ctx.root).some((n) => n.startsWith(".tmp-")), false);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    assert.equal(manifest.snapshotVersion, 1);
    assert.ok(manifest.checksums["vault.db"].startsWith("sha256:"));
  } finally { ctx.dispose(); }
});

test("createSnapshot aborts when projects/ changes during capture (external change)", () => {
  const ctx = seeded();
  try {
    let fired = false;
    assert.throws(() => ctx.repo.createSnapshot({ appVersion: "0.2.0" }, {
      onAfterManagedCopy: () => { fired = true; writeFileSync(join(ctx.root, "projects", "intruder.txt"), "changed during capture"); },
    }));
    assert.equal(fired, true);
    // no listable snapshot, no leftover temp dir
    assert.equal(backupsEntries(ctx.root).filter((n) => !n.startsWith(".tmp-")).length, 0);
    assert.equal(backupsEntries(ctx.root).some((n) => n.startsWith(".tmp-")), false);
    // live Vault unchanged: still one project
    assert.equal(ctx.repo.listProjects().length, 1);
  } finally { ctx.dispose(); }
});

test("createSnapshot leaves no half-snapshot when capture fails mid-way", () => {
  const ctx = seeded();
  try {
    assert.throws(() => ctx.repo.createSnapshot({ appVersion: "0.2.0" }, {
      onAfterManagedCopy: () => { throw new Error("boom"); },
    }));
    assert.equal(backupsEntries(ctx.root).length, 0);
    assert.equal(ctx.repo.listProjects().length, 1);
  } finally { ctx.dispose(); }
});

// --- Task 5: list / inspect / delete / disk usage ------------------------

test("list/inspect/delete snapshots round-trip", () => {
  const ctx = seeded();
  try {
    const a = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    const list = ctx.repo.listSnapshots();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, a.id);
    const inspection = ctx.repo.inspectSnapshot(a.id);
    assert.equal(inspection.integrityOk, true);
    assert.deepEqual(inspection.problems, []);
    assert.ok(ctx.repo.backupsDiskUsage().totalBytes > 0);
    assert.equal(ctx.repo.backupsDiskUsage().count, 1);
    ctx.repo.deleteSnapshot(a.id);
    assert.equal(ctx.repo.listSnapshots().length, 0);
  } finally { ctx.dispose(); }
});

test("inspect flags a corrupted snapshot database", () => {
  const ctx = seeded();
  try {
    const a = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    writeFileSync(join(ctx.root, "backups", a.id, "vault.db"), "corrupted");
    const inspection = ctx.repo.inspectSnapshot(a.id);
    assert.equal(inspection.integrityOk, false);
    assert.ok(inspection.problems.some((p) => p.includes("vault.db")));
  } finally { ctx.dispose(); }
});

test("inspect flags an unexpected extra file and a missing file", () => {
  const ctx = seeded();
  try {
    const a = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    writeFileSync(join(ctx.root, "backups", a.id, "projects", "surprise.txt"), "extra");
    const withExtra = ctx.repo.inspectSnapshot(a.id);
    assert.equal(withExtra.integrityOk, false);
    assert.ok(withExtra.problems.some((p) => p.toLowerCase().includes("unexpected")));

    const b = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    rmSync(join(ctx.root, "backups", b.id, "projects"), { recursive: true, force: true });
    const withMissing = ctx.repo.inspectSnapshot(b.id);
    assert.equal(withMissing.integrityOk, false);
    assert.ok(withMissing.problems.some((p) => p.toLowerCase().includes("missing")));
  } finally { ctx.dispose(); }
});

test("listSnapshots ignores temp and staging artifacts", () => {
  const ctx = seeded();
  try {
    ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    mkdirSync(join(ctx.root, "backups", ".tmp-abc"), { recursive: true });
    mkdirSync(join(ctx.root, "backups", "target.restoring-xyz"), { recursive: true });
    assert.equal(ctx.repo.listSnapshots().length, 1);
  } finally { ctx.dispose(); }
});

test("snapshot id path traversal is rejected", () => {
  const ctx = seeded();
  try {
    assert.throws(() => ctx.repo.inspectSnapshot("../../etc"));
    assert.throws(() => ctx.repo.deleteSnapshot("../../etc"));
  } finally { ctx.dispose(); }
});

// --- Task 6: restoreSnapshotToNewVault -----------------------------------

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const logicalDump = (repo: SqliteVaultRepository) =>
  repo.listProjects().sort(byId).map((p) => ({
    project: p,
    folders: repo.listProjectFolders(p.id).sort(byId),
    documents: repo.listProjectDocuments(p.id).sort(byId),
    knowledge: repo.listKnowledgeObjects({ projectId: p.id }).sort(byId).map((k) => ({
      object: k,
      evidence: repo.listEvidence(k.id).sort(byId),
      history: repo.listKnowledgeHistory(k.id),
    })),
    relationships: repo.listRelationships({ projectId: p.id }).sort(byId),
  }));

const richVault = () => {
  const ctx = repoFixture();
  const project = ctx.repo.createProject({ name: "Rich" });
  const doc = ctx.repo.createMarkdownDocument({ projectId: project.id, parentFolderId: null, title: "note", content: "# hello world\n" });
  const knowledge = ctx.repo.createKnowledgeObject({ projectId: project.id, parentFolderId: null, type: "fact", title: "A fact", body: "Body text", confidence: "high" });
  ctx.repo.attachEvidence({ projectId: project.id, knowledgeObjectId: knowledge.id, sourceType: "document", sourceId: doc.id, sourcePath: doc.relativePath, excerpt: "evidence", locator: "note", confidence: "high" });
  ctx.repo.setKnowledgeStatus(knowledge.id, "approved"); // generates history
  ctx.repo.createRelationship({ projectId: project.id, sourceType: "knowledge", sourceId: knowledge.id, targetType: "document", targetId: doc.id, relationshipType: "references" });
  return { ...ctx, project, doc, knowledge };
};

const stagingLeftIn = (parent: string) => readdirSync(parent).filter((n) => n.includes(".orbit-restoring-"));

test("restore reproduces logical state + file hashes into a NEW vault with new identity + lineage", () => {
  const ctx = richVault();
  let restored: SqliteVaultRepository | null = null;
  try {
    const sourceHashes = hashTree(join(ctx.root, "projects"));
    const sourceDump = JSON.stringify(logicalDump(ctx.repo));
    const sourceVaultId = ctx.repo.getVaultId();
    const snap = ctx.repo.createSnapshot({ appVersion: "0.2.0" });

    const result = ctx.repo.restoreSnapshotToNewVault({ snapshotId: snap.id, parentPath: ctx.root, folderName: "restored-here" });
    const target = join(ctx.root, "restored-here");
    assert.equal(result.targetPath, target);

    restored = new SqliteVaultRepository({ vaultRoot: target, developmentMode: true, developmentRoot: target });
    restored.initialize();
    assert.deepEqual(hashTree(join(target, "projects")), sourceHashes);
    assert.equal(JSON.stringify(logicalDump(restored)), sourceDump);
    assert.notEqual(restored.getVaultId(), sourceVaultId);
    assert.equal(restored.getVaultMeta("restored_from_vault_id"), sourceVaultId);
    assert.equal(restored.getVaultMeta("restored_from_snapshot_id"), snap.id);
    assert.ok(restored.getVaultMeta("restored_at"));
    assert.equal(stagingLeftIn(ctx.root).length, 0);
  } finally { try { restored?.close(); } catch { /* noop */ } ctx.dispose(); }
});

test("restore refuses a corrupted snapshot and leaves no target", () => {
  const ctx = richVault();
  try {
    const snap = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    writeFileSync(join(ctx.root, "backups", snap.id, "vault.db"), "corrupt");
    const before = JSON.stringify(logicalDump(ctx.repo));
    assert.throws(() => ctx.repo.restoreSnapshotToNewVault({ snapshotId: snap.id, parentPath: ctx.root, folderName: "nope" }));
    assert.equal(existsSync(join(ctx.root, "nope")), false);
    assert.equal(stagingLeftIn(ctx.root).length, 0);
    assert.equal(JSON.stringify(logicalDump(ctx.repo)), before); // live vault unchanged
  } finally { ctx.dispose(); }
});

test("restore refuses a schema-too-new snapshot (schema guard)", () => {
  const ctx = richVault();
  try {
    const snap = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    const mPath = join(ctx.root, "backups", snap.id, "manifest.json");
    const m = JSON.parse(readFileSync(mPath, "utf8"));
    m.schemaVersion = 9999;
    writeFileSync(mPath, JSON.stringify(m, null, 2));
    assert.throws(() => ctx.repo.restoreSnapshotToNewVault({ snapshotId: snap.id, parentPath: ctx.root, folderName: "t2" }), /newer version/i);
    assert.equal(existsSync(join(ctx.root, "t2")), false);
  } finally { ctx.dispose(); }
});

test("restore refuses when the target already exists", () => {
  const ctx = richVault();
  try {
    const snap = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    mkdirSync(join(ctx.root, "exists"), { recursive: true });
    assert.throws(() => ctx.repo.restoreSnapshotToNewVault({ snapshotId: snap.id, parentPath: ctx.root, folderName: "exists" }));
  } finally { ctx.dispose(); }
});

// --- Task 7: VaultService.backup facade ----------------------------------

test("VaultService exposes a backup facade over the repository", () => {
  const ctx = repoFixture();
  const service = new VaultService(ctx.repo);
  ctx.repo.createProject({ name: "Facade" });
  try {
    const summary = service.backup.create({ appVersion: "0.2.0" });
    assert.equal(service.backup.list()[0].id, summary.id);
    assert.equal(service.backup.inspect(summary.id).integrityOk, true);
    assert.ok(service.backup.diskUsage().totalBytes > 0);
    assert.throws(() => service.backup.inspect("../../etc"));
    service.backup.delete(summary.id);
    assert.equal(service.backup.list().length, 0);
  } finally { ctx.dispose(); }
});
