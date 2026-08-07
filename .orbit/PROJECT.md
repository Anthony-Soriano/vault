PROJECT.md
A readable overview:

## What Orbit Vault is

A local-first desktop application (Electron + React/Vite + SQLite) that turns a project's files, notes, and decisions into an **editable, transparent, evidence-backed memory layer**. Everything lives on the user's machine; ordinary local files remain the source of truth for content, while a local database stores identity, structure, and relationships.

More broadly, Orbit Vault is a local-first **Project Truth Engine**: it turns a project's files, code, notes, and decisions into a compact, evidence-backed, human-editable, AI-readable representation — a **Project Truth** layer that humans and AI tools can reuse to orient themselves instead of reconstructing the whole project from scratch every time. Today that Project Truth stack (this `.orbit/` set) is authored and maintained by hand; automatically detecting, drafting, and proposing it from repository evidence is a **planned** capability (see the roadmap), not implemented yet.

## Who it is for

Individuals and technical users managing complex, long-lived projects who need a **trustworthy, inspectable project memory** they fully own — and, later, the wider Orbit platform, which will consume Vault through a stable API rather than reading its database directly.

## The core problem

Note and knowledge tools force a bad trade: cloud tools take custody of your data, and unstructured tools become piles you can't reason over. AI layers make it worse by hallucinating and mutating content silently. Users have no locally-owned, structured, evidence-backed memory that they remain in control of.

## The product thesis

> **Documents are source material. Knowledge objects are interpretations. Evidence connects the two. Users stay in control.**

Models may eventually *propose* knowledge, but never silently mutate it. Confidence is metadata, not truth.

## Why Orbit Vault exists

Orbit Vault exists because projects now grow and change faster than people — and especially AI sessions — can repeatedly reconstruct them. Without a maintained truth layer, every new contributor and every AI tool (Claude, Codex, Cursor, GPT, local models) re-spends time, tokens, and reasoning rediscovering what the project is, how it works, why decisions were made, and what remains true. Vault turns project evidence into a durable, compact, inspectable **Project Truth** layer so humans and tools can gain that understanding without analyzing the entire project from scratch every time.

## Product principles

- **Local-first.** State lives on the user's machine; no required cloud.
- **Ordinary files are content truth.** The database indexes and relates; it never becomes the sole home of content.
- **Transparency.** Every interpretation carries its source and evidence.
- **User approval.** Nothing becomes canonical without an explicit user action.
- **Determinism where possible.** Objective checks are rule-based and reproducible; semantic judgment is deferred to a clearly-gated AI phase.
- **The graph is a view.** Atlas visualizes canonical data; it is never a second database.
- **Context efficiency.** Vault should minimize repeated project reconstruction. Approved Project Truth gives humans and AI a compact orientation layer before deeper repository inspection is needed. (This is a guiding goal; automated Project Truth generation is planned, not yet implemented.)

## What it is not

Not a cloud notes app. Not a graph-database UI. Not an autonomous agent that edits your data. Not a place where AI silently writes "truth." Not a second source of organization hidden in the graph.

## Current status

**v0.3.0 and v0.3.1 complete; Phase 3 between slices.** The Phase 2 manual knowledge system is done (projects, folders, documents/files, knowledge objects, typed relationships, evidence, the Phase 2.4 lifecycle, and deterministic integrity), and the pre-Phase-3 release-readiness item BL-03 (recovery/backup) is complete. **Phase 3 — AI + Project Truth Engine** is the active phase (owner-approved 2026-08-06), delivered incrementally as `v0.3.0` (AI Foundation) → `v0.3.5` (Project Truth Maintenance); only the slice named active in `.orbit/CURRENT_PHASE.md` is approved implementation scope. The `v0.3.0` AI Foundation is implemented and verified — a provider-neutral, proposal-only AI service boundary in `packages/vault-core`, internal plumbing only. **`v0.3.1` (Project Context & Repository Analysis) is complete and tagged `v0.3.1`:** deterministic, local-first evidence discovery, Project Truth readiness detection, and transparent context-package construction, plus a read-only inspection surface — analysis and packaging only, with no Project Truth generation, no live model invocation, and no canonical mutation. Phase 3 is now between slices; `v0.3.2` is not activated. Deferred items are tracked in `.orbit/BACKLOG.md`.

## Reading order

`AGENTS.md` → `.orbit/PROJECT.md` → `.orbit/PRODUCT_SPEC.md` → `.orbit/ARCHITECTURE.md` → `.orbit/DECISIONS.md` → `.orbit/ROADMAP.md` → `.orbit/CURRENT_PHASE.md` → `.orbit/BACKLOG.md`.
