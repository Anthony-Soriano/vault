PRODUCT_SPEC.md
The complete product contract:

## Target users

- Individuals and technical practitioners running complex, long-lived projects (software, research, writing, operations) who want durable, inspectable project memory they own locally.
- Future consumer: the wider **Orbit platform**, integrating through a stable Vault API (never direct database access).

## User jobs

- Capture source material (notes and files) into a project without ceding custody.
- Turn that material into explicit, structured knowledge (facts, decisions, goals, questions, ideas, preferences).
- Attach evidence so any interpretation is traceable to its source.
- Reconcile and retire knowledge safely (supersede, merge duplicates) with a full audit trail.
- Trust the store: find objective problems (missing evidence, broken links, duplicates) without guesswork.
- Navigate the whole project visually (Atlas) without that view becoming the system of record.
- Give humans and AI a compact, trusted orientation layer so they do not need to repeatedly analyze the entire project before useful work can begin.

## Core workflows

1. **Vault lifecycle** — create/open/switch real Vault directories; state persists across restarts.
2. **Files** — create Markdown, import general files into managed storage, open/reveal natively, archive/trash/restore, lexical search.
3. **Knowledge** — create/edit knowledge objects, attach evidence, approve, create typed relationships and backlinks, search knowledge independently.
4. **Lifecycle (Phase 2.4)** — inspect immutable history; supersede an object; merge duplicates (preview → confirm) keeping the target canonical and moving evidence/relationships.
5. **Integrity (Phase 2.4)** — run deterministic checks and route each finding into the matching fix.
6. **Atlas** — interactive force-directed projection of projects/folders/documents (+ optional knowledge/relationship overlays).

## Project Truth Bootstrap (drafting implemented in v0.3.2; review/approval + maintenance still planned)

A capability for initializing and maintaining a project's **Project Truth** stack from local evidence. It never overwrites anything automatically: it detects gaps, analyzes available project evidence locally, generates evidence-backed drafts, shows what was inferred and from where, and asks the owner to review, edit, approve, merge, replace, or reject before anything is written. **As of `v0.3.2` the drafting half is implemented** — Vault drafts *missing* Project Truth as evidence-backed, ephemeral, proposal-only drafts (cited technical facts validated against the discovered inventory, separated from owner-input gaps; present docs kept authoritative; nothing persisted or made canonical). The owner-facing **review/approval workflow** (executing Create·Merge·Replace·Skip with history/audit) is `v0.3.3`, and **ongoing maintenance** (staleness/change proposals over an evolving stack) is `v0.3.5` — both still planned. The three project states and evidence boundaries below describe the full capability.

It handles three project states:

- **No Project Truth exists** — Vault detects that the project lacks a structured truth stack and offers to generate evidence-backed drafts.
- **Partial Project Truth exists** — Vault identifies missing documents or incomplete domains and proposes only the missing pieces.
- **Existing Project Truth exists** — Vault audits for stale, conflicting, duplicated, or unsupported claims and proposes updates without overwriting anything automatically.

Each proposal supports these owner actions: **Create · Merge · Replace · Skip · Keep existing file authoritative.**

Evidence boundaries:

- Repository evidence can safely support **technical facts**: detected stack, package layout, implemented architecture, schemas, tests, build commands, implemented features, current version, and explicit TODOs.
- **Intent-based truth** normally requires owner input: original vision, target users, why the project matters, intended product behavior, roadmap priorities, non-negotiable principles, and the reasons behind historical decisions.

Rule: **Code can provide evidence of what exists. It cannot reliably establish why the project exists or what the owner intends next.**

Expected benefits (directional; not promised as specific figures until measurable — see `.orbit/BACKLOG.md` PC-05):

- lower repeated AI context usage
- less repeated repository crawling
- faster model and contributor onboarding
- reduced reasoning spent reconstructing project state
- improved human project understanding
- portable context across Claude, Codex, Cursor, GPT, local models, and future tools

## Canonical entities

1. **Project** — top-level workspace and default context boundary.
2. **Document/File** — local source material (Markdown or imported file); the filesystem holds content, the DB holds identity/metadata.
3. **Knowledge Object** — a fact, decision, goal, question, idea, or preference. Status: draft / approved / superseded / archived.
4. **Relationship** — a typed, directed connection between canonical entities.
5. **Evidence Source** — provenance linking an interpretation to supporting material.

## Feature requirements

**Implemented (v0.2.0):** Vault CRUD & multi-Vault isolation; project/folder/document CRUD; Markdown autosave; general file import; native open/reveal; archive/trash/restore; lexical search; filesystem reconciliation + watcher; knowledge objects; evidence; typed relationships/backlinks; folder assignment; Atlas with overlays; immutable knowledge history; supersede; transactional deterministic merge; deterministic integrity analysis + review panel.

