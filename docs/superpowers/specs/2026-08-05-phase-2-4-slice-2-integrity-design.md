# Phase 2.4 — Slice 2: Knowledge Integrity

Status: **Approved design** (2026-08-05). Base: `phase-2-4-slice-2` branched from Slice 1 tip `0ebd0b9`.

## Goal

Make project knowledge self-validating through **deterministic** integrity analysis. This slice is **read-only**: it reports problems; the user fixes them through the existing Knowledge, Evidence, Relationship, Merge, and Supersede workflows.

No AI, semantic inference, embeddings, fuzzy matching, automatic repair, or background analysis belongs in this slice.

## Architecture

Same strict boundary as the rest of Orbit Vault. Renderer → typed IPC → main → `VaultService` → `SqliteVaultRepository`.

### `packages/vault-core` — pure analyzer

```ts
analyzeKnowledgeIntegrity(input: IntegrityAnalyzerInput): IntegrityReport
```

Hard requirements:

- Pure function. No I/O, no SQLite, no filesystem, no randomness, no internally generated timestamps, no mutable global state.
- Identical input always produces identical output (byte-identical when serialized).
- **All** integrity rules live here.

### `packages/vault-storage` — read-only assembly

Loads, for the selected project: Knowledge Objects, Evidence Sources, Knowledge–Evidence links, Relationships, Documents, and imported managed files. Assembles a normalized `IntegrityAnalyzerInput`, calls `analyzeKnowledgeIntegrity(...)`, and returns the report.

Storage stays **completely read-only**: no persisted findings, no integrity tables, no mutations.

### `packages/vault-types` — contracts

Adds `IntegrityFinding`, `IntegrityReport`, `IntegrityAnalyzerInput` (and member types), and the IPC contract entry.

### Electron main + preload

Exposes exactly one new IPC:

```ts
window.vault.integrity.analyze(projectId)
```

- Validates project ownership; preserves project isolation.
- The renderer cannot fabricate findings and cannot supply analyzer state — it passes only a `projectId`; main assembles the input.

### Renderer

Extends the Knowledge navigation from Slice 1:

```
Active | History | Integrity
```

`Integrity` is a dedicated read-only review panel. Opening it automatically runs an analysis; a **Refresh** control re-runs it. The panel never edits data — it only routes users into existing workflows.

## Data model

```ts
type IntegrityFindingKind =
  | "missing_evidence"
  | "orphaned"
  | "broken_reference"
  | "duplicate_candidate"
  | "unanswered_question";

type IntegritySeverity = "error" | "warning";

interface IntegrityFinding {
  id: string;          // deterministic; see Stable Finding IDs
  kind: IntegrityFindingKind;
  severity: IntegritySeverity;
  subjectId: string;
  relatedIds: string[];
  message: string;
}

interface IntegrityReport {
  projectId: string;
  findings: IntegrityFinding[];
  totalCount: number;
  errorCount: number;
  warningCount: number;
  countsByKind: Record<IntegrityFindingKind, number>;
}
```

The report contains **no** generated timestamp — that would break byte-identical determinism. The renderer may display a "Last analyzed" time it tracks separately, outside the report.

## Deterministic rules

Definition of **active**: status is `draft` or `approved` (never `superseded`, `archived`, or `trashed`).

### 1. Broken reference — `error` (or `warning` for archived/trashed)

Fires when a relationship endpoint **or** an evidence endpoint is: missing, unresolved, or cross-project. Severity `error`.

If the endpoint exists but is `archived` or `trashed` (not truly missing), emit `warning` instead, using the mixed-severity model. The message always states the endpoint's state.

### 2. Missing evidence — `error`

Fires only when a Knowledge Object is **approved AND active** and has **zero** attached evidence. Draft objects are never flagged — drafts are expected to be incomplete.

### 3. Orphaned — `warning`

Fires when an **active** object has **zero** evidence **and** zero incoming **and** zero outgoing relationships. Superseded / archived / trashed objects are ignored.

### 4. Duplicate candidate — `warning`

Fires when two **active** Knowledge Objects of the **same type** either:

- share a `duplicates` relationship, **or**
- have normalized-identical titles.

