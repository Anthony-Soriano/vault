# Task 6 Report: Inspector History, Supersede, and Merge UI

## Status

**Verification complete; changes intentionally UNCOMMITTED pending user review.**

Task 6's baseline implementation is committed at `df9b5e8` (`feat: add knowledge lifecycle inspector workflows`). Four follow-up **safety fixes** sit uncommitted in the working tree. This report covers verification of those fixes, which the prior (Codex) session could not run because elevated execution was unavailable until 2026-08-08.

## Files (uncommitted working changes)

| File | Change |
|---|---|
| `apps/vault-desktop/renderer/src/KnowledgeView.tsx` | +181 / −35 — race guards, preview parity, modal focus-trap/portal, integrity effects |
| `apps/vault-desktop/renderer/src/styles.css` | +1 — `body>.lifecycle-backdrop{z-index:1000}` for the portaled backdrop |
| `scripts/phase2-lifecycle-ui-regression.mjs` | +46 — static assertions locking in all four safety contracts |

Total: 3 files, +193 / −35.

## The four safety fixes

1. **Stale-async race guards.** Historical-knowledge and evidence loads now carry a monotonic request-generation token (`historicalRequest`, `evidenceRequest`) plus identity refs (`projectIdRef`, `selectedKnowledgeIdRef`). A response from a superseded project or selection can no longer commit into state. Evidence became selection-owned via `evidenceState = { knowledgeObjectId, items }`, and the render-time gate `const evidence = selected && evidenceState.knowledgeObjectId === selected.id ? evidenceState.items : []` guarantees evidence never bleeds across objects. Historical list is defensively re-filtered by `projectId`.

2. **Merge preview⇄execute parity.** A `mergePreviewSnapshotKey` derived from `targetId + sourceIds + each object's status + updatedAt` is captured with each preview. `canMerge` now additionally requires `mergePreview.target.id === input.targetId`, `sameIdSet(preview.sources, input.sourceIds)`, and `mergePreviewSnapshotKey === mergeSnapshotKey`. An effect clears the preview whenever the snapshot key changes. The merge plan shown is provably the plan submitted; any underlying change invalidates it.

3. **Modal focus-trap + body portal.** Both lifecycle modals render through `createPortal(..., document.body)`, escaping ancestor stacking/overflow contexts. On open, `.vault-app` is set `inert`; Tab is contained (wrap first/last focusable), `focusin` pulls stray focus back, and focus is restored to the triggering control (captured in `modalTriggerRef`) on close, with a sensible fallback if the trigger unmounted. Escape reads `lifecyclePendingRef.current` to avoid a stale-closure that could close mid-operation.

4. **Modal/selection integrity on project switch.** An effect resets the modal if its `sourceId`/`targetId` object no longer exists; the project-change effect also clears the modal and deselects a selected object that no longer belongs to the active project.

## RED / GREEN evidence

- **RED:** The extended `scripts/phase2-lifecycle-ui-regression.mjs` adds three assertion groups — `raceGuards` (11), `previewParity` (4), `modalSafety` (9), plus the `body>.lifecycle-backdrop` z-index style assertion. Run against the pre-fix source these fail (the guarded symbols/patterns do not exist).
- **GREEN:** Against the current working tree, `node scripts/phase2-lifecycle-ui-regression.mjs` → `Lifecycle IPC/preload/UI regression checks passed.` (exit 0). All Task 5 IPC assertions retained.

## Full verification (run 2026-08-05 in this worktree)

| Gate | Command | Result |
|---|---|---|
| Types | `pnpm typecheck` | PASS (exit 0) |
| Tests | `pnpm test` | **26/26 pass**, 0 fail |
| Build | `pnpm build` | PASS — main 73.46 kB, preload 2.90 kB, renderer 52 modules / 267.37 kB |
| Whitespace | `git diff --check` | clean (only LF→CRLF advisory warnings) |
| Static UI | `node scripts/phase2-lifecycle-ui-regression.mjs` | PASS |

Environment note: this machine has no `pnpm` on PATH (only Node + corepack). Commands were run via a `corepack pnpm` shim. The worktree's `node_modules` is fully linked (top-level `vite` present), unlike the main checkout.

## Self-review against brief

- **Status gating:** archived → Restore only; superseded → fully read-only; draft/approved → Save/Approve/Archive/Supersede/Merge. All lifecycle controls disabled while any request pends. ✔
- **Preview/execute parity:** enforced by snapshot key + id-set parity (fix #2). ✔
- **Error retention:** failures route through `onError`; selection, modal, and entered reason are preserved (no reset on catch). ✔
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, labelled titles, visible Cancel + explicit action, focus trap, Escape gated on pending, backdrop mousedown does not confirm. ✔
- **History access:** Active | History switch; History combines archived + superseded (project-scoped) without returning them to Active or Atlas. ✔
- **Responsive styles:** modal width `min(620/780px, 100vw−36px)`, sticky action bar; no shell/Atlas redesign. ✔

## State transitions exercised in UI

draft/approved → (supersede) → superseded (read-only, shows "Superseded by …" when known); draft/approved → (merge, N sources) → sources superseded into canonical target; active → (archive) → archived → (restore) → prior active status. Superseded objects are reachable only through History.

## Commit hash

**None — uncommitted by user decision.** User elected to review the diff before any commit. Note: the brief's suggested message `feat: add knowledge lifecycle inspector workflows` is already used by `df9b5e8`; a distinct message (e.g. `fix: harden knowledge lifecycle inspector safety guards`) is recommended when these are eventually committed.

## Concerns

- A few refs are assigned during render (`lifecyclePendingRef.current`, `projectIdRef.current`, `selectedKnowledgeIdRef.current`). This is the accepted "latest-value mirror" pattern, read only from async callbacks/handlers — safe, but flagged for reviewer awareness.
- Focus-trap uses `HTMLElement.inert`; supported in current Electron/Chromium, but worth a manual keyboard pass in the running app.
- Verification is static + unit + build only. No runtime click-through of the actual Supersede/Merge modals was performed in this session; a manual pass (open both modals, confirm focus trap, preview-then-merge, project-switch mid-modal) is advisable before merge.