**Planned (see `.orbit/ROADMAP.md`):** AI + Project Truth Engine (Phase 3, active — delivered incrementally as `v0.3.0` AI Foundation → `v0.3.1` Project Context & Repository Analysis → `v0.3.2` Project Truth Bootstrap → `v0.3.3` AI Proposal Review & Approval → `v0.3.4` Knowledge Proposal Engine → `v0.3.5` Project Truth Maintenance); derived Project DNA (Phase 4); semantic drift detection (Phase 5); stable public API (Phase 6). `v0.3.0` (internal AI plumbing), `v0.3.1` (deterministic, read-only evidence discovery + readiness + context packaging), and **`v0.3.2` (Project Truth Bootstrap — evidence-backed, ephemeral, proposal-only drafts of *missing* Project Truth; cited facts validated against the discovered inventory and separated from owner-input gaps; nothing persisted or made canonical)** are complete (v0.3.2 on branch `feat/v0.3.2-project-truth-bootstrap`, gate green, pending owner merge/tag); Phase 3 is between slices (see `.orbit/ARCHITECTURE.md`). Only the slice named active in `.orbit/CURRENT_PHASE.md` is approved implementation scope. Deferred robustness items in `.orbit/BACKLOG.md`.

## V1 boundaries

Built around the five canonical entities. No AI provider, no automatic mutation, no cloud sync, no cross-project context leakage. Atlas is a projection, not a database.

## Non-goals

- Not a cloud-first notes service.
- Not an autonomous agent that silently edits canonical project memory.
- Not a coding IDE.
- Not a replacement for Git or source control.
- Not a graph database whose visualization becomes the source of truth.
- Not a generic chatbot with hidden memory.
- Not a required cloud-sync platform.

## Trust and safety rules

- Nothing becomes canonical automatically; user approval is required for every mutation of project memory.
- Every future model-generated object must carry provenance (evidence).
- Confidence is metadata, never a substitute for evidence or approval.
- Project context is isolated by default; cross-project relationships/evidence are rejected.
- The renderer never accesses Node, SQLite, or the filesystem directly.

## Local-first behavior

State lives in a user-chosen Vault directory (`vault.db` + `projects/` + `backups/`). Content lives as ordinary local files. No network is required to use the product. External filesystem changes under `projects/` are reconciled (on open, on a watcher event, and on demand).

## AI behavior

No user-facing AI behavior today. As of `v0.3.0` a provider-neutral, proposal-only AI service boundary exists internally (see `.orbit/ARCHITECTURE.md`), but it is not wired to the UI/IPC and performs no repository analysis or Project Truth generation. When surfaced in later Phase 3 slices, AI only **proposes**: it generates candidate knowledge with citations, which the user approves/edits/merges/rejects. AI never writes canonical state directly and never reads `vault.db` outside the stable service boundary. Semantic judgment (e.g., "these contradict") stays out of the deterministic layers and is always clearly identified as AI-generated judgment, never presented as deterministic truth.

### How the Phase 3 AI capabilities relate

Phase 3 introduces one shared AI proposal layer that several capabilities build on. They compose rather than compete:

- **AI proposal pipeline (foundation, `v0.3.0`, complete).** The provider-neutral plumbing: send an explicitly constructed context to a model, receive a structured, provenance-carrying, non-canonical proposal. Every capability below is a producer or consumer of proposals on this pipeline.
- **Project context & repository analysis (`v0.3.1`).** Deterministic, local-first discovery and packaging of project evidence into transparent, inspectable context. It feeds the pipeline; it does not itself write anything canonical.
- **Project Truth Bootstrap (`v0.3.2`).** Uses the pipeline + packaged evidence to draft *missing* Project Truth for the none/partial/existing states, separating inferred technical facts from owner-intent that cannot be inferred. It emits proposals, never authoritative files.
- **AI proposal review & approval (`v0.3.3`).** The human-in-the-loop gate through which any proposal — Project Truth or knowledge — is inspected, compared, edited, and approved/rejected/merged/replaced with preserved history. This is the only path by which an AI proposal becomes canonical.
- **Knowledge proposal engine (`v0.3.4`).** Turns project evidence/context into candidate canonical Knowledge Objects across the existing types (fact, decision, goal, question, idea, preference), reusing the same pipeline, review gate, and the existing lifecycle/history/integrity rules.
- **Project Truth maintenance (`v0.3.5`).** Detects meaningful project change, judges which Project Truth domains may be stale, and emits evidence-backed *update* proposals through the same review gate — change proposals, never silent edits.

Invariant across all of them: nothing AI-generated becomes canonical without an explicit user action, and every AI-generated object carries provenance.

## Acceptance criteria

A release candidate must let a user, with AI disconnected: create/open/switch Vaults; create and organize documents and files; create/approve/supersede/archive/merge knowledge with preserved history; attach and inspect evidence; create/remove typed relationships; search documents and knowledge; review deterministic integrity findings and act on them; and see all of it persist across a full restart. Verification (`pnpm typecheck`, `pnpm test`, `pnpm build`, static UI regression) must pass.

## Success measurements

- Zero silent mutations of canonical knowledge.
- Every approved interpretation traceable to evidence.
- Deterministic integrity report is byte-identical for identical Vault state.
- Restart persistence and multi-Vault isolation hold under test.
- Atlas stays a projection (no divergence from canonical data).
