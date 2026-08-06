> **Supporting reference.** The canonical architecture is `/ARCHITECTURE.md` at the repo root. This file is deeper design detail (entity fields, phase contracts) and may lag current code.

# Orbit Vault Architecture

Status: **Phase 1 foundation complete; Phase 2.3 managed source files implemented**

## Phase 1 implementation

Phase 1 promotes `Project`, `Folder`, and `Document/File` as first-class persisted entities without implementing the future knowledge layer. Electron main owns a `VaultService`; the service validates use cases against repository interfaces; `SqliteVaultRepository` stores metadata in `vault.db` and Markdown content below `projects/<project-id>/files/`. The sandboxed renderer communicates only through the typed `window.vault` preload bridge.

SQLite migrations are versioned and repeatable. Files are written atomically, paths are resolved beneath the project content root, folder moves reject cycles and cross-project parents, and archive/trash status changes retain data for restoration. Atlas is a derived projection of active canonical entities.

## System boundary

Orbit Vault owns persistent project state: source files, structured knowledge, relationships, provenance, approval status, and derived project intelligence. AI models operate over that state and return proposals. They do not own the state or write unreviewed interpretations into project memory.

The future Orbit assistant integrates through a stable Vault API. It must not read or write the storage database directly.

## Canonical entities

### Project

The top-level workspace and context boundary.

Minimum fields:

- `id`
- `name`
- `description`
- `icon`
- `color`
- `status` (`active`, `archived`, `trashed`)
- `storage_path`
- `created_at`
- `updated_at`

### Document/File

Raw source material stored locally. Documents may be editable Markdown; files may be attachments such as PDFs, images, audio, archives, or code.

Minimum fields:

- `id`
- `project_id`
- `parent_id`
- `kind` (`document`, `file`, `folder`, `conversation`)
- `name`
- `relative_path`
- `content_type`
- `content_hash`
- `created_at`
- `updated_at`
- `deleted_at`

The filesystem remains the source of truth for file content. The database stores identity, indexing metadata, and relationships.

### Knowledge Object

An explicit interpretation derived from source material or created by the user.

Types:

- fact
- decision
- goal
- question
- idea
- preference

Minimum fields:

- `id`
- `project_id`
- `type`
- `title`
- `body`
- `status` (`draft`, `approved`, `superseded`, `archived`)
- `confidence`
- `author` (`user`; `ai` is reserved for a later phase)
- `created_at`
- `updated_at`

Nothing becomes canonical automatically. Future model-created knowledge must begin as `draft`; only an explicit user action promotes it into approved project memory.

### Relationship

A typed, directed connection between two entities.

Example types:

- supports
- references
- contradicts
- answers
- depends_on
- blocks
- implements
- duplicates
- derived_from
- belongs_to

Minimum fields:

- `id`
- `project_id`
- `source_type`
- `source_id`
- `target_type`
- `target_id`
- `relationship_type`
- `origin`
- `created_at`

Graph View is a projection of these relationships, not a separate graph-specific data store.

### Evidence Source

The provenance supporting a knowledge object, summary, Project DNA field, or AI response claim.

Minimum fields:

- `id`
- `project_id`
- `subject_type`
- `subject_id`
- `source_type`
- `source_id`
- `locator` (page, line range, block, timestamp, or message)
- `excerpt`
- `excerpt_hash`
- `confidence`
- `availability`
- `created_at`

Evidence should point to the smallest stable source location available. Display excerpts are conveniences; they do not replace the underlying source reference.

## Architectural invariants

1. Vault owns all persistent state.
2. Models return proposals, never silent mutations.
3. Every model-generated knowledge object has provenance.
4. Confidence is metadata, not truth.
5. Project context is isolated by default.
6. Project DNA is derived and can be regenerated.
7. Graph View reads the canonical relationship model.
8. AI answers expose an evidence trail rather than hidden reasoning.
9. User corrections are durable inputs to future retrieval.
10. Integrations use a stable Vault API rather than direct database access.

## Graph philosophy

The graph exists to visualize the Vault.

It does not define the Vault.

Graph layout is always derived from canonical data.

Graph interactions never become the primary way of organizing information.

The graph should become more informative as the underlying knowledge becomes richer—not through artificial visual complexity.

## Phase 2 contract: canonical knowledge foundation

Phase 1 built a local file system. Phase 2 builds a local knowledge system. Phase 3 teaches AI how to use that knowledge.

Phase 2 must remain excellent with every language model disconnected. Users create, organize, inspect, edit, approve, archive, merge, and link knowledge manually. AI generation is not required and must not be introduced as part of this phase.

### Core interfaces

- **Knowledge Inspector** — details, status, confidence, relationships, evidence, backlinks, and history
- **Decision Log** — chronological project decisions with evidence, related goals, and affected files
- **Goals** — open, in-progress, completed, and archived project goals
- **Open Questions** — questions without an accepted answer
- **Evidence Viewer** — the exact source and location supporting an object
- **Backlinks** — incoming, outgoing, and connected knowledge
- **Relationship Viewer** — user-controlled typed connections
- **Knowledge Search** — title, body, type, status, and relationship type

