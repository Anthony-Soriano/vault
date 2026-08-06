# Phase 2.4 Knowledge Integrity Design

Status: approved architecture, pending implementation plan  
Date: 2026-08-05

## Objective

Phase 2.4 makes Knowledge Objects trustworthy through deterministic lifecycle operations, immutable history, preserved provenance, and integrity reporting. It is delivered in two controlled slices:

1. Slice 1: history, evidence-link normalization, supersede, and merge.
2. Slice 2: deterministic integrity analysis and the integrity-review UI.

No AI inference, semantic similarity model, automatic text combination, or destructive Knowledge deletion is included.

## Governing principles

- Knowledge Objects have stable identities.
- History is append-only through normal application code.
- Lifecycle operations are explicit domain actions rather than ordinary edits.
- Superseded objects remain inspectable and searchable through History.
- Evidence Sources are canonical records; Knowledge Objects attach to them through links.
- Merges preserve provenance and use one atomic SQLite transaction.
- Multi-record operations share an `operation_id`.
- All detection and mutation behavior is deterministic and user-controlled.

## Slice 1: immutable lifecycle

### Schema migration

Add a repeatable migration that introduces the following structures.

#### `knowledge_object_history`

- `history_id TEXT PRIMARY KEY`
- `knowledge_object_id TEXT NOT NULL`
- `operation_id TEXT NOT NULL`
- `event_type TEXT NOT NULL`
- `before_snapshot TEXT NULL`
- `after_snapshot TEXT NULL`
- `actor_type TEXT NOT NULL` constrained to `user`, `system`, or `ai`
- `actor_id TEXT NULL`
- `reason TEXT NULL`
- `created_at TEXT NOT NULL`

History rows are never updated or deleted through repository or service APIs. Foreign-key deletion cascade is intentionally avoided so history cannot disappear with a current entity. Application lifecycle rules do not expose permanent Knowledge deletion.

Each snapshot is versioned JSON containing the complete Knowledge aggregate at that moment:

- schema version
- full Knowledge Object fields
- attached Evidence link references
- incoming relationships
- outgoing relationships

This captures every relationship redirect and evidence transfer in the affected objects' before/after state while keeping one coherent audit model.

#### `knowledge_evidence_links`

