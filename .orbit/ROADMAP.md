ROADMAP.md
The entire ordered journey:

Status reflects `main` / tag `v0.2.0`. "Planned" phases are not scope until written into `.orbit/CURRENT_PHASE.md` with owner approval (Rule 3 in root `AGENTS.md`).

## Completed phases

### Phase 0 — Desktop foundation ✅
- **Objective:** Electron main/preload/renderer separation, build pipeline, package boundaries.
- **Deliverables:** native shell, dev + production build, monorepo package structure.
- **Done when:** app builds and launches; boundaries enforced.

### Phase 1 / 1.1 — Local Vault foundation ✅
- **Objective:** real, persistent, multi-Vault local storage.
- **Deliverables:** Vault create/open/switch; project/folder/document CRUD; Markdown autosave; archive/trash/restore; lexical search; Atlas projection; restart persistence.
- **Done when:** entities persist across restart and multiple Vaults stay isolated (covered by `phase1-storage` tests).

### Phase 1.2 / 1.3 — File lifecycle & robustness ◐ closed, remainder in backlog
- **Objective:** file import/export, reveal/open, external change detection, and release robustness.
- **Implemented:** general file import; attachments (as canonical Document/File); reveal/open in Explorer; external change detection (watcher + reconcile).
- **Deferred (see `.orbit/BACKLOG.md`):** in-app drag & drop (BL-01), export (BL-02), recovery/backup (BL-03), diagnostics (BL-04), accessibility (BL-05), large-Vault stress testing (BL-06), watcher hardening (BL-07), installed-build regression/polish (BL-08).
- **Disposition:** closed with deferred items tracked; not silently incomplete.

### Phase 2.0–2.4 — Manual knowledge system ✅
- **Objective:** a complete, AI-free knowledge system.
- **Dependencies:** Phase 1 storage.
- **Deliverables:** knowledge objects, evidence, typed relationships/backlinks, folder assignment, Atlas overlays, managed source files (2.0–2.3); immutable history, supersede, transactional deterministic merge (2.4 Slice 1); deterministic integrity detection + review panel (2.4 Slice 2).
- **Done when:** without AI, a user can create/approve/supersede/archive/merge knowledge with preserved history, attach/inspect evidence, link entities, search knowledge, and review deterministic integrity findings — all persistent. **Achieved at `v0.2.0`.**
- **Exclusions:** any AI, semantic inference, persisted integrity findings, automatic repair/merge.

## Current phase

**Between phases — Phase 2 baseline locked (`v0.2.0`); Phase 3 not yet planned.** No active implementation scope until `.orbit/CURRENT_PHASE.md` is populated with owner-approved Phase 3 scope. See `.orbit/CURRENT_PHASE.md`.

## Future phases

### Phase 3 — AI proposals ⬜ (next major)
- **Objective:** AI proposes cited candidate knowledge; the user approves.
- **Dependencies:** complete manual system + deterministic integrity (done), plus a model provider. (No provider is approved; a local model such as Ollama is one example only, not a decision.)
- **Deliverables:** project-scoped assistant, transparent context builder, evidence-cited proposals, approve/edit/merge/reject flow.
- **Done when:** AI can propose knowledge with provenance that the user reviews before anything becomes canonical; no direct DB access; no silent mutation.
- **Exclusions:** autonomous mutation, hidden memory, cross-project context leakage.

### Phase 4 — Project DNA ⬜
- **Objective:** derived, regenerable project intelligence (purpose, architecture, goals, decisions, open questions, known problems).
- **Dependencies:** Phase 3.
- **Done when:** DNA is regenerated from approved state with evidence references; never a second manual source of truth.

### Phase 5 — Semantic drift & conflict detection ⬜
- **Objective:** surface subtle conflicts/drift between knowledge and sources.
- **Dependencies:** Phase 3/4.
- **Done when:** drift checks compare candidates with approved knowledge and surface conflicts for review (proposals only).

### Phase 6 — Stable Vault API ⬜
- **Objective:** a stable public API for the wider Orbit platform.
- **Dependencies:** Phases 2–5 stable.
- **Done when:** external consumers integrate through the API without direct `vault.db` access.

## Explicit exclusions (all phases)

No cloud sync requirement; no autonomous data mutation; no hidden AI memory; no cross-project context leakage; Atlas never becomes a database or the primary organizer; renderer never bypasses IPC.