Title normalization: Unicode normalize (NFC) → lowercase → trim → collapse internal whitespace to single spaces → remove simple terminal punctuation (`. , ; : ! ?`).

No embeddings, fuzzy matching, semantic similarity, or AI. Emit exactly **one** finding per unordered pair — never both A→B and B→A. `subjectId` is the lexicographically smaller id; the partner is in `relatedIds`.

### 5. Unanswered question — `warning`

Fires when an **active** object of type `question` has no valid `answers` relationship.

**Canonical `answers` direction:** the answering object is the source, the question is the target — `(answer) --answers--> (question)`. A question is answered iff at least one relationship exists with `relationshipType === "answers"` and `targetId === question.id` whose source resolves to an existing same-project entity. This direction is enforced consistently across the rule and its tests.

## Stable finding IDs

Deterministic, derived from: `projectId` + `RULE_VERSION` + `kind` + `subjectId` + sorted `relatedIds`. Never UUIDs, timestamps, or random values. The same Vault state always yields the same finding ids. `RULE_VERSION` is a module constant bumped only when rule semantics change.

## Ordering

Findings are always sorted by, in order:

1. Severity — explicit order: `error` before `warning`.
2. Finding kind.
3. Subject id.
4. Related ids (joined, sorted).
5. Finding id.

The serialized report is byte-identical for identical Vault states.

## Integrity view (renderer)

- Auto-analyzes on open; **Refresh** re-runs.
- Summary: total, error count, warning count.
- Findings grouped by kind. Each row shows: severity, message, subject, related entities, and the appropriate action:
  - `missing_evidence` → open Attach Evidence for the subject.
  - `duplicate_candidate` → open the Slice 1 Merge dialog with the pair pre-selected.
  - `orphaned` → open the Knowledge Inspector on the subject.
  - `unanswered_question` → open the question with the relationship editor.
  - `broken_reference` → navigate to the affected object/relationship when possible.

### Empty and failure states

- **No findings** (healthy project): "No integrity issues detected."
- **Empty project** (no knowledge): distinct, calm empty state.
- **Missing project**: handled without crashing.
- **Analyzer failure**: surfaced through the existing `onError` path; the panel does not wedge.

## Testing (test-first)

Rule/analyzer unit tests (pure, in `vault-core`):

- Approved object without evidence → flagged.
- Draft without evidence → **not** flagged.
- Orphaned object → flagged; superseded/archived/trashed ignored.
- Duplicate via `duplicates` relationship.
- Duplicate via normalized-identical title.
- Duplicate pair emitted only once.
- Unanswered question flagged; answered question not.
- Missing relationship endpoint → error.
- Cross-project relationship endpoint → error.
- Missing evidence source endpoint → error.
- Cross-project evidence link → error.
- Archived/trashed endpoint → warning behavior.
- Stable deterministic finding ids.
- Stable deterministic ordering.
- Byte-identical serialized reports for identical input.
- Project isolation (never flags cross-project as duplicate).
- Analyzer performs no mutations (input unchanged after call).

Integration (`vault-storage`): seed a project with each violation, run `analyzeIntegrity(projectId)`, assert findings and read-only behavior.

Static UI regression: extend `scripts/phase2-lifecycle-ui-regression.mjs` (or a sibling script) to assert the Integrity panel contracts — the `Active | History | Integrity` switch, `.integrity.analyze(` call, per-kind action routing (including merge reuse), and Integrity CSS selectors.

**All existing 26 tests must remain green.**

## Scope constraints (explicitly out)

AI, embeddings, semantic duplicate detection, drift detection, automatic repair, automatic merge, automatic evidence attachment, persisted findings, background analysis, file watching.

## Design principles

The Integrity system reports facts. It never guesses, never mutates project data, and remains fully deterministic. Every identical Vault state always produces the exact same Integrity Report. The user remains in complete control of resolving every finding.

## SDD task breakdown (for the implementation plan)

1. **Types + pure analyzer** in `vault-core` with the full rule set; rule unit tests (RED → GREEN).
2. **Storage assembly** (`analyzeIntegrity`) + integration tests.
3. **IPC + preload** surface with ownership/isolation validation.
4. **Integrity UI** panel, navigation switch, per-finding fix routing, and static regression.
