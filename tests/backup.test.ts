import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { SqliteVaultRepository } from "@orbit/vault-storage";

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
