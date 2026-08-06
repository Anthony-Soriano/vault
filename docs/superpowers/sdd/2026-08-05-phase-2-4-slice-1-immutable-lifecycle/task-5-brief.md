# Task 5: Typed IPC and preload lifecycle bridge

Worktree: `C:\Users\Bando\Documents\VAULT\.worktrees\phase-2-4-slice-1`

## Context

Lifecycle storage/core operations are complete through `d3e4f01`. This task exposes them through the existing typed, sandboxed Electron boundary. Do not change renderer UI.

## Files

- Modify `packages/vault-types/src/index.ts`.
- Modify `apps/vault-desktop/electron/main/main.ts`.
- Modify `apps/vault-desktop/electron/preload/preload.cts`.
- Create `scripts/phase2-lifecycle-ui-regression.mjs`.

## Renderer API contract

Add exact methods to `VaultRendererApi.knowledge`:

```ts
restore(id: string, reason?: string | null): Promise<ApiResult<KnowledgeObject>>;
supersede(input: SupersedeKnowledgeInput): Promise<ApiResult<KnowledgeObject>>;
previewMerge(input: MergeKnowledgeInput): Promise<ApiResult<MergeKnowledgePreview>>;
merge(input: MergeKnowledgeInput): Promise<ApiResult<MergeKnowledgeResult>>;
history(knowledgeObjectId: string): Promise<ApiResult<KnowledgeHistoryRecord[]>>;
```

Import the needed lifecycle types in the same package file only where necessary.

## IPC channels

Register exact handlers in Electron main using the existing `handle(channel, operation, mutates)` helper:

```ts
handle("vault:knowledge:restore", (id, reason) => vault.knowledge.restore(id, reason), true);
handle("vault:knowledge:supersede", input => vault.knowledge.supersede(input), true);
handle("vault:knowledge:merge-preview", input => vault.knowledge.previewMerge(input));
handle("vault:knowledge:merge", input => vault.knowledge.merge(input), true);
handle("vault:knowledge:history", id => vault.knowledge.history(id));
```

Restore, supersede, and merge must notify renderer changes only on successful mutation. Preview and history are read-only and must not notify.

Mirror exact method signatures/channels in `preload.cts` through the existing typed `call(...)` bridge. Do not expose raw `ipcRenderer`, Node, SQLite, or filesystem APIs.

## Static regression script

Follow the style of existing scripts in `scripts/`. Read main and preload source from disk. Assert:

- each of the five channel names exists in both main and preload;
- each exact main handler appears once;
- restore/supersede/merge pass `true` to the mutation wrapper;
- preview/history do not pass `true`;
- each lifecycle bridge method exists in preload;
- `packages/vault-types/src/index.ts` contains each exact method contract;
- no lifecycle method is added to `OrbitDesktopBridge`.

The script should throw/assert with a clear missing-contract message and print a concise success line.

## TDD and verification

1. Create the static regression first and run it for RED; it must fail on missing channels/contracts.
2. Add types, handlers, and preload methods.
3. Run `node scripts/phase2-lifecycle-ui-regression.mjs` for GREEN.
4. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
5. Run `git diff --check`; self-review mutating flags, exact channel parity, and sandbox boundary.
6. Commit scoped files with message `feat: expose knowledge lifecycle IPC`.

## Global constraints

- Renderer remains sandboxed behind typed preload IPC.
- No direct native access or actor spoofing.
- Read-only operations never emit change notifications.
- No UI, database, lifecycle semantics, Atlas, or documentation changes.
- Preserve all 26 existing tests.

## Report

Write full report to sibling `task-5-report.md`: status, files, RED/GREEN evidence, channel matrix, full verification, commit hash, self-review, concerns. Return only status, hash, one-line tests, concerns.
