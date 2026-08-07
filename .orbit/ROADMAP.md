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

### BL-03 — Recovery & Backup ✅ (pre-Phase-3 release-readiness item)
- **Objective:** manual, integrity-checked point-in-time snapshots (database + managed files) restorable into a new Vault.
- **Deliverables:** manual snapshot capture (`VACUUM INTO` + managed-file copy under a write barrier, external-change fingerprint abort); persisted location-independent Vault UUID + restore lineage; list/inspect/delete + disk usage; non-destructive restore-to-new-Vault with staging + atomic finalize; `vault:backup:*` IPC + Backups panel.
- **Done when:** a user can snapshot, then restore into a new Vault whose logical state and managed files match the capture, without ever altering the live Vault. **Achieved 2026-08-06** (owner manual acceptance passed; gate green). Promoted from `.orbit/BACKLOG.md` (BL-03) by owner approval.
- **Exclusions (still deferred):** automatic/pre-operation snapshots, restore-in-place, salvage/"restore anyway", ZIP export, retention automation, cloud/sync.

## Current phase

**Phase 3 — AI + Project Truth Engine — ACTIVE.** Phase 2 baseline is locked (`v0.2.0`); the pre-Phase-3 release-readiness item BL-03 (recovery/backup) is complete. Owner approved Phase 3 planning on 2026-08-06; Phase 3 is delivered incrementally as `v0.3.0` → `v0.3.5`. **`v0.3.0` (AI Foundation) and `v0.3.1` (Project Context & Repository Analysis) are complete and locked at tags `v0.3.0`/`v0.3.1`; `v0.3.2` (Project Truth Bootstrap) is complete on branch `feat/v0.3.2-project-truth-bootstrap` (gate green 116/116), pending owner merge/tag.** Phase 3 is now **between slices**: no slice is under active implementation. `v0.3.3`–`v0.3.5` remain planned, not active scope, and become active only when written into `.orbit/CURRENT_PHASE.md` with owner approval (Rule 3, root `AGENTS.md`). See `.orbit/CURRENT_PHASE.md`.

## Phase 3 — AI + Project Truth Engine (active)

**Purpose:** introduce AI as a controlled reasoning/proposal layer over the existing manual knowledge system. The core trust model does **not** change: AI proposes and never silently mutates canonical knowledge; every AI-generated interpretation carries provenance/evidence; the user remains the authority; AI uses Vault's service/API boundaries and never touches `vault.db` directly; project context stays isolated; Project Truth stays human-editable and transparent; repository evidence establishes implemented technical reality but cannot reliably determine owner intent; the provider architecture stays replaceable/provider-neutral.

Phase 3 is delivered incrementally through the following release slices. Only the slice named active in `.orbit/CURRENT_PHASE.md` is approved implementation scope; the rest are planned.

### v0.3.0 — AI Foundation ✅ complete (tag `v0.3.0`)
- **Objective:** establish the internal infrastructure AI features require, without yet attempting autonomous repository understanding or Project Truth generation.
- **Deliverables:** AI/model provider abstraction; project-scoped AI service boundary; typed request/response contracts; context input/output structures; provenance structures for model-generated proposals; provider selection/configuration; basic infrastructure to send explicitly constructed context to a model and receive structured proposals; clear failure/error handling; tests around the new boundaries and trust invariants.
- **Done when:** the plumbing that later Phase 3 slices consume exists and is tested, with no autonomous repository understanding, no Project Truth generation, no silent knowledge creation, and no provider lock-in. **Achieved:** provider-neutral `AiService`/`AiModelProvider`/`StubAiProvider` in `vault-core`, AI contracts in `vault-types`, 15 trust-invariant tests, full gate green (see `.orbit/ARCHITECTURE.md`).

### v0.3.1 — Project Context & Repository Analysis ✅ complete (tag `v0.3.1`)
- **Objective:** give Vault a deterministic/local-first mechanism for understanding what evidence exists in a project and constructing controlled context for AI.
- **Deliverables:** discover relevant project/repository files; respect ignore rules and filesystem boundaries; identify important project structure and technical evidence; detect whether a Project Truth stack appears complete/partial/missing/duplicated/potentially stale; construct transparent, inspectable context packages; avoid blindly sending an entire repository when targeted evidence suffices.
- **Done when:** Vault analyzes and packages evidence into transparent context; it does **not** promote generated Project Truth to canonical state. **Achieved:** deterministic `classifyEvidence`/`detectProjectTruthReadiness`/`selectContextEvidence`/`buildProjectContextPackage` in `vault-core`, read-only `analyzeProjectContext` discovery in `vault-storage`, read-only `vault:context:analyze` IPC + `ProjectContextView`, 15 tests, full gate green (100/100). Analysis + context packaging only — no model call, no Project Truth generation, no proposals, no canonical mutation. See `.orbit/ARCHITECTURE.md` (Project Context & Repository Analysis) and `.orbit/CURRENT_PHASE.md`.

