DECISIONS.md
Locked decisions and why:

Each decision is binding. Changing one requires explicit owner approval and an update here (Rules 2, 4).

## Product and trust

### Users approve mutations
Nothing becomes canonical project memory without an explicit user action (approve, supersede, merge, etc.). **Why:** the user is the authority on what their project "knows"; approval is the gate that keeps the store trustworthy.

### Provenance is mandatory
Every interpretation (and every future model-generated object) must carry evidence linking it to source material. **Why:** knowledge without traceable evidence is indistinguishable from a guess.

### Project Truth is a reusable context layer
Vault maintains a compact, human-editable, evidence-backed representation of a project so humans and AI tools can orient themselves without repeatedly reconstructing the entire repository. **Why:** repeated project discovery wastes time, model context, tokens, and reasoning. Persisting approved understanding lets future sessions spend more effort solving the current task.

## Data and storage

### Local-first
State lives on the user's machine in a chosen Vault directory; no cloud is required to use the product. **Why:** users must fully own and control their project memory; durability and privacy without a service dependency.

### Ordinary files remain content truth
Document/file **content** lives as ordinary local files; the database stores identity, structure, and relationships — never the sole copy of content. **Why:** content stays portable, inspectable, and editable outside the app; the DB indexes reality rather than owning it.

### node:sqlite as the database engine
Persistence uses Node 22's built-in `node:sqlite`, not a native module. **Why:** no native build/ABI headaches across machines; simpler packaging and transfer.

## AI behavior

### AI only proposes
When AI exists (Phase 3), it generates candidate knowledge with citations and never writes canonical state directly. **Why:** models are fallible; letting them mutate memory silently would destroy the product's trust model.

### AI-generated Project Truth requires approval
Vault may detect missing or stale Project Truth and generate drafts or proposed updates, but it never silently creates, replaces, or promotes AI-generated documentation as authoritative. **Why:** repository analysis can infer technical reality but may misinterpret intent, product direction, or historical reasoning. Owner review preserves trust.

## Phase 3 — AI + Project Truth Engine

Owner-approved 2026-08-06 alongside the start of Phase 3 planning.

### Phase 3 is delivered incrementally as `v0.3.0` → `v0.3.5`
Phase 3 ships as ordered release slices: `v0.3.0` AI Foundation, `v0.3.1` Project Context & Repository Analysis, `v0.3.2` Project Truth Bootstrap, `v0.3.3` AI Proposal Review & Approval, `v0.3.4` Knowledge Proposal Engine, `v0.3.5` Project Truth Maintenance. Only the slice named active in `.orbit/CURRENT_PHASE.md` is approved implementation scope. **Why:** AI is the first non-user writer of proposals into the product; incremental slices keep the trust model and scope controllable and let each boundary be verified before the next builds on it.

### AI architecture is provider-neutral / replaceable
The AI layer is built against a provider-neutral abstraction; no single model vendor is baked into the product, and swapping providers must not require changing the AI contracts or service boundary. **Why:** models and vendors change quickly; provider neutrality protects the product from lock-in and keeps analysis local-first-capable, and no provider decision has been made.

### AI remains proposal-only with explicit user approval
Across every Phase 3 capability, AI generates candidate proposals with provenance and never writes canonical state directly; nothing AI-generated becomes canonical without an explicit user action. **Why:** this is the product's core trust guarantee — a fallible model mutating memory silently would destroy it. (Reaffirms and extends "AI only proposes" for all Phase 3 slices.)

### Project Truth maintenance uses change proposals, not silent edits
Keeping Project Truth aligned with an evolving project (`v0.3.5`) is done by generating evidence-backed *update* proposals that the user reviews, never by silently modifying Project Truth files. **Why:** Project Truth is human-editable and authoritative; silent AI rewrites would reintroduce exactly the untrusted-mutation problem the product exists to prevent.

### `v0.3.1` (Project Context & Repository Analysis) is analysis-only
Owner activated `v0.3.1` on 2026-08-06 as the single active Phase 3 slice; it is now **complete and tagged `v0.3.1`** (`v0.3.0` stays complete/locked and `v0.3.2`–`v0.3.5` stay planned/inactive). `v0.3.1` is scoped to **deterministic, local-first evidence discovery + Project Truth readiness detection + transparent context-package construction** — it does **not** generate Project Truth, invoke a live model to produce content, create or persist proposals, or promote anything to canonical state. Filesystem discovery stays behind the main/storage/`VaultService` boundary; classification/readiness logic that needs no filesystem is a pure, byte-deterministic analyzer in `packages/vault-core`; any IPC exposed is read-only (no `mutates`). **Why:** the roadmap delivers Phase 3 incrementally so each boundary is verified before the next builds on it; keeping `v0.3.1` to analysis + packaging preserves every existing trust invariant and prevents scope creep into `v0.3.2` bootstrap and `v0.3.3` review before those are approved. (Concrete scope/acceptance/verification live in `.orbit/CURRENT_PHASE.md`.)

