# Orbit Vault — Backlog

Deferred work, tracked so phases can be formally closed without losing scope. Created 2026-08-06 from the Phase 1.2 / 1.3 reconciliation audit. Items are **not** on any active milestone; pull them into a phase when prioritized.

> An item in this file is not approved implementation scope. It may move into active work only with explicit owner approval and an entry in `.orbit/CURRENT_PHASE.md`.

Priority key: **P1** (should do before broad release) · **P2** (valuable, not blocking) · **P3** (nice to have).

## From Phase 1.2 (file lifecycle)

### BL-01 — In-app drag & drop file import · P2
Import currently works only through the file-picker dialog (`App.tsx:69` → `window.orbit.desktop.openFiles()`); there is no `onDrop`/`dataTransfer` handler in the renderer. Add drag-and-drop of files onto the Files view that routes into the existing `documents.importFiles` path. (OS-level folder drops into `<vault>/projects/` are already picked up by the reconciler, but that is not in-app DnD.)
- Status at audit: **Missing**. Evidence: no drop handlers in `apps/vault-desktop/renderer/src/*.tsx`.

### BL-02 — Export (Vault / project) · P2
No export, save-dialog, or download path exists anywhere. Add export of a project (or whole Vault) to a portable form — at minimum a folder/zip of the managed files plus a manifest; ideally a re-importable bundle. Must stay within the IPC boundary (main owns the save dialog + filesystem writes).
- Status at audit: **Missing**. Evidence: no export/save code in `apps` or `packages`.

## From Phase 1.3 (robustness & release)

### BL-03 — Recovery / backup tooling · P1
Only a `backups/` directory is created (`vault-storage/src/index.ts:182`); there is no backup-writing, snapshot, or restore logic. Add: periodic/triggered `vault.db` snapshots into `backups/`, and a restore path. Coordinate with SQLite WAL checkpointing so snapshots are consistent.
- Status at audit: **Missing (scaffold only)**.

### BL-04 — Diagnostics · P2
No health-check / self-test / diagnostics surface; only ad-hoc `console.warn` on watcher/reconcile failure (`main.ts:19,26`). Add a diagnostics view or IPC: DB integrity check, migration/schema version, Vault path + free space, watcher status, orphaned-file report. (Overlaps the Slice 2 integrity checks — reuse where sensible.)
- Status at audit: **Missing**.

### BL-05 — Accessibility pass · P1
Accessibility is currently incidental (a handful of `role`/`aria-*` from the Slice 1 modals and the mode switch). Do a deliberate pass: keyboard navigation across Files / Knowledge / Atlas, visible focus order, screen-reader labeling of the file tree and Atlas canvas, and reduced-motion support for the force simulation.
- Status at audit: **Partial**. Evidence: `aria-*`/`role=` totals — `role=`×5, `aria-pressed`×3, `aria-modal`/`aria-labelledby`×2, `aria-live`/`aria-label`/`aria-hidden`×1.

### BL-06 — Large-Vault stress & performance validation · P1
A defensive cap exists (reconcile throws past 25,000 entries, `vault-storage:229`) but there is no stress/perf test. Add tests + a manual protocol for very large / deeply nested / cloud-synced project trees: watcher cost, reconcile duration, no UI freeze, no duplicate registration, Atlas responsiveness. Ties to BL-07.
- Status at audit: **Partial → mostly Missing** (cap only, no tests).

### BL-07 — Watcher production hardening · P2
The recursive `fs.watch` watcher (`main.ts:25`, 750 ms debounce) is implemented but flagged "not fully production-proven" for large/cloud-synced trees. Validate under BL-06 conditions; consider back-pressure / coalescing and OneDrive hydration edge cases before relying on it in release.
- Status at audit: **Implemented, unproven at scale**.

### BL-08 — Release polish & installed-build regression · P1
Packaging config exists (`electron-builder.yml`, win/nsis, `Orbit-Vault-${version}-Setup.${ext}`) but there is no installed-build regression protocol, and prior EPERM/locking packaging issues were noted. Add: a repeatable installed-build smoke test (create/edit/restart/search/Atlas/reconcile on a packaged install), uninstall/reinstall without losing user Vault data, and resolve packaging lock/permission issues.
- Status at audit: **Partial**.

---

**Phase 1.2 / 1.3 disposition:** implemented portions are complete (file import, attachments via Document/File, reveal/open, external change detection); the items above capture everything deferred. With this backlog recorded, Phase 1.2 and 1.3 can be treated as **closed, remainder tracked here** — no silent gaps.

## Project Truth Engine capabilities (newly recognized)

Separate from BL-01…BL-08 (which came from the Phase 1.2/1.3 reconciliation audit). These capture the clarified **Project Truth Engine** product concept. All are **deferred and not approved implementation scope**; priorities are intentionally unassigned until the owner approves them. They must be considered during the owner-approved Phase 3 brainstorm/spec (see `.orbit/CURRENT_PHASE.md`).

### PC-01 — Project Truth readiness scan
Detect whether a project has a complete, partial, missing, stale, duplicated, or conflicting Project Truth stack.

### PC-02 — Evidence-backed Project Truth bootstrap
Analyze repository evidence and generate drafts for missing Project Truth documents, while clearly separating inferred technical facts from owner-supplied intent.

### PC-03 — Project Truth change proposals
Observe meaningful project changes and propose updates to affected Project Truth documents with evidence and diffs.

### PC-04 — Context package for external AI tools
Expose a compact, controlled Project Truth/context package that Claude, Codex, Cursor, GPT, local models, and future Orbit tools can consume before deeper file inspection.

### PC-05 — Context efficiency measurement
Measure whether Vault reduces files read, input tokens, repeated repository analysis, orientation time, and unnecessary model cost compared with working without Vault.