### Deterministic integrity checks

Phase 2 checks concrete state without AI:

- possible duplicate knowledge
- conflicting decisions
- goals with incompatible statuses
- contradictory preferences
- unanswered questions
- missing evidence
- orphaned objects with neither evidence nor relationships

Semantic drift detection is deferred until AI exists. Phase 2 does not attempt to infer that one document subtly contradicts another.

### Atlas integration

Atlas may add Knowledge Objects as a distinct optional node layer beneath Documents. Relationship overlays remain optional. Atlas continues to derive its entire view from canonical entities and never becomes an organizing database.

### Completion criteria

Phase 2 is complete when, without AI, a user can:

1. Create, edit, approve, supersede, archive, and delete Knowledge Objects.
2. Merge duplicates while preserving traceable history.
3. Connect entities with typed relationships.
4. Attach and inspect evidence with stable source locations.
5. Browse backlinks, decisions, goals, and open questions.
6. Search knowledge independently from documents.
7. Navigate knowledge through Atlas.
8. Review deterministic integrity warnings.

## Project DNA

Project DNA is a regenerable projection of approved project state. It includes:

- purpose
- architecture
- technology stack
- goals
- important files
- recent decisions
- known problems
- recent activity
- open questions

It must retain evidence references for every generated section. Users may correct its underlying knowledge, but Project DNA should not become a second manually maintained source of truth.

## Future AI proposal workflow (Phase 3)

1. New or changed source material is indexed.
2. A model may extract candidate knowledge.
3. Candidates receive type, confidence, and evidence.
4. The user approves, edits, merges, rejects, or deletes each candidate.
5. Approved knowledge becomes available to retrieval.
6. Project DNA and other derived views are regenerated.
7. Drift checks compare new candidates with approved knowledge and surface conflicts for review.

## Next engineering milestone

Before Phase 2 implementation, finish the `v0.1.3` packaging and migration checkpoint. Then implement the manual canonical entities, repositories, migrations, and typed IPC methods without adding model-provider code.

The first Phase 2 vertical slice now supports:

1. Create one user-authored draft Knowledge Object.
2. Attach evidence from a Document.
3. Approve it explicitly.
4. Find it through independent knowledge search.
5. Render it in the Knowledge Inspector and optional Atlas knowledge layer.

Phase 2.1 adds the canonical `Relationship` repository and secure IPC surface. A user can create typed project-scoped links from a Knowledge Object to another Knowledge Object or Document, inspect incoming backlinks and outgoing links in the Knowledge Inspector, follow those targets, and remove links.

The Phase 2.1 follow-up adds an optional `parentFolderId` to Knowledge Objects. Folder placement is organizational metadata inside the existing Project boundary: moving or unfiling knowledge never changes its identity, evidence, relationships, or approval status. Atlas derives the displayed parent from this canonical assignment and falls back to evidence or the Project when no active folder assignment exists.

Phase 2.2 adds optional Atlas overlays for the same canonical Relationships. Solid edges remain structural hierarchy; dashed colored curves represent typed semantic links. Connections and Knowledge are independently toggleable, hidden or collapsed endpoints do not leak edges, and enabling an overlay never changes node positions or persistent state. The next slice is Phase 2.3 general source-file support.

Phase 2.3 promotes imported attachments into the existing canonical `Document/File` entity rather than creating a parallel attachment model. Import copies user-selected files into `projects/<project-id>/files/` beneath the chosen folder; the external original is never moved or modified. Main-process IPC owns native dialogs, open, and reveal operations. Supported text-like formats up to 2 MB participate in lexical search, while binary formats remain discoverable by title and path. A missing managed file is reported as unavailable but retains identity, relationships, and evidence provenance. External filesystem watching, PDF/image text extraction, and AI interpretation remain deferred.

Vault initialization is explicit about filesystem ownership. Selecting an empty folder through Open Vault initializes it directly. Selecting a non-empty folder without `vault.db` requires confirmation before adding the root `vault.db`, `projects/`, and `backups/` entries. Existing contents are neither modified nor indexed until the user deliberately imports selected files.

The reconciliation layer supports a second, in-place workflow: an ordinary top-level folder placed under `projects/` becomes a canonical Project on the next Vault open or **Refresh from Disk**. Migration 5 records each Project's relative storage path, preserving existing UUID-managed `id/files` projects while allowing human-readable in-place project roots. Reconciliation registers nested folders and files, reads content from disk, reports missing documents, ignores generated trees, rejects symlink traversal, and caps a scan at 25,000 visited entries per project. It does not yet infer identity across external renames or run a continuous watcher.

Large Atlas projections use progressive disclosure rather than changing the canonical graph. Root folders start collapsed and a visible-depth limit controls rendering only. Expanding a branch or focusing a search result reveals canonical descendants without mutating Vault state. Live motion applies spatially bounded repulsion and damped hierarchy springs around deterministic layout targets; manual offsets remain session-only and Reset restores calculated positions.
