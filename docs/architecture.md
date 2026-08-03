# Orbit Vault Architecture

Status: **Canonical product contract with Phase 1 persistence implemented**

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
- `status` (`proposed`, `approved`, `rejected`, `superseded`, `archived`)
- `confidence`
- `origin` (`user`, `model`, `import`)
- `created_at`
- `updated_at`

Model-created knowledge begins as `proposed`. Only an explicit user action promotes it into approved project memory.

### Relationship

A typed, directed connection between two entities.

Example types:

- links-to
- supports
- contradicts
- supersedes
- depends-on
- relates-to
- belongs-to
- derived-from

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
- `excerpt_hash`
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

## Derived V1 capabilities

The canonical entities support:

- project-scoped assistant conversations
- citations and evidence trails
- backlinks and related material
- memory inspection and approval
- decision logs
- goals and open questions
- AI tag proposals
- document, folder, and project summaries
- Project DNA
- knowledge drift detection
- recent activity
- graph visualization

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

## Candidate-knowledge workflow

1. New or changed source material is indexed.
2. A model may extract candidate knowledge.
3. Candidates receive type, confidence, and evidence.
4. The user approves, edits, merges, rejects, or deletes each candidate.
5. Approved knowledge becomes available to retrieval.
6. Project DNA and other derived views are regenerated.
7. Drift checks compare new candidates with approved knowledge and surface conflicts for review.

## Next engineering milestone

Phase 2 may introduce proposed knowledge objects and evidence references through new repository and IPC methods. It must not bypass the Phase 1 service boundary or allow model output to mutate approved state silently.
4. Approve or reject the proposal.
5. Query approved project knowledge through an internal service boundary.
6. Render Files and Graph views from the same stored entities and relationships.

This slice proves the product architecture before expanding the interface or adding model-provider integrations.
