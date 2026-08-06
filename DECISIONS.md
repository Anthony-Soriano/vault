DECISIONS.md
Locked decisions and why:

Each decision is binding. Changing one requires explicit owner approval and an update here (Rules 2, 4).

## Local-first
State lives on the user's machine in a chosen Vault directory; no cloud is required to use the product. **Why:** users must fully own and control their project memory; durability and privacy without a service dependency.

## Ordinary files remain content truth
Document/file **content** lives as ordinary local files; the database stores identity, structure, and relationships — never the sole copy of content. **Why:** content stays portable, inspectable, and editable outside the app; the DB indexes reality rather than owning it.

## AI only proposes
When AI exists (Phase 3), it generates candidate knowledge with citations and never writes canonical state directly. **Why:** models are fallible; letting them mutate memory silently would destroy the product's trust model.

## Users approve mutations
Nothing becomes canonical project memory without an explicit user action (approve, supersede, merge, etc.). **Why:** the user is the authority on what their project "knows"; approval is the gate that keeps the store trustworthy.

## Provenance is mandatory
Every interpretation (and every future model-generated object) must carry evidence linking it to source material. **Why:** knowledge without traceable evidence is indistinguishable from a guess.

## Graph is a view, not another database
Atlas is a deterministic projection of canonical entities; it never stores or defines data, and interactions never become the primary organization mechanism. **Why:** a second source of truth would create drift and undermine the canonical model.

## Integrations use an API rather than direct SQLite access
External consumers (including the future Orbit assistant) go through the stable Vault service API, never reading/writing `vault.db` directly. **Why:** the database schema is an implementation detail; a stable API preserves invariants and lets storage evolve.

## Determinism before semantics (Phase 2.4)
Integrity detection covers only objective, rule-based problems (missing evidence, broken references, duplicates by explicit link or identical title, unanswered questions, orphans). Semantic/AI conflict detection is deferred. **Why:** deterministic checks are reproducible and trustworthy; semantic inference belongs behind the AI gate so it can't silently assert "truth."

## Merge keeps one object canonical (Phase 2.4)
Merging duplicates retains a chosen target as canonical, marks the others `superseded`, and transfers their evidence and relationships — rather than creating a new combined object. **Why:** preserves stable identity and minimizes relationship churn; history remains fully traceable.

## History is an immutable audit timeline (Phase 2.4)
Lifecycle events (create/edit/approve/archive/restore/supersede/merge) are recorded as immutable before/after snapshots. Version *restoration* is intentionally not offered yet. **Why:** an inspectable, tamper-evident record without complicating merge safety.

## node:sqlite as the database engine
Persistence uses Node 22's built-in `node:sqlite`, not a native module. **Why:** no native build/ABI headaches across machines; simpler packaging and transfer.