- `link_id TEXT PRIMARY KEY`
- `knowledge_object_id TEXT NOT NULL`
- `evidence_source_id TEXT NOT NULL`
- `original_knowledge_object_id TEXT NOT NULL`
- `operation_id TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- unique constraint on `(knowledge_object_id, evidence_source_id)`

`evidence_sources` becomes independent from current Knowledge ownership. Existing Evidence Source IDs and provenance fields remain unchanged. The migration creates one link for every existing evidence record, setting both current and original Knowledge IDs to the previous owner. The old ownership column is removed by rebuilding the SQLite table safely inside the migration.

Moving evidence during merge updates only the link's current `knowledge_object_id`. It never recreates the Evidence Source and never changes `original_knowledge_object_id`.

#### `knowledge_objects`

Add nullable `superseded_by_id`, referencing the surviving Knowledge Object when applicable. A project-boundary validation prevents cross-project supersession.

### History events

Record a history row for every meaningful lifecycle event:

- `created`
- `edited`
- `approved`
- `archived`
- `restored`
- `superseded`
- `merged`
- `baseline_migrated`

Creation has a null before snapshot. Every other event stores both snapshots. No history entry is written for an update that produces no meaningful state change.

Because pre-Phase-2.4 edits cannot be reconstructed honestly, migration writes one `baseline_migrated` system event for each existing Knowledge Object. Its before snapshot is null, its after snapshot is the complete state available at migration time, and its reason states that earlier history predates immutable tracking. The migration never fabricates historical edits.

Single-object operations also receive a unique `operation_id`. A merge uses one shared ID across all source and target history rows.

Actor defaults to `user` for renderer-initiated actions. Migration/bootstrap activity uses `system`. `ai` is reserved for the future and is not accepted from untrusted renderer input in this phase.

### Explicit lifecycle operations

The domain service adds first-class methods for:

- approving a Knowledge Object
- archiving a Knowledge Object
- restoring an archived Knowledge Object
- superseding a Knowledge Object
- merging one or more source Knowledge Objects into a selected target
- listing history for a Knowledge Object or operation
- previewing a merge

Ordinary update methods can change title, body, type, confidence, and folder placement only. They cannot change lifecycle status or `superseded_by_id`.

### Supersede behavior

Supersede requires an active source object and an optional active replacement in the same project.

The operation:

1. validates both objects and project boundaries;
2. records the source aggregate before mutation;
3. sets source status to `superseded` and stores `superseded_by_id` when supplied;
4. preserves its Evidence links and relationships in place;
5. records the aggregate after mutation;
6. commits atomically.

Superseded objects disappear from normal active Knowledge lists and global active search. They remain accessible from History and direct history navigation.

### Merge preview

Merge preview is read-only and deterministic. It returns:

- target summary;
- source summaries;
- Evidence links that will transfer;
- incoming and outgoing relationships that will redirect;
- links that would become self-links and be rejected;
- exact duplicate relationships that will collapse;
- validation conflicts that prevent execution.

Preview and execution share the same planning function so the displayed plan matches mutation behavior. Execution revalidates current state inside the transaction to prevent stale-preview writes.

### Merge execution

Merge requires one active target and one or more distinct active sources in the same project. It never combines title or body text.

Inside one SQLite transaction:

1. revalidate target, sources, statuses, and project boundaries;
2. create a shared `operation_id`;
3. capture target and source aggregate snapshots;
4. move source Evidence links to the target while preserving original ownership;
5. redirect every incoming and outgoing source relationship to the target;
6. preserve relationship type, author, and creation metadata when redirection yields a unique relationship;
7. omit redirected self-links;
8. collapse exact duplicate relationships deterministically, keeping the oldest relationship and then lowest ID as a stable tie-breaker;
9. mark every source `superseded` with `superseded_by_id` set to the target;
10. update the target timestamp without changing its text;
11. capture after snapshots and append grouped history rows;
12. commit.

Any error rolls back object changes, Evidence-link moves, relationship rewrites, and history writes.

### Types, service, and IPC

Shared types define:

- history event and actor types;
- versioned aggregate snapshots;
- history records and filters;
- supersede input;
- merge preview/input/result;
- Evidence link records.

The core layer owns validation and exposes explicit lifecycle methods. Storage owns migration, transactions, aggregate capture, relationship rewrite planning, and deterministic persistence. Electron main registers typed IPC handlers. Preload exposes only the approved lifecycle and history methods to the sandboxed renderer.

### Knowledge Inspector

The Inspector adds:

- a History section ordered newest-first and groupable by operation;
- Restore for archived objects;
- Supersede action with confirmation;
- Merge action with target/source selection and confirmation;
- a merge preview showing transferred evidence, redirected relationships, collapsed duplicates, rejected self-links, and blocking conflicts.

Confirmation uses an application modal rather than a native blocking dialog so the complete preview remains visible. Controls disable while an operation is pending. A failed operation leaves the current view unchanged and displays the existing error surface.

Normal lists exclude superseded objects. The History surface can locate and inspect them without reintroducing them to active project knowledge.

## Slice 2: deterministic integrity analysis

### Integrity issue model

Introduce derived, non-canonical integrity findings with:

- deterministic issue ID derived from project, rule, and entity IDs;
- project ID;
- rule code;
- severity;
- affected entity references;
- concise explanation;
- deterministic supporting details;
- available user actions.

Findings are recalculated from canonical state and are not a second source of truth. Dismissal/suppression is excluded until a durable review policy is designed.

### Initial deterministic rules

- approved Knowledge with no Evidence links;
- active Knowledge with neither Evidence nor relationships;
- unavailable or missing Evidence sources;
- relationship endpoints that no longer resolve;
- active relationship pointing to superseded Knowledge when a canonical replacement exists;
- explicit `duplicates` relationships between active Knowledge Objects;
- explicit `contradicts` relationships between approved decisions or preferences;
- incompatible explicit lifecycle states where deterministically provable.

The system does not infer semantic duplicates or contradictions from text in Phase 2.4.

### Integrity review UI

Add a project-scoped Integrity view within Knowledge that:

- groups findings by severity and rule;
- links directly to affected Knowledge, Evidence, and relationships;
- offers only deterministic corrective actions already supported by lifecycle APIs;
- refreshes after canonical changes;
- clearly distinguishes warnings from corruption or blocked operations.

### Integrity service boundary

Integrity analysis is a pure domain operation over a canonical project snapshot. Storage supplies required entities; the core analyzer produces sorted findings. IPC exposes project-scoped analysis only. The renderer never performs authoritative integrity checks independently.

## Testing strategy

### Migration tests

- Existing Vault migrations remain repeatable.
- Existing Evidence IDs survive normalization.
- Each migrated Evidence record receives exactly one link with original ownership.
- History and supersession schema survive restart.

### Slice 1 domain/storage tests

- create, meaningful edit, approve, archive, restore, supersede, and merge append correct immutable history;
- no-op edits append no history;
- supersede preserves Evidence and relationships;
- merge preserves target identity and text;
- Evidence transfers preserve Evidence IDs and original owner provenance;
- incoming and outgoing relationships redirect correctly;
- self-links disappear and duplicates collapse deterministically;
- relationship author and creation metadata survive retained redirects;
- cross-project, stale, self-target, archived, or already-superseded merge inputs fail;
- injected mid-merge failure proves complete rollback;
- restart preserves lifecycle state and history;
- normal lists exclude superseded objects while history can retrieve them.

### Slice 1 UI tests

- History renders grouped operations.
- Supersede and Merge require confirmation.
- Preview matches the submitted operation.
- pending actions disable controls.
- failure leaves selection and data intact.

### Slice 2 tests

- every rule produces stable issue IDs and ordering;
- rules produce no false semantic inference;
- resolved canonical problems remove findings on refresh;
- project isolation is enforced;
- integrity navigation resolves affected entities.

## Compatibility and rollout

- The migration runs on Vault open and remains repeatable.
- Existing IPC consumers continue to receive Evidence Sources through compatibility mapping while the renderer transitions to Evidence links.
- Atlas continues to derive Knowledge placement from canonical folder assignment or attached Evidence without becoming a source of truth.
- Search behavior changes only by excluding superseded objects from normal results and adding explicit History search.
- No permanent Knowledge deletion API is introduced.

## Completion criteria

Slice 1 is complete when lifecycle operations, immutable aggregate history, canonical Evidence links, transactional deterministic merge, Inspector controls, and regression tests all pass across restart.

Slice 2 is complete when all listed deterministic rules are available through a project-scoped review UI, findings are stable and actionable, and the full regression/build/package baseline passes.