### `v0.3.1` ships a read-only inspection surface (not internal-only)
Owner decided 2026-08-06 that `v0.3.1` exposes its analysis results through a **read-only** `vault:*` IPC channel plus a minimal renderer inspection view (over the evidence inventory, Project Truth readiness state, and constructed context package) — not internal plumbing only. It stays strictly read-only: no `mutates` flag, no write path, no proposal creation, no Truth-generation UI. **Why:** the roadmap requires "transparent, inspectable context packages"; making the packaged evidence and readiness actually observable to the owner satisfies that intent and lets the owner verify what would later be sent to a model, while the read-only constraint keeps every trust invariant intact and avoids drifting into `v0.3.2`/`v0.3.3` scope. The new channel is asserted by `scripts/phase2-lifecycle-ui-regression.mjs`.

## Architecture and integration

### Graph is a view, not another database
Atlas is a deterministic projection of canonical entities; it never stores or defines data, and interactions never become the primary organization mechanism. **Why:** a second source of truth would create drift and undermine the canonical model.

### Integrations use an API rather than direct SQLite access
External consumers (including the future Orbit assistant) go through the stable Vault service API, never reading/writing `vault.db` directly. **Why:** the database schema is an implementation detail; a stable API preserves invariants and lets storage evolve.

## Phase 2.4 lifecycle and integrity

### Determinism before semantics (Phase 2.4)
Integrity detection covers only objective, rule-based problems (missing evidence, broken references, duplicates by explicit link or identical title, unanswered questions, orphans). Semantic/AI conflict detection is deferred. **Why:** deterministic checks are reproducible and trustworthy; semantic inference belongs behind the AI gate so it can't silently assert "truth."

### Merge keeps one object canonical (Phase 2.4)
Merging duplicates retains a chosen target as canonical, marks the others `superseded`, and transfers their evidence and relationships — rather than creating a new combined object. **Why:** preserves stable identity and minimizes relationship churn; history remains fully traceable.

### History is an immutable audit timeline (Phase 2.4)
Lifecycle events (create/edit/approve/archive/restore/supersede/merge) are recorded as immutable before/after snapshots. Version *restoration* is intentionally not offered yet. **Why:** an inspectable, tamper-evident record without complicating merge safety.

## BL-03 recovery & backup

### Snapshots are manual only (BL-03)
A snapshot is created only by an explicit user action; there are no scheduled, timed, or automatic pre-operation snapshots. **Why:** BL-03 solves recovery, not automation. Automatic pre-operation snapshots belong to the Phase-3 AI-proposal safety net and are deferred.

### A snapshot captures the whole Vault as one stable state (BL-03)
A snapshot is a `VACUUM INTO` single-file `vault.db` (no WAL sidecars) plus a verbatim copy of the managed `projects/` tree, captured under a defensive write barrier and validated by before/after fingerprints that abort on any external change. **Why:** the database and managed files are separate stores; a snapshot must never contain a database that references file state it did not also capture.

### Vault identity is a persisted, location-independent UUID (BL-03)
Each Vault stores a UUID in `vault_meta` (migration 7), independent of its directory path. A restored Vault receives a **new** UUID and records lineage (`restored_from_vault_id`, `restored_from_snapshot_id`, `restored_at`). **Why:** identity must survive moves/renames, and a restore must never produce two live Vaults claiming the same identity.

### Restore is non-destructive and refuses on any integrity failure (BL-03)
Restore only ever creates a new Vault in a new, non-existent directory (staging → atomic finalize); it never replaces the live Vault. It validates structure, checksums, and supported schema version before writing, and refuses outright on any mismatch — there is no "restore anyway". **Why:** recovery must be safe by construction; salvage of a damaged snapshot and in-place restore are deferred, higher-risk capabilities.

### Snapshot integrity is corruption-detection, not authenticity (BL-03)
Manifest validation checks structure and an exact file↔checksum bijection (no missing, no unexpected files) with SHA-256. **Why:** this reliably detects corruption and accidental modification; BL-03 deliberately adds no cryptographic signatures or cloud trust, so it does not defend against deliberate forgery.

### Snapshots are never auto-deleted (BL-03)
Retention is fully manual: every snapshot is a deliberate user action and is kept until the user deletes it. **Why:** silently reaping a backup the user chose to create would violate their expectation; disk usage is surfaced instead.
