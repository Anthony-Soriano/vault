# Orbit Vault

> Orbit Vault is a local-first AI knowledge system that transforms files, conversations, and decisions into an editable, transparent memory layer for your projects.

Orbit Vault is not another notes app. It stores raw project material locally, turns that material into structured knowledge with explicit evidence, and keeps every AI interpretation inspectable and under user control.

## Product rule

**Documents are source material. Knowledge objects are interpretations. Evidence connects the two. Users remain in control.**

Models may propose changes to project knowledge, but they never silently mutate it. Confidence is useful metadata—not a substitute for evidence or user approval.

## Product pillars

### 1. Vault foundation

Projects, folders, Markdown documents, attachments, tags, search, archive, trash, import/export, and local-first storage.

### 2. Knowledge layer

Editable facts, decisions, goals, questions, ideas, preferences, and typed relationships. Every generated object records its source, confidence, linked material, and last update.

### 3. AI layer

Project-isolated chat, cited answers, document/folder/project summaries, a transparent context builder, and user-approved tag suggestions.

### 4. Project intelligence

An automatically maintained Project DNA containing purpose, architecture, technology, goals, important files, recent decisions, known problems, activity, and open questions.

### Transparency layer

AI answers and proposed memories expose their evidence. Users can inspect, approve, edit, merge, reject, or delete knowledge before it becomes part of project memory.

## Canonical product loop

```text
Work
  ↓
Extract candidate knowledge
  ↓
Attach evidence and confidence
  ↓
User approves, edits, merges, rejects, or deletes
  ↓
Project memory updates
  ↓
Project DNA regenerates
  ↓
Future AI answers become more accurate
```

## V1 foundation

V1 is built around five canonical entities:

1. **Project** — the workspace and default context boundary.
2. **Document/File** — locally stored source material.
3. **Knowledge Object** — a structured fact, decision, goal, question, idea, or preference.
4. **Relationship** — a typed connection between any two entities.
5. **Evidence Source** — provenance connecting an interpretation or answer to its supporting source.

See [docs/architecture.md](docs/architecture.md) for the data model, invariants, and implementation direction.

## Current status — Phase 1 frozen (0.1.2)

Orbit Vault now creates, opens, remembers, and switches real Vault directories. SQLite stores project, folder, and document metadata while ordinary local Markdown files hold document content. Files, search, Archive, Trash, and Atlas read canonical persisted entities through a typed IPC boundary. The editor autosaves and protects pending changes during navigation and Vault switching. The renderer has no direct Node.js, SQLite, or filesystem access.

Graph View V2 is restored as a deterministic, interactive projection of persisted Projects, Folders, and Documents. It supports constrained motion, session-only drag offsets, recursive collapse, zoom-aware labels, whole-tree search and focus, project filters, and hierarchy reset without becoming a second source of truth.

Knowledge objects, relationships, evidence, AI, Graph relationship overlays, and Project DNA remain intentionally deferred. Development fixtures are explicit: use **Developer → Seed Development Vault** and the confirmed **Reset Development Vault…** action, which is guarded to the disposable development location.

## Development

Requires Node.js 22.13 or newer.

```bash
pnpm install
pnpm dev          # Electron + Vite hot reload
pnpm build        # Compile Electron and renderer
pnpm test         # Run persistence and safety regression tests
pnpm package      # Create the desktop installer
```

## Desktop boundaries

```text
Electron main process
  ↓ secure IPC
Preload bridge
  ↓ window.orbit
React renderer
  ↓ future stable interfaces
Vault core / storage / search / AI services
```

The desktop implementation lives under `apps/vault-desktop`. Validation and use cases live in `packages/vault-core`, shared IPC/domain contracts in `packages/vault-types`, and the SQLite/filesystem repository in `packages/vault-storage`.
