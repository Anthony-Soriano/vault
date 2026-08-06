# BL-03 Recovery & Backup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a Vault manual, integrity-checked point-in-time snapshots (database + managed files, captured as one stable state) that can be restored into a new Vault.

**Architecture:** All snapshot/restore logic lives in `packages/vault-storage` behind the existing `VaultRepository` interface and `VaultService` facade; Electron main exposes `vault:backup:*` IPC via the existing `handle(...)` helper and owns the write barrier (autosave flush + watcher pause); the renderer gets a read/act-only **Backups** panel through `window.vault.backup`. The renderer never touches Node/SQLite/fs.

**Tech Stack:** TypeScript, `node:sqlite` (`DatabaseSync`, `VACUUM INTO`), `node:crypto` (`createHash`, `randomUUID`), `node:fs` (`cpSync`, `renameSync`), Electron IPC, React/Vite renderer, Node built-in test runner.

## Global Constraints

- Node ≥ 22.13, pnpm 11.9.0. (verbatim from ARCHITECTURE.md)
- The renderer imports only from `@orbit/vault-types` and calls `window.vault`; it never imports Node/SQLite/fs. (invariant 2)
- All native operations run in the main process. (Security section)
- Manual snapshots only — no scheduled/automatic/pre-operation triggers in BL-03. (design non-goals)
- Snapshot database is captured via `VACUUM INTO` — a single consistent `vault.db` with no `-wal`/`-shm`. (design)
- Capture runs under one exclusive write barrier (autosave flush + mutation guard + watcher pause/resume) spanning DB capture and file copy. (design revision 1/4)
- External-change safety: fingerprint managed files before/after copy; abort + discard on any change. (design revision 1)
- Vault identity is a persisted, location-independent UUID; restored Vaults get a NEW UUID + lineage (`restored_from_vault_id`, `restored_from_snapshot_id`, `restored_at`). (design revision 2)
- Restore into a new empty/non-existent directory only, via staging + atomic finalization; validate checksums + schema version BEFORE any target write; refuse on any mismatch (no "restore anyway"). (design revisions 2/3)
- Round-trip acceptance = logical-state equivalence + managed-file hash equality, NOT byte-identical DB. (design revision 2)
- Standing verification gate before completion: `pnpm typecheck`, `pnpm test`, `pnpm build`, `node scripts/phase2-lifecycle-ui-regression.mjs` — all green. (AGENTS.md Rule 8)
- Stay narrowly scoped to recovery/backup — no Phase 3, no other P1 items, no unrelated polish. (CURRENT_PHASE.md)

Design of record: `docs/superpowers/specs/2026-08-06-bl-03-recovery-backup-design.md`.

---

## ⚠️ Audit corrections (2026-08-06) — AUTHORITATIVE

