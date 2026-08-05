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
Create or extract candidate knowledge
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

## Current status — Phase 1 foundation frozen (0.1.3)

Orbit Vault now creates, opens, remembers, and switches real Vault directories. SQLite stores project, folder, and document metadata while ordinary local Markdown files hold document content. Files, search, Archive, Trash, and Atlas read canonical persisted entities through a typed IPC boundary. The editor autosaves and protects pending changes during navigation and Vault switching. The renderer has no direct Node.js, SQLite, or filesystem access.

Graph View V2 is restored as a deterministic, interactive projection of persisted Projects, Folders, and Documents. It supports constrained motion, session-only drag offsets, recursive collapse, zoom-aware labels, whole-tree search and focus, project filters, and hierarchy reset without becoming a second source of truth.

Knowledge objects, relationships, evidence, AI, Graph relationship overlays, and Project DNA remain intentionally deferred. Development fixtures are explicit: use **Developer → Seed Development Vault** and the confirmed **Reset Development Vault…** action, which is guarded to the disposable development location.

## Roadmap

- **Foundation stabilization (`v0.1.x`)** — recover packaging, verify the 0.1.3 installer and portable build, and complete main-PC migration testing.
- **Phase 1.2** — file import, attachments, drag and drop, reveal/open in Explorer, and export.
- **Phase 1.3** — external change detection, recovery, diagnostics, accessibility, large-Vault testing, and release polish.
- **Phase 2** — a fully manual canonical knowledge system: Knowledge Objects, typed Relationships, Evidence Sources, approval, merge, backlinks, search, deterministic integrity checks, and Atlas integration.
- **Phase 3** — AI proposals, project-scoped assistance, context transparency, and evidence-backed answers. AI proposes; users approve; Vault stores.
- **Phase 4** — derived Project DNA and project intelligence.
- **Phase 5** — semantic drift detection and knowledge maintenance.
- **Phase 6** — stable API integration with the wider Orbit platform.

### Phase 2 implementation status

Phase 2.3 is implemented in development. Alongside Markdown, users can import general source files into managed Vault storage, organize them in project folders, open them natively, reveal them in File Explorer, search supported text formats, and attach them as evidence. Missing managed files are surfaced without discarding their metadata or links. Knowledge folder organization and optional Atlas relationship overlays remain canonical projections. No AI provider, external filesystem watcher, or model mutation path exists. Merge/history and deterministic integrity checks remain subsequent Phase 2 slices.

Opening an empty ordinary folder now initializes it as a Vault. Opening a non-empty folder without `vault.db` requires explicit confirmation before Orbit adds `vault.db`, `projects/`, and `backups/`; pre-existing files remain untouched and are never imported automatically.

Filesystem reconciliation now recognizes ordinary top-level folders dropped into `projects/` as in-place Projects. Opening a Vault performs a deterministic scan, and **Refresh from Disk** registers later additions. Nested folders and files become canonical entities without copying or rewriting them. Dependency, VCS, cache, and build directories are ignored by default. External renames currently register the new path and preserve the previous identity as missing so ambiguous identity is never silently guessed; continuous watching and reviewed rename matching remain follow-up work.

Atlas uses progressive disclosure for larger projects: root folders begin collapsed, visible depth is adjustable, double-clicking a folder reveals its next level, and full expansion remains explicit. Live motion combines bounded node repulsion, damping, and hierarchy springs so nearby nodes separate and bounce naturally without escaping their deterministic branch targets.

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
