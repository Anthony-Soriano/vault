# Task 6: Inspector History, Supersede, and Merge UI

Worktree: `C:\Users\Bando\Documents\VAULT\.worktrees\phase-2-4-slice-1`

## Context

All lifecycle APIs are available through typed `window.vault` at `a4c937d`. This task adds the user-facing Inspector workflows only. Follow the established dark Orbit Vault visual language; do not redesign the application shell or Atlas.

## Files

- Modify `apps/vault-desktop/renderer/src/KnowledgeView.tsx`.
- Modify `apps/vault-desktop/renderer/src/styles.css`.
- Modify `scripts/phase2-lifecycle-ui-regression.mjs`.

## Design direction

Subject: a local project-memory audit surface for technical users. Its single job is to make irreversible-looking lifecycle actions visibly safe, previewable, and traceable.

Use the existing palette and typography rather than introducing generic dashboard styling:

- `Vault charcoal #181922` for list/modal foundations;
- `Inspector ink #1a1b23` for records;
- `Boundary slate #343744` for structure;
- `Evidence blue #aebfff` for navigable identity;
- `Approval green #92dfb2` for safe state;
- `Lifecycle amber #efc477` for consequential actions.

Signature element: an operation-grouped vertical audit spine. Events sharing one `operationId` appear as one connected operation group, so a merge reads as one deliberate action rather than unrelated log rows. Keep surrounding decoration restrained.

No new fonts or dependencies. Preserve visible keyboard focus and respect existing responsive behavior. Use plain, action-specific copy.

## Historical Knowledge access

Normal active list remains unchanged. Add a compact `Active | History` switch in the Knowledge sidebar.

When History mode opens, query project-scoped `knowledge.list` for explicit `archived` and `superseded` statuses and combine them with active snapshot Knowledge. This makes superseded objects locatable without returning them to normal active results. Historical search is local over title/body/type/status for this combined set.

Selection must resolve against both active snapshot objects and loaded historical objects. Archived and superseded objects are read-only; archived objects offer Restore, superseded objects show `Superseded by <target>` when the target is known. Historical objects must never appear in Atlas or the Active list.

## History panel

For any selected object, call `window.vault.knowledge.history(selected.id)` when selected ID or `updatedAt` changes.

Render newest-first. Group adjacent records sharing `operationId` inside the vertical audit spine. Show:

- human label for event;
- actor type;
- formatted timestamp;
- optional reason;
- before → after status/title summary;
- expandable details listing Evidence-link IDs and incoming/outgoing relationship IDs from snapshots.

Never display raw JSON by default. Show loading and empty states with useful copy.

## Inspector actions

- Draft/approved: existing Save/Approve/Archive plus `Supersede` and `Merge knowledge`.
- Archived: read-only form plus `Restore`.
- Superseded: read-only form, no restore/edit/archive/merge actions.
- Disable all lifecycle controls while any lifecycle request is pending.
- Errors go through existing `onError`; on failure preserve selection, modal, and entered reason.

## Supersede modal

Use an application modal on `.dialog-backdrop`, not `window.confirm` or a native blocking dialog.

Show source identity/status, optional replacement selector containing same-project draft/approved objects other than source, optional reason, and consequences: source leaves Active view; Evidence and relationships stay attached; History remains available.

The confirmation button text is `Supersede knowledge`. It explicitly calls `window.vault.knowledge.supersede`. On success refresh, switch sidebar to History, keep the source selected using returned data, reload history, and close modal.

## Merge modal and preview

The currently selected draft/approved object is the fixed canonical target. Let the user select one or more other active same-project Knowledge Objects as sources. Include optional reason.

Preview is required before confirmation. Call `window.vault.knowledge.previewMerge` whenever the source selection changes, debounced or through an explicit `Preview merge` button. Display:

- canonical target;
- source objects;
- `Evidence transferred` with each Evidence-link ID/source label;
- `Relationships redirected` with endpoint/type summary;
- `Duplicate links collapsed` conflicts;
- `Self-links removed` conflicts;
- blocking errors.

Disable `Merge knowledge` until preview exists, at least one source is selected, no blocking error exists, and no request is pending. Confirmation calls `window.vault.knowledge.merge` with exactly the previewed target/source IDs and current reason. On success refresh, select canonical target, remain in Active mode, reload target history, and close modal. Do not combine or edit text.

## Modal/accessibility behavior

- Modal has `role="dialog"`, `aria-modal="true"`, labelled title, visible Cancel and explicit action.
- Escape closes only when no operation is pending.
- Backdrop click does not accidentally confirm.
- Buttons and form controls retain visible focus treatment.
- Pending action label communicates progress (`Superseding…`, `Merging…`, `Restoring…`).

## Static UI regression

Extend `scripts/phase2-lifecycle-ui-regression.mjs` before production changes. Assert source contains:

- visible labels: `History`, `Restore`, `Supersede`, `Merge knowledge`, `Evidence transferred`, `Relationships redirected`, `Duplicate links collapsed`, `Self-links removed`;
- calls to `.history(`, `.restore(`, `.supersede(`, `.previewMerge(`, `.merge(`;
- `role="dialog"` and `aria-modal="true"`;
- no `window.confirm`;
- CSS selectors `.knowledge-history`, `.history-operation`, `.lifecycle-modal`, `.merge-preview`, `.merge-conflicts`.

Keep all existing Task 5 IPC assertions.

## TDD and verification

1. Extend static regression and run for RED on missing UI contracts.
2. Implement historical selection, history panel, modals, actions, and styles.
3. Run static regression for GREEN.
4. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
5. Run `git diff --check`; self-review status gating, preview/execute parity, error retention, accessibility, History access, and responsive styles.
6. Commit scoped files with message `feat: add knowledge lifecycle inspector workflows`.

## Global constraints

- Every Supersede/Merge action requires explicit application-modal confirmation.
- Preview is required and must match submitted target/source IDs.
- Superseded objects remain discoverable only through History mode/direct history.
- No database/domain/IPC changes, text combination, Atlas changes, or new dependencies.
- Preserve all 26 tests and successful production build.

## Report

Write full report to sibling `task-6-report.md`: status, files, RED/GREEN evidence, design decisions, state transitions, full verification, commit hash, self-review, concerns. Return only status, hash, one-line tests, concerns.