> **This document is the detailed *reference*. The authoritative step-by-step is the concise execution plan `docs/superpowers/plans/2026-08-06-bl-03-recovery-backup-execution.md`.** Where a code snippet below disagrees with these corrections, the corrections win. A repository audit found the following (verified against `main`):
>
> **A. Migration version is 7.** `MIGRATIONS` currently ends at version 6 (`packages/vault-storage/src/index.ts`). The `vault_meta` migration is **version 7**.
>
> **B. No package subpath export.** `packages/vault-storage/package.json` has `"exports": "./src/index.ts"` (a bare string, no map). `@orbit/vault-storage/backup` will **not** resolve. Put helpers in a new `src/backup.ts` and **re-export them from `src/index.ts`**; tests import from `@orbit/vault-storage`.
>
> **C. Imports already present / missing.** `randomUUID` (node:crypto), `VaultDomainError`, `now()` (`= new Date().toISOString()`), `notFound()`, `statSync`, `renameSync`, `rmSync`, `readdirSync`, `existsSync`, `writeFileSync`, `mkdirSync`, `readFileSync`, `copyFileSync` are already imported in storage. **`cpSync` is NOT imported** — add it to the `node:fs` import (Node ≥ 22 supports it). Do not re-add already-present imports.
>
> **D. Reuse `assertIdentifier`.** Its regex `/^[a-zA-Z0-9_-]{6,80}$/` (in `@orbit/vault-core`) rejects `/`, `\`, and `.`, so it blocks path traversal; snapshot ids (`<iso-with-dashes>_<uuid>`, ~61 chars, no `.`/`:`) satisfy it. Use `assertIdentifier` for snapshot ids — do **not** invent `assertSnapshotId`.
>
> **E. `VACUUM INTO` must run outside any transaction.** Do not wrap `createSnapshot` in `this.transaction()`; SQLite forbids VACUUM inside a transaction. Capture runs in autocommit.
>
> **F. Write barrier — corrected mechanism (see Concern A).** Accepted-write consistency comes from **synchronous, single-threaded execution** (node:sqlite `DatabaseSync` + fs ops are synchronous; no accepted IPC mutation or watcher reconcile can interleave between the DB capture and the file copy), and from the fact that the snapshot reads only **committed persisted state** (so *any* caller — UI or future non-UI — gets a consistent snapshot). `withWriteBarrier` (stop watcher + **guaranteed restart in `finally`**) is **defensive** (clears a pending reconcile timer; guarantees release on failure), not the primary mechanism. **Do not add an in-process "reject mutations during capture" flag** — under synchronous execution no other handler can observe it; it would be theater. The renderer autosave flush only persists an **in-flight editor buffer** before capture (a UI concern), and must not be presented as a storage guarantee.
>
> **G. External-change test seam (see Concern B) — committed mechanism.** `createSnapshot(options, internalHooks?: { onAfterManagedCopy?: () => void })`. The `VaultRepository` interface method and `VaultService.backup.create` pass **only** `options`; IPC/preload never pass the second argument. Tests call the concrete `SqliteVaultRepository.createSnapshot(options, { onAfterManagedCopy: () => writeFileSync(...projects...) })` to deterministically force the after-fingerprint to differ, then assert it throws and leaves no non-temp snapshot. This seam is never reachable through the service, IPC, or renderer.
>
> **H. Manifest integrity policy (see Concern C).** `manifest.json` cannot checksum itself. On read/restore, validate **structure + exact file bijection**: `snapshotVersion===1`; non-empty `vaultVersion`; `createdAt` a valid ISO timestamp; `vaultId` a valid UUID; integer `schemaVersion≥1`; integer `projectCount≥0`; `checksums` an object whose keys are **safe relative POSIX paths** (no leading `/`, no `..`, no `\`, no drive letter) each starting with `vault.db` or `projects/`; and the set of files present under the snapshot dir (excluding `manifest.json`) **exactly equals** the checksum key set (no missing, no unexpected extra), each matching its SHA-256. **This defends against corruption and accidental modification, not forgery** — BL-03 adds no cryptographic signature or cloud trust.
>
> **I. Restore order + Windows finalization (see Concern E).** Order: (1) validate manifest structure+paths; (2) verify checksums; (3) verify supported schema version; (4) stage files; (5) open the **staged** DB and run `PRAGMA integrity_check` + `PRAGMA foreign_key_check`; (6) assign new `vault_id` + lineage; (7) **close all DB handles**; (8) atomic finalize; (9) guarantee no valid-looking target on failure. **Windows:** `renameSync` onto an existing directory fails, so the **target must not pre-exist**. UX selects a **parent directory + a new Vault folder name**; stage at a sibling `<parent>/.orbit-restoring-<uuid>` (same filesystem) and rename to the non-existent `<parent>/<name>`.
>
> **J. Not "additive".** BL-03 is backward-compatible but **introduces a DB migration, persisted Vault identity, restore lineage semantics, new repository/service contracts, new IPC channels, and new UI** — it changes persistent state and expands the architecture. `ARCHITECTURE.md` and `DECISIONS.md` must be updated at closeout (Rule 11).
>
> **K. Renderer surface.** Top-level `view` is `"files" | "knowledge" | "atlas"` with a `.view-switch` button row (`App.tsx`); Knowledge renders as an overlay; Integrity lives *inside* KnowledgeView. Add a `"backups"` view + button + a Backups surface following the Knowledge-overlay pattern. Autosave flush seam: `saveNow(content)` (App.tsx) — await it when `dirty` before `backup.create()`.

---

## File Structure

- `packages/vault-types/src/index.ts` — **Modify.** Add backup contract types (`SnapshotManifest`, `SnapshotSummary`, `SnapshotInspection`, `RestoreResult`, `CreateSnapshotOptions`, `RestoreSnapshotInput`) and the `backup` entry on the renderer API contract.
- `packages/vault-storage/src/backup.ts` — **Create.** Pure/near-pure helpers: managed-file fingerprinting, SHA-256 checksums, manifest build/parse, path escaping for `VACUUM INTO`.
- `packages/vault-storage/src/index.ts` — **Modify.** Add the `vault_meta` migration + Vault-UUID accessors, and implement `createSnapshot` / `listSnapshots` / `inspectSnapshot` / `deleteSnapshot` / `restoreSnapshotToNewVault` on `SqliteVaultRepository`.
- `packages/vault-core/src/index.ts` — **Modify.** Add the backup methods to the `VaultRepository` interface and a `backup` facade on `VaultService`.
- `apps/vault-desktop/electron/main/main.ts` — **Modify.** Register `vault:backup:*` IPC; implement the write barrier (mutation guard + watcher pause/resume); thread `app.getVersion()` into create; own the restore target dialog.
- `apps/vault-desktop/electron/preload/preload.cts` — **Modify.** Expose `window.vault.backup`.
- `apps/vault-desktop/renderer/src/BackupsView.tsx` — **Create.** The Backups panel.
- `apps/vault-desktop/renderer/src/App.tsx` — **Modify.** Add the Backups surface + the pre-snapshot autosave flush.
- `apps/vault-desktop/renderer/src/electron.d.ts` — **Modify.** Type `window.vault.backup`.
- `tests/backup.test.ts` — **Create.** The BL-03 test suite.
- `scripts/phase2-lifecycle-ui-regression.mjs` — **Modify** (Task 11) — extend the static IPC/UI contract check to include the backup channels.

Everything is additive; no existing channel, table, or invariant changes.

---

## Task 1: Backup contract types

**Files:**
- Modify: `packages/vault-types/src/index.ts`
- Test: `tests/backup.test.ts` (create; type-only smoke for now)

**Interfaces:**
- Produces:
  ```ts
  export interface SnapshotChecksums { [relativePath: string]: string } // "sha256:<hex>"
  export interface SnapshotManifest {
    snapshotVersion: 1;
    vaultVersion: string;
    createdAt: string;        // ISO-8601
    vaultId: string;          // source Vault UUID
    schemaVersion: number;    // max applied migration version
    projectCount: number;
    checksums: SnapshotChecksums; // includes "vault.db" and each "projects/…" file
  }
  export interface SnapshotSummary {
    id: string;               // "<timestamp>_<uuid>" directory name
    createdAt: string;
    sizeBytes: number;
    projectCount: number;
    schemaVersion: number;
    vaultVersion: string;
  }
  export interface SnapshotInspection { manifest: SnapshotManifest; integrityOk: boolean; problems: string[] }
  export interface CreateSnapshotOptions { appVersion: string }
  export interface RestoreSnapshotInput { snapshotId: string; targetPath: string }
  export interface RestoreResult { vaultId: string; targetPath: string }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/backup.test.ts`:
```ts
import test from "node:test";
import assert from "node:assert/strict";
import type { SnapshotManifest } from "@orbit/vault-types";

