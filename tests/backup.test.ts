import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
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
