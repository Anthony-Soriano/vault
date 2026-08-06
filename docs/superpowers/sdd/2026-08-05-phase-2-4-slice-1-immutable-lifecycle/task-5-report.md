# Task 5 Report: Typed IPC and preload lifecycle bridge

## Status

Complete.

## Files changed

- `packages/vault-types/src/index.ts`
- `apps/vault-desktop/electron/main/main.ts`
- `apps/vault-desktop/electron/preload/preload.cts`
- `scripts/phase2-lifecycle-ui-regression.mjs`

## TDD evidence

### RED

Created `scripts/phase2-lifecycle-ui-regression.mjs` before changing production code. Its initial execution failed as expected with:

`Missing lifecycle IPC contract: main channel vault:knowledge:restore`

### GREEN

After adding the typed API contracts, main IPC handlers, and preload bridge methods:

`node scripts/phase2-lifecycle-ui-regression.mjs`

printed `Lifecycle IPC/preload regression checks passed.`

## Channel matrix

| Renderer method | IPC channel | Main operation | Mutates / notifies |
| --- | --- | --- | --- |
| `restore(id, reason)` | `vault:knowledge:restore` | `vault.knowledge.restore(id, reason)` | Yes |
| `supersede(input)` | `vault:knowledge:supersede` | `vault.knowledge.supersede(input)` | Yes |
| `previewMerge(input)` | `vault:knowledge:merge-preview` | `vault.knowledge.previewMerge(input)` | No |
| `merge(input)` | `vault:knowledge:merge` | `vault.knowledge.merge(input)` | Yes |
| `history(knowledgeObjectId)` | `vault:knowledge:history` | `vault.knowledge.history(id)` | No |

## Full verification

- `node scripts/phase2-lifecycle-ui-regression.mjs` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — passed: 26 tests, 26 passed, 0 failed.
- `pnpm build` — passed: Electron main, preload, and renderer builds completed.
- `git diff --check` — passed.

The first sandboxed runs of typecheck, test, and build encountered Windows `EPERM` reads on installed dependency executables or dependency resolution. Re-running them outside the filesystem sandbox succeeded; this did not change project dependencies.

## Self-review

- All five lifecycle channels are present in main and preload.
- Main handlers match the requested operations exactly and occur once.
- `restore`, `supersede`, and `merge` use the existing `handle(..., true)` wrapper, so change notifications only follow successful API results.
- `previewMerge` and `history` omit the mutation flag and therefore do not notify.
- Renderer access remains behind `VaultRendererApi` and the existing typed `call(...)` bridge.
- `OrbitDesktopBridge` remains unchanged and no raw Electron, Node, SQLite, or filesystem API is exposed to the renderer.

## Commit

`a4c937d feat: expose knowledge lifecycle IPC`

## Concerns

None. The static regression deliberately validates source-level IPC contracts because the task requires exact channel and handler parity.