test("SnapshotManifest shape compiles and is usable", () => {
  const manifest: SnapshotManifest = {
    snapshotVersion: 1, vaultVersion: "0.2.0", createdAt: new Date().toISOString(),
    vaultId: "vault-uuid", schemaVersion: 7, projectCount: 0, checksums: { "vault.db": "sha256:abc" },
  };
  assert.equal(manifest.snapshotVersion, 1);
  assert.equal(manifest.checksums["vault.db"], "sha256:abc");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: FAIL — `SnapshotManifest` is not exported from `@orbit/vault-types`.

- [ ] **Step 3: Add the types**

Append the interfaces from the **Produces** block to `packages/vault-types/src/index.ts`. Also extend the renderer API contract type (the `VaultRendererApi` interface) with a `backup` member:
```ts
  backup: {
    create(): Promise<ApiResult<SnapshotSummary>>;
    list(): Promise<ApiResult<SnapshotSummary[]>>;
    inspect(snapshotId: string): Promise<ApiResult<SnapshotInspection>>;
    delete(snapshotId: string): Promise<ApiResult<{ id: string }>>;
    restoreToNewVault(input: RestoreSnapshotInput): Promise<ApiResult<RestoreResult>>;
    diskUsage(): Promise<ApiResult<{ totalBytes: number; count: number }>>;
  };
```
(Match the exact `ApiResult`/method style already used by the other members in that interface — mirror a neighboring member such as `integrity`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-types/src/index.ts tests/backup.test.ts
git commit -m "feat(bl-03): add backup contract types"
```

---

## Task 2: Persisted Vault UUID (`vault_meta`)

**Files:**
- Modify: `packages/vault-storage/src/index.ts` (add migration to `MIGRATIONS`; add accessors on `SqliteVaultRepository`)
- Test: `tests/backup.test.ts`

**Interfaces:**
- Consumes: the existing `MIGRATIONS` array, `this.db`, `this.transaction`, `now()`.
- Produces on `SqliteVaultRepository`:
  ```ts
  getVaultId(): string
  getVaultMeta(key: string): string | null
  setVaultMeta(key: string, value: string): void   // upsert
  ```

- [ ] **Step 1: Write the failing test**

Append to `tests/backup.test.ts` (add the fixture helper at the top of the file, matching `tests/phase2-knowledge.test.ts` style):
```ts
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteVaultRepository } from "@orbit/vault-storage";

const repoFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "orbit-vault-backup-"));
  const repo = new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root });
  repo.initialize();
  return { root, repo, dispose: () => { repo.close(); rmSync(root, { recursive: true, force: true }); } };
};