### v0.3.2 — Project Truth Bootstrap ✅ complete (branch `feat/v0.3.2-project-truth-bootstrap`)
- **Objective:** use repository evidence + the AI proposal pipeline to draft missing Project Truth, handling the three states in `.orbit/PRODUCT_SPEC.md` (none / partial / existing).
- **Deliverables:** evidence-backed Project Truth proposals; clear separation of inferred technical facts from owner-intent information that cannot be safely inferred; cited evidence behind generated claims; surfacing of missing information that needs owner input; drafts/proposals rather than silent authoritative writes. Owner outcomes to support (review interaction may complete in v0.3.3): Create · Merge · Replace · Skip · Keep existing file authoritative — carried in v0.3.2 as *suggested dispositions only* (present docs default `keep_existing`), never executed.
- **Done when:** Vault produces evidence-backed Project Truth drafts that never become canonical without owner action. **Achieved:** pure `planProjectTruthBootstrap` (sole scope authority) + `mapBootstrapDrafts` (identity-by-target, decision-3 citation validation) in `vault-core`; repository-free `ProjectTruthBootstrapService` (one `AiService.propose` call per create-target, decision D1); `VaultService.projectTruth.bootstrap` (optional AI dep); non-mutating async `vault:project-truth:bootstrap` IPC + read-only user-triggered `ProjectTruthBootstrapView`; 16 tests; full gate green (116/116). Drafts are **ephemeral** — no proposal store, no canonical write, no approve/edit/merge/replace execution (that is `v0.3.3`); bootstrap drafts only *missing* Project Truth (staleness/maintenance is `v0.3.5`). See `.orbit/ARCHITECTURE.md` (Project Truth Bootstrap) and `.orbit/CURRENT_PHASE.md`.

### v0.3.3 — AI Proposal Review & Approval ⬜ (planned)
- **Objective:** the complete human-in-the-loop workflow for AI proposals.
- **Deliverables:** inspect a proposed change and its evidence/provenance; compare proposed vs existing state where applicable; edit/approve/reject/merge/replace; preserve history/auditability; guarantee nothing AI-generated becomes canonical without explicit user action. Works with both Project Truth proposals and the broader proposal infrastructure where sensible.
- **Done when:** every AI proposal type flows through an auditable review/approval gate before becoming canonical.

### v0.3.4 — Knowledge Proposal Engine ⬜ (planned)
- **Objective:** allow AI to convert project evidence/context into candidate canonical Knowledge Objects using the existing knowledge system.
- **Deliverables:** proposals across the existing canonical knowledge types (Fact, Decision, Goal, Question, Idea, Preference); evidence/provenance required; proposal status non-canonical until approved; existing lifecycle/history/integrity rules continue to hold; no silent mutation.
- **Done when:** AI can propose typed Knowledge Objects with provenance that the user approves before anything becomes canonical.

### v0.3.5 — Project Truth Maintenance ⬜ (planned)
- **Objective:** move from one-time Project Truth creation toward keeping Project Truth aligned with an evolving project.
- **Deliverables:** detect meaningful changes in project evidence; determine which Project Truth domains may have become stale; generate evidence-backed update proposals; show what changed and why; avoid unnecessary rewrites/churn; never silently modify Project Truth; user reviews every canonical change.
- **Done when:** Project Truth stays aligned with the project through owner-reviewed change proposals rather than silent edits.

### Phase 3 boundaries (all slices)
Do **not** introduce: autonomous canonical memory mutation; hidden AI memory; cross-project context leakage; direct AI access to SQLite; cloud-sync requirements; an AI coding IDE; a second graph/database source of truth; automatic semantic claims presented as deterministic truth. Semantic reasoning must remain clearly identified as AI-generated judgment.

## Future phases

### Phase 4 — Project DNA ⬜
- **Objective:** derived, regenerable project intelligence (purpose, architecture, goals, decisions, open questions, known problems).
- **Dependencies:** Phase 3. Builds on the approved Project Truth stack and the canonical knowledge layer to produce deeper derived project intelligence.
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