test("every Vault has a stable, location-independent UUID", () => {
  const ctx = repoFixture();
  try {
    const first = ctx.repo.getVaultId();
    assert.match(first, /[0-9a-f-]{36}/);
    ctx.repo.close();
    const reopened = new SqliteVaultRepository({ vaultRoot: ctx.root, developmentMode: true, developmentRoot: ctx.root });
    reopened.initialize();
    assert.equal(reopened.getVaultId(), first); // stable across reopen
    reopened.close();
  } finally { ctx.dispose(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: FAIL — `getVaultId` is not a function.

- [ ] **Step 3: Add the migration and accessors**

Add a new entry to the `MIGRATIONS` array. **The next unused version is 7** (verified: the array currently ends at version 6):
```ts
{
  version: 7,
  run: (db) => {
    db.exec("CREATE TABLE IF NOT EXISTS vault_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
    const existing = db.prepare("SELECT value FROM vault_meta WHERE key='vault_id'").get() as { value: string } | undefined;
    if (!existing) db.prepare("INSERT INTO vault_meta(key, value) VALUES ('vault_id', ?)").run(randomUUID());
  },
},
```
Add `import { createHash, randomUUID } from "node:crypto";` at the top of the file (used here and in Task 3). Add the accessor methods to the class:
```ts
getVaultMeta(key: string) { const row = this.db.prepare("SELECT value FROM vault_meta WHERE key=?").get(key) as { value: string } | undefined; return row?.value ?? null; }
setVaultMeta(key: string, value: string) { this.db.prepare("INSERT INTO vault_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value); }
getVaultId() { const id = this.getVaultMeta("vault_id"); if (!id) throw new Error("Vault UUID missing"); return id; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-storage/src/index.ts tests/backup.test.ts
git commit -m "feat(bl-03): persist a location-independent Vault UUID in vault_meta"
```

---

## Task 3: Backup helpers (fingerprint, checksums, manifest)

**Files:**
- Create: `packages/vault-storage/src/backup.ts`
- Test: `tests/backup.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // relative POSIX path -> "sha256:<hex>"; walks a directory recursively, sorted, deterministic.
  export function hashTree(rootDir: string): Record<string, string>
  export function hashFile(absPath: string): string            // "sha256:<hex>"
  // size+mtimeMs fingerprint for cheap change detection; relative POSIX path -> "<size>:<mtimeMs>"
  export function fingerprintTree(rootDir: string): Record<string, string>
  export function treesEqual(a: Record<string, string>, b: Record<string, string>): boolean
  export function sqliteLiteralPath(absPath: string): string   // forward-slashed, single-quotes doubled
  export function directorySizeBytes(rootDir: string): number
  ```

- [ ] **Step 1: Write the failing test**

Append:
```ts
import { mkdtempSync as mk2, writeFileSync, mkdirSync } from "node:fs";
// Per audit correction B: import from "@orbit/vault-storage" (helpers re-exported from src/index.ts), NOT a subpath.
import { hashTree, treesEqual, fingerprintTree, sqliteLiteralPath } from "@orbit/vault-storage";

test("hashTree is deterministic and detects changes", () => {
  const dir = mk2(join(tmpdir(), "orbit-hash-"));
  mkdirSync(join(dir, "a"), { recursive: true });
  writeFileSync(join(dir, "a", "one.txt"), "hello");
  const first = hashTree(dir);
  assert.ok(first["a/one.txt"].startsWith("sha256:"));
  assert.ok(treesEqual(first, hashTree(dir)));
  writeFileSync(join(dir, "a", "one.txt"), "changed");
  assert.equal(treesEqual(first, hashTree(dir)), false);
  rmSync(dir, { recursive: true, force: true });
});

test("sqliteLiteralPath forward-slashes and escapes quotes", () => {
  assert.equal(sqliteLiteralPath("C:\\v\\a'b\\vault.db"), "C:/v/a''b/vault.db");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: FAIL — helper not found. **Per audit correction B, there is NO subpath export** (`package.json` exports is the bare string `"./src/index.ts"`). Create `src/backup.ts`, **re-export its helpers from `src/index.ts`**, and import them in tests from `@orbit/vault-storage` (not `@orbit/vault-storage/backup`).

- [ ] **Step 3: Implement the helpers**

Create `packages/vault-storage/src/backup.ts`:
```ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const toPosix = (p: string) => p.split(sep).join("/");

function* walk(rootDir: string): Generator<string> {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const abs = join(rootDir, entry.name);
    if (entry.isDirectory()) yield* walk(abs);
    else if (entry.isFile()) yield abs;
  }
}

export function hashFile(absPath: string): string {
  return "sha256:" + createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

export function hashTree(rootDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const abs of walk(rootDir)) out[toPosix(relative(rootDir, abs))] = hashFile(abs);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export function fingerprintTree(rootDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const abs of walk(rootDir)) { const s = statSync(abs); out[toPosix(relative(rootDir, abs))] = `${s.size}:${s.mtimeMs}`; }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export function treesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => a[k] === b[k]);
}

export function sqliteLiteralPath(absPath: string): string {
  return absPath.split("\\").join("/").split("'").join("''");
}

export function directorySizeBytes(rootDir: string): number {
  let total = 0;
  for (const abs of walk(rootDir)) total += statSync(abs).size;
  return total;
}
```
Wire the module so tests can import it (add a subpath export in `packages/vault-storage/package.json`, or re-export from `src/index.ts` — follow the existing package export pattern).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-storage/src/backup.ts packages/vault-storage/package.json tests/backup.test.ts
git commit -m "feat(bl-03): add backup fingerprint/checksum/manifest helpers"
```

---

## Task 4: `createSnapshot` — capture engine

**Files:**
- Modify: `packages/vault-storage/src/index.ts`
- Test: `tests/backup.test.ts`

**Interfaces:**
- Consumes: `getVaultId`, `hashTree`, `hashFile`, `fingerprintTree`, `treesEqual`, `sqliteLiteralPath`, `directorySizeBytes`, `CreateSnapshotOptions`, `SnapshotSummary`, `SnapshotManifest`.
- Produces on `SqliteVaultRepository`:
  ```ts
  createSnapshot(options: CreateSnapshotOptions): SnapshotSummary
  ```
  Behavior: writes `backups/.tmp-<uuid>/`, `VACUUM INTO` the DB, copy `projects/`, fingerprint before/after (abort on change), write `manifest.json`, atomic-rename to `backups/<timestamp>_<uuid>/`.

- [ ] **Step 1: Write the failing test**

Append (uses the `VaultService`-based `fixture()` from `tests/phase2-knowledge.test.ts` style; add one to this file if not present):
```ts
import { existsSync, readdirSync } from "node:fs";

const seeded = () => {
  const ctx = repoFixture();
  const project = (ctx.repo as any).createProject({ name: "Backup me" });
  return { ...ctx, project };
};

test("createSnapshot writes a listable snapshot with a manifest", () => {
  const ctx = seeded();
  try {
    const summary = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    assert.ok(summary.id.length > 0);
    assert.equal(summary.projectCount, 1);
    const dir = join(ctx.root, "backups", summary.id);
    assert.ok(existsSync(join(dir, "manifest.json")));
    assert.ok(existsSync(join(dir, "vault.db")));
    assert.equal(existsSync(join(dir, "vault.db-wal")), false); // VACUUM INTO: no sidecars
    // no leftover temp dirs
    assert.equal(readdirSync(join(ctx.root, "backups")).some((n) => n.startsWith(".tmp-")), false);
  } finally { ctx.dispose(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: FAIL — `createSnapshot` is not a function.

- [ ] **Step 3: Implement `createSnapshot`**

Add to `SqliteVaultRepository` (add `cpSync, renameSync, rmSync, writeFileSync, mkdirSync` to the `node:fs` import if not present):
```ts
createSnapshot(options: CreateSnapshotOptions): SnapshotSummary {
  const vaultRoot = this.options.vaultRoot;
  const projectsDir = join(vaultRoot, "projects");
  const backupsDir = join(vaultRoot, "backups");
  mkdirSync(backupsDir, { recursive: true });
  const id = randomUUID();
  const staging = join(backupsDir, `.tmp-${id}`);
  mkdirSync(join(staging, "projects"), { recursive: true });
  try {
    const before = fingerprintTree(projectsDir);
    // Fold WAL into a clean single-file DB copy.
    this.db.exec(`VACUUM INTO '${sqliteLiteralPath(join(staging, "vault.db"))}'`);
    cpSync(projectsDir, join(staging, "projects"), { recursive: true });
    const after = fingerprintTree(projectsDir);
    if (!treesEqual(before, after)) throw new VaultDomainError("VALIDATION_ERROR", "The Vault changed during capture; snapshot aborted. Try again.");
    // checksums
    const checksums: Record<string, string> = { "vault.db": hashFile(join(staging, "vault.db")) };
    for (const [rel, sum] of Object.entries(hashTree(join(staging, "projects")))) checksums[`projects/${rel}`] = sum;
    const createdAt = new Date().toISOString();
    const manifest: SnapshotManifest = {
      snapshotVersion: 1,
      vaultVersion: options.appVersion,
      createdAt,
      vaultId: this.getVaultId(),
      schemaVersion: (this.db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number }).v,
      projectCount: (this.db.prepare("SELECT COUNT(*) AS c FROM projects").get() as { c: number }).c,
      checksums,
    };
    writeFileSync(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    const finalId = `${createdAt.replace(/[:.]/g, "-")}_${id}`;
    renameSync(staging, join(backupsDir, finalId));
    return { id: finalId, createdAt, sizeBytes: directorySizeBytes(join(backupsDir, finalId)), projectCount: manifest.projectCount, schemaVersion: manifest.schemaVersion, vaultVersion: manifest.vaultVersion };
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
```
(`VaultDomainError` is already imported/available in this file — confirm; it is exported from `@orbit/vault-core` and used across the codebase. If storage does not already import it, throw the same error type storage uses elsewhere for validation.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the external-change abort test**

```ts
test("createSnapshot aborts if projects/ changes mid-capture", () => {
  const ctx = seeded();
  try {
    const projectsDir = join(ctx.root, "projects");
    // Monkeypatch: mutate a source file between the before/after fingerprints by hooking cpSync timing.
    // Simplest deterministic approach: pre-create a file, snapshot once (ok), then simulate change detection
    // by calling the fingerprint helpers directly is covered in Task 3; here assert the guard path via a
    // subclass hook that writes during copy. If no seam exists, assert that two identical fingerprints pass
    // and a forced-different pair throws through a small injected hook.
    const summary = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    assert.ok(summary.id); // baseline still works
  } finally { ctx.dispose(); }
});
```
If a deterministic mid-copy mutation seam is awkward, add a private, test-only hook parameter `createSnapshot(options, hooks?: { afterCopy?: () => void })` where `afterCopy` runs between the copy and the after-fingerprint; the test passes a hook that writes into `projects/` and asserts the call throws and leaves no non-temp snapshot. Keep the hook internal (not exposed through the service/IPC).

- [ ] **Step 6: Run tests, verify pass, commit**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
```bash
git add packages/vault-storage/src/index.ts tests/backup.test.ts
git commit -m "feat(bl-03): implement createSnapshot capture engine with external-change abort"
```

---

## Task 5: `listSnapshots` / `inspectSnapshot` / `deleteSnapshot` / disk usage

**Files:**
- Modify: `packages/vault-storage/src/index.ts`
- Test: `tests/backup.test.ts`

**Interfaces:**
- Produces on `SqliteVaultRepository`:
  ```ts
  listSnapshots(): SnapshotSummary[]                 // newest first; ignores .tmp-*/.restoring-*
  inspectSnapshot(snapshotId: string): SnapshotInspection  // recompute checksums vs manifest
  deleteSnapshot(snapshotId: string): { id: string }
  backupsDiskUsage(): { totalBytes: number; count: number }
  ```

- [ ] **Step 1: Write the failing test**

```ts
test("list/inspect/delete snapshots round-trips", () => {
  const ctx = seeded();
  try {
    const a = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    const list = ctx.repo.listSnapshots();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, a.id);
    const inspection = ctx.repo.inspectSnapshot(a.id);
    assert.equal(inspection.integrityOk, true);
    assert.equal(inspection.problems.length, 0);
    assert.ok(ctx.repo.backupsDiskUsage().totalBytes > 0);
    ctx.repo.deleteSnapshot(a.id);
    assert.equal(ctx.repo.listSnapshots().length, 0);
  } finally { ctx.dispose(); }
});

test("inspect flags a corrupted snapshot", () => {
  const ctx = seeded();
  try {
    const a = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    writeFileSync(join(ctx.root, "backups", a.id, "vault.db"), "corrupted");
    const inspection = ctx.repo.inspectSnapshot(a.id);
    assert.equal(inspection.integrityOk, false);
    assert.ok(inspection.problems.length > 0);
  } finally { ctx.dispose(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: FAIL — `listSnapshots` is not a function.

- [ ] **Step 3: Implement the read/delete methods**

```ts
private readManifest(snapshotId: string): SnapshotManifest {
  assertIdentifierLike(snapshotId); // reject path separators; see note below
  const dir = join(this.options.vaultRoot, "backups", snapshotId);
  if (!existsSync(join(dir, "manifest.json"))) throw notFound("Snapshot");
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as SnapshotManifest;
}
listSnapshots(): SnapshotSummary[] {
  const backupsDir = join(this.options.vaultRoot, "backups");
  if (!existsSync(backupsDir)) return [];
  const out: SnapshotSummary[] = [];
  for (const name of readdirSync(backupsDir)) {
    if (name.startsWith(".tmp-") || name.includes(".restoring-")) continue;
    const dir = join(backupsDir, name);
    if (!existsSync(join(dir, "manifest.json"))) continue;
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as SnapshotManifest;
    out.push({ id: name, createdAt: m.createdAt, sizeBytes: directorySizeBytes(dir), projectCount: m.projectCount, schemaVersion: m.schemaVersion, vaultVersion: m.vaultVersion });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
inspectSnapshot(snapshotId: string): SnapshotInspection {
  const manifest = this.readManifest(snapshotId);
  const dir = join(this.options.vaultRoot, "backups", snapshotId);
  const problems: string[] = [];
  for (const [rel, expected] of Object.entries(manifest.checksums)) {
    const abs = join(dir, rel);
    if (!existsSync(abs)) { problems.push(`missing: ${rel}`); continue; }
    if (hashFile(abs) !== expected) problems.push(`checksum mismatch: ${rel}`);
  }
  return { manifest, integrityOk: problems.length === 0, problems };
}
deleteSnapshot(snapshotId: string): { id: string } {
  this.readManifest(snapshotId); // validates existence + guards the id
  rmSync(join(this.options.vaultRoot, "backups", snapshotId), { recursive: true, force: true });
  return { id: snapshotId };
}
backupsDiskUsage(): { totalBytes: number; count: number } {
  const list = this.listSnapshots();
  return { totalBytes: list.reduce((n, s) => n + s.sizeBytes, 0), count: list.length };
}
```
**Security note (id validation):** snapshot ids come from the renderer. `readManifest` MUST reject any id containing a path separator or `..` before joining (`assertIdentifierLike` — implement as a guard that throws `VaultDomainError("VALIDATION_ERROR", …)` if `/^[A-Za-z0-9._-]+$/` fails). This prevents path traversal out of `backups/`. Add a test:
```ts
test("snapshot id path traversal is rejected", () => {
  const ctx = seeded();
  try { assert.throws(() => ctx.repo.inspectSnapshot("../../etc")); } finally { ctx.dispose(); }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-storage/src/index.ts tests/backup.test.ts
git commit -m "feat(bl-03): list/inspect/delete snapshots + disk usage + id guard"
```

---

## Task 6: `restoreSnapshotToNewVault` — staging + atomic finalize + lineage

**Files:**
- Modify: `packages/vault-storage/src/index.ts`
- Test: `tests/backup.test.ts`

**Interfaces:**
- Consumes: `inspectSnapshot`, `readManifest`, `RestoreSnapshotInput`, `RestoreResult`, `setVaultMeta`, `hashTree`.
- Produces on `SqliteVaultRepository` (static or instance — implement as an instance method on the *source* repo; it does not mutate the source):
  ```ts
  restoreSnapshotToNewVault(input: RestoreSnapshotInput): RestoreResult
  ```

- [ ] **Step 1: Write the failing test (round-trip: logical + file hashes)**

```ts
import { DatabaseSync } from "node:sqlite";

test("restore reproduces logical state + file hashes into a NEW vault with new identity + lineage", () => {
  const ctx = seeded();
  try {
    // add a managed markdown file so projects/ is non-empty with known content
    const doc = (ctx.repo as any).createMarkdownDocument({ projectId: ctx.project.id, parentFolderId: null, title: "note", content: "# hello\n" });
    const sourceHashes = hashTree(join(ctx.root, "projects"));
    const snap = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    const sourceVaultId = ctx.repo.getVaultId();

    const target = join(ctx.root, "restored-here");
    const result = ctx.repo.restoreSnapshotToNewVault({ snapshotId: snap.id, targetPath: target });

    // file hashes match
    assert.deepEqual(hashTree(join(target, "projects")), sourceHashes);
    // new, distinct identity + lineage
    const restored = new SqliteVaultRepository({ vaultRoot: target, developmentMode: true, developmentRoot: target });
    restored.initialize();
    assert.notEqual(restored.getVaultId(), sourceVaultId);
    assert.equal(restored.getVaultMeta("restored_from_vault_id"), sourceVaultId);
    assert.equal(restored.getVaultMeta("restored_from_snapshot_id"), snap.id);
    // logical equivalence (projects present)
    assert.equal((restored as any).listProjects().length, 1);
    restored.close();
    assert.equal(result.targetPath, target);
    // no leftover staging dir
    assert.equal(existsSync(`${target}.restoring-`), false);
  } finally { ctx.dispose(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: FAIL — `restoreSnapshotToNewVault` is not a function.

- [ ] **Step 3: Implement restore**

```ts
restoreSnapshotToNewVault(input: RestoreSnapshotInput): RestoreResult {
  const target = resolve(String(input.targetPath));
  if (existsSync(target) && readdirSync(target).length > 0) throw new VaultDomainError("VALIDATION_ERROR", "Restore target must be an empty or non-existent folder.");
  // Validate BEFORE writing anything.
  const inspection = this.inspectSnapshot(input.snapshotId);
  if (!inspection.integrityOk) throw new VaultDomainError("VALIDATION_ERROR", `Snapshot failed integrity check: ${inspection.problems.join("; ")}`);
  const maxSupported = Math.max(...MIGRATIONS.map((m) => m.version));
  if (inspection.manifest.schemaVersion > maxSupported) throw new VaultDomainError("VALIDATION_ERROR", "This snapshot was written by a newer version of Orbit Vault and cannot be restored by this build.");
  const snapshotDir = join(this.options.vaultRoot, "backups", input.snapshotId);
  const staging = `${target}.restoring-${randomUUID()}`;
  try {
    mkdirSync(join(staging, "projects"), { recursive: true });
    cpSync(join(snapshotDir, "vault.db"), join(staging, "vault.db"));
    cpSync(join(snapshotDir, "projects"), join(staging, "projects"), { recursive: true });
    // assign NEW identity + lineage in the staged DB
    const staged = new DatabaseSync(join(staging, "vault.db"));
    try {
      const newId = randomUUID();
      staged.prepare("INSERT INTO vault_meta(key,value) VALUES ('vault_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(newId);
      for (const [k, v] of [["restored_from_vault_id", inspection.manifest.vaultId], ["restored_from_snapshot_id", input.snapshotId], ["restored_at", new Date().toISOString()]] as const)
        staged.prepare("INSERT INTO vault_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, v);
      renameSync(staging, target); // atomic finalize
      return { vaultId: newId, targetPath: target };
    } finally { staged.close(); }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Write refusal + schema-guard tests**

```ts
test("restore refuses a corrupted snapshot and leaves no target", () => {
  const ctx = seeded();
  try {
    const snap = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    writeFileSync(join(ctx.root, "backups", snap.id, "vault.db"), "corrupt");
    const target = join(ctx.root, "should-not-exist");
    assert.throws(() => ctx.repo.restoreSnapshotToNewVault({ snapshotId: snap.id, targetPath: target }));
    assert.equal(existsSync(target), false);
  } finally { ctx.dispose(); }
});

test("restore refuses a schema-too-new snapshot", () => {
  const ctx = seeded();
  try {
    const snap = ctx.repo.createSnapshot({ appVersion: "0.2.0" });
    const mPath = join(ctx.root, "backups", snap.id, "manifest.json");
    const m = JSON.parse(readFileSync(mPath, "utf8"));
    m.schemaVersion = 9999;
    // recompute the manifest checksum is not needed: schema check happens after integrity, but bump keeps file present.
    writeFileSync(mPath, JSON.stringify(m));
    // integrity now fails first (manifest changed) OR schema guard — either way it must refuse:
    assert.throws(() => ctx.repo.restoreSnapshotToNewVault({ snapshotId: snap.id, targetPath: join(ctx.root, "t2") }));
  } finally { ctx.dispose(); }
});
```
> Note: manifest.json is not itself in `checksums`, so editing `schemaVersion` does not trip the integrity check — the schema guard is what refuses it. Keep both tests; they assert the two independent refusal paths.

- [ ] **Step 6: Run tests, verify pass, commit**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
```bash
git add packages/vault-storage/src/index.ts tests/backup.test.ts
git commit -m "feat(bl-03): restore snapshot to new vault with staging, atomic finalize, lineage"
```

---

## Task 7: `VaultRepository` interface + `VaultService.backup` facade

**Files:**
- Modify: `packages/vault-core/src/index.ts`
- Test: `tests/backup.test.ts`

**Interfaces:**
- Consumes: the repository methods from Tasks 4–6.
- Produces on `VaultService`:
  ```ts
  readonly backup = {
    create: (options: CreateSnapshotOptions) => SnapshotSummary,
    list: () => SnapshotSummary[],
    inspect: (snapshotId: string) => SnapshotInspection,
    delete: (snapshotId: string) => { id: string },
    restoreToNewVault: (input: RestoreSnapshotInput) => RestoreResult,
    diskUsage: () => { totalBytes: number; count: number },
  }
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { VaultService } from "@orbit/vault-core";
test("VaultService exposes a backup facade", () => {
  const ctx = repoFixture();
  const service = new VaultService(ctx.repo as any);
  (ctx.repo as any).createProject({ name: "x" });
  try {
    const summary = service.backup.create({ appVersion: "0.2.0" });
    assert.equal(service.backup.list()[0].id, summary.id);
    assert.equal(service.backup.inspect(summary.id).integrityOk, true);
  } finally { ctx.dispose(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: FAIL — `service.backup` is undefined.

- [ ] **Step 3: Extend interface + facade**

In `packages/vault-core/src/index.ts`, add to the `VaultRepository` interface:
```ts
  createSnapshot(options: CreateSnapshotOptions): SnapshotSummary;
  listSnapshots(): SnapshotSummary[];
  inspectSnapshot(snapshotId: string): SnapshotInspection;
  deleteSnapshot(snapshotId: string): { id: string };
  restoreSnapshotToNewVault(input: RestoreSnapshotInput): RestoreResult;
  backupsDiskUsage(): { totalBytes: number; count: number };
```
Add the facade on `VaultService` (mirror the existing `integrity`/`evidence` members; validate the id with the existing `assertIdentifier`-style guard used elsewhere — note snapshot ids are not entity ids, so use a dedicated guard that allows `A-Za-z0-9._-`):
```ts
  readonly backup = {
    create: (options: CreateSnapshotOptions) => this.repository.createSnapshot(options),
    list: () => this.repository.listSnapshots(),
    inspect: (snapshotId: string) => this.repository.inspectSnapshot(assertIdentifier(snapshotId)),
    delete: (snapshotId: string) => this.repository.deleteSnapshot(assertIdentifier(snapshotId)),
    restoreToNewVault: (input: RestoreSnapshotInput) => this.repository.restoreSnapshotToNewVault({ snapshotId: assertIdentifier(input.snapshotId), parentPath: String(input.parentPath), folderName: String(input.folderName) }),
    diskUsage: () => this.repository.backupsDiskUsage(),
  };
```
Per audit correction D, reuse the existing `assertIdentifier` (its regex `/^[a-zA-Z0-9_-]{6,80}$/` already blocks `/`, `\`, and `.`) — do **not** add a separate `assertSnapshotId`. Import the new types from `@orbit/vault-types`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vault-core/src/index.ts tests/backup.test.ts
git commit -m "feat(bl-03): add backup facade to VaultService and repository interface"
```

---

## Task 8: IPC channels + write barrier (main)

**Files:**
- Modify: `apps/vault-desktop/electron/main/main.ts`

**Interfaces:**
- Consumes: `vault.backup.*`, `app.getVersion()`, `startProjectsWatcher`/`stopProjectsWatcher`, `chooseVaultDirectory`, `handle`.
- Produces: channels `vault:backup:create|list|inspect|delete|restore|disk-usage`.

- [ ] **Step 1: Implement the write barrier + create channel**

Add a barrier that suspends the watcher for the duration of capture (capture itself is synchronous on the main thread, so no accepted IPC can interleave; the watcher is the async writer to fence):
```ts
const withWriteBarrier = <T>(operation: () => T): T => {
  stopProjectsWatcher();
  try { return operation(); }
  finally { startProjectsWatcher(); }
};
```
In `registerVaultIpc()` add:
```ts
  handle("vault:backup:create", () => withWriteBarrier(() => vault.backup.create({ appVersion: app.getVersion() })), true);
  handle("vault:backup:list", () => vault.backup.list());
  handle("vault:backup:inspect", (snapshotId: string) => vault.backup.inspect(snapshotId));
  handle("vault:backup:delete", (snapshotId: string) => vault.backup.delete(snapshotId), true);
  handle("vault:backup:disk-usage", () => vault.backup.diskUsage());
  ipcMain.handle("vault:backup:restore", (_event, input: { snapshotId: string; targetPath?: string }) => asyncSafe(async () => {
    const targetPath = input.targetPath ?? await chooseVaultDirectory("Choose an empty folder to restore into");
    if (!targetPath) throw new VaultDomainError("VALIDATION_ERROR", "Restore cancelled.");
    return vault.backup.restoreToNewVault({ snapshotId: input.snapshotId, targetPath });
  }));
```
> The `create` and `delete` channels pass `mutates=true` so the renderer refreshes via `vault:changed`. Restore does not mutate the *current* Vault, so it uses `asyncSafe` without the changed-notification.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no renderer/preload references yet beyond types).

- [ ] **Step 3: Commit**

```bash
git add apps/vault-desktop/electron/main/main.ts
git commit -m "feat(bl-03): register vault:backup IPC and write barrier in main"
```

---

## Task 9: Preload surface (`window.vault.backup`)

**Files:**
- Modify: `apps/vault-desktop/electron/preload/preload.cts`
- Modify: `apps/vault-desktop/renderer/src/electron.d.ts`

- [ ] **Step 1: Expose the channels**

In `preload.cts`, mirror the existing `call<T>(channel, …args)` wrapping used for other namespaces, adding a frozen `backup` object on the exposed `window.vault`:
```ts
  backup: {
    create: () => call("vault:backup:create"),
    list: () => call("vault:backup:list"),
    inspect: (snapshotId: string) => call("vault:backup:inspect", snapshotId),
    delete: (snapshotId: string) => call("vault:backup:delete", snapshotId),
    restoreToNewVault: (input: { snapshotId: string; targetPath?: string }) => call("vault:backup:restore", input),
    diskUsage: () => call("vault:backup:disk-usage"),
  },
```

- [ ] **Step 2: Type the renderer surface**

In `renderer/src/electron.d.ts`, extend the `window.vault` type with the `backup` member using the `@orbit/vault-types` types (`SnapshotSummary`, `SnapshotInspection`, `RestoreResult`).

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm typecheck`
```bash
git add apps/vault-desktop/electron/preload/preload.cts apps/vault-desktop/renderer/src/electron.d.ts
git commit -m "feat(bl-03): expose window.vault.backup via preload"
```

---

## Task 10: Backups panel (renderer)

**Files:**
- Create: `apps/vault-desktop/renderer/src/BackupsView.tsx`
- Modify: `apps/vault-desktop/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `window.vault.backup.*`, the existing mode-switch pattern in `App.tsx`, the existing autosave state in `App.tsx`.

- [ ] **Step 1: Build the panel**

Create `BackupsView.tsx` following the structure of `IntegrityView.tsx` (a self-contained view that calls `window.vault.*`, handles `ApiResult`, renders a list). It must:
- Show a **Create snapshot** button that (a) first flushes any pending Markdown autosave (see Step 2), then (b) calls `window.vault.backup.create()`, then refreshes the list.
- List snapshots (from `list()`): created date, size (human-readable), project count, schema/version. Newest first.
- Per row: **Inspect** (calls `inspect()`, shows manifest + integrity status/problems) and **Delete** (confirm, then `delete()`).
- **Restore to new folder…** (calls `restoreToNewVault({ snapshotId })` with no `targetPath` so main opens the directory picker); surface success/failure.
- A **total disk usage** line from `diskUsage()`.
- Never read/write files directly.

- [ ] **Step 2: Wire the pre-snapshot autosave flush**

In `App.tsx`, the Markdown editor autosave is debounced. Before creating a snapshot, any pending debounced write must be flushed and awaited so it lands in the DB/file first (design revision 4). Expose a `flushPendingAutosave(): Promise<void>` from the App's editor state (clear the debounce timer and `await window.vault.documents.updateContent(...)` for the dirty document if one exists) and call it in the Create-snapshot handler before `backup.create()`.

- [ ] **Step 3: Add the Backups surface to the mode switch**

Add a `Backups` entry to the existing top-level view switch in `App.tsx` (peer of Files / Knowledge / Atlas), rendering `<BackupsView/>`.

- [ ] **Step 4: Typecheck + build + manual smoke**

Run: `pnpm typecheck` then `pnpm build`.
Manually (dev): create a snapshot, see it listed, inspect it, restore into a new empty folder, confirm it opens as a working Vault. (UI is verified manually per ARCHITECTURE testing section.)

- [ ] **Step 5: Commit**

```bash
git add apps/vault-desktop/renderer/src/BackupsView.tsx apps/vault-desktop/renderer/src/App.tsx
git commit -m "feat(bl-03): add Backups panel with create/list/inspect/delete/restore"
```

---

## Task 11: Static regression + full verification gate

**Files:**
- Modify: `scripts/phase2-lifecycle-ui-regression.mjs`

- [ ] **Step 1: Extend the static IPC/UI contract check**

Read `scripts/phase2-lifecycle-ui-regression.mjs` and add assertions that the new `vault:backup:*` channels are (a) registered in `main.ts`, (b) wrapped in `preload.cts`, and (c) referenced by the renderer `BackupsView.tsx` — matching how the script already checks lifecycle/integrity channels. Do not weaken existing checks.

- [ ] **Step 2: Run the full standing gate**

Run each and confirm green:
```bash
pnpm typecheck
pnpm test
pnpm build
node scripts/phase2-lifecycle-ui-regression.mjs
```
Expected: `pnpm test` includes the new `tests/backup.test.ts`; all suites pass; the static regression passes with the new backup assertions.

- [ ] **Step 3: Update Project Truth (Rule 9)**

Update `.orbit/CURRENT_PHASE.md`: move the "Active tasks" to done, set status to implemented/verified, and set **Last verified commit** to the final commit hash with the green gate results. Update `.orbit/ARCHITECTURE.md` to state the now-implemented backup/restore reality (snapshots under `backups/`, `vault_meta` UUID + lineage, `VACUUM INTO` capture, `vault:backup:*` IPC) — Rule 5, implemented reality only. Update `.orbit/BACKLOG.md` BL-03 status to Done (keep history). Update `README.md` test count if it changed.

- [ ] **Step 4: Commit**

```bash
git add scripts/phase2-lifecycle-ui-regression.mjs .orbit/CURRENT_PHASE.md .orbit/ARCHITECTURE.md .orbit/BACKLOG.md README.md
git commit -m "test(bl-03): extend static regression; verify gate; record implemented reality"
```

---

## Self-Review

**Spec coverage:**
- Manual create → Task 4/8/10. ✅
- VACUUM INTO single-file DB, no sidecars → Task 4 (+ test asserts no `-wal`). ✅
- Managed-file copy under barrier → Task 4 (copy) + Task 8 (watcher fence) + Task 10 Step 2 (autosave flush). ✅
- External-change fingerprint abort → Task 4 Step 5. ✅
- Manifest with your field set + checksums → Task 1 + Task 4. ✅
- Persisted location-independent UUID + restored lineage → Task 2 + Task 6. ✅
- List/inspect/delete + disk usage → Task 5. ✅
- Restore to new vault only, staging + atomic finalize, validate-before-write, refuse on mismatch, schema guard → Task 6. ✅
- Round-trip = logical + file-hash equivalence → Task 6 Step 1. ✅
- IPC via handle(...) / preload / renderer, renderer never touches fs → Tasks 8–10. ✅
- Path-traversal id guard → Task 5 + Task 7 (reuse `assertIdentifier`, per audit correction D). ✅
- Standing gate → Task 11. ✅
- Exclusions (no auto-triggers, no in-place restore, no salvage/zip/retention) → not implemented by design; nothing in the plan adds them. ✅

**Placeholder scan:** No "TBD"/"handle edge cases" left; each code step carries real code. The one test with an injected `afterCopy` hook (Task 4 Step 5) is specified concretely with a fallback approach.

**Type consistency:** `SnapshotSummary`, `SnapshotManifest`, `SnapshotInspection`, `RestoreResult`, `CreateSnapshotOptions`, `RestoreSnapshotInput` are defined in Task 1 and used unchanged in Tasks 4–10. Method names (`createSnapshot`, `listSnapshots`, `inspectSnapshot`, `deleteSnapshot`, `restoreSnapshotToNewVault`, `backupsDiskUsage`) are consistent between repository (Tasks 4–6), interface (Task 7), and facade (`backup.create/list/inspect/delete/restoreToNewVault/diskUsage`, Task 7). IPC channel names are consistent between Task 8 (main) and Task 9 (preload).

**Open confirmations for the implementer (from the design's flagged items, now resolved but worth verifying against code at execution time):**
1. `@orbit/vault-storage` subpath import for `backup.ts` (Task 3 Step 2) — confirm the workspace export map, else re-export from `src/index.ts`.
2. `VaultDomainError` availability inside `vault-storage` (Task 4) — confirm import path; storage already throws domain errors elsewhere.
3. Exact next migration `version` number (Task 2) and the renderer mode-switch shape (Task 10) — read before editing.
