# Orbit Vault

> A local-first **Project Truth Engine** that turns a project's files, notes, code, and decisions into a compact, editable, transparent, evidence-backed context layer for humans and AI — fully owned on your machine.

**Status:** `v0.3.0` — Phase 2 (manual knowledge system) and BL-03 (manual snapshot & restore) complete; **Phase 3 — AI + Project Truth Engine is active**, delivered incrementally as `v0.3.0` → `v0.3.5`. `v0.3.0` (AI Foundation) is complete: a provider-neutral, proposal-only AI service boundary exists internally in `packages/vault-core`, not yet wired to the UI. See [`.orbit/CURRENT_PHASE.md`](.orbit/CURRENT_PHASE.md).

**Product rule:** Documents are source material. Knowledge objects are interpretations. Evidence connects the two. Users stay in control — AI may propose, never silently mutate.

## Project Truth

Read in order:

1. [`AGENTS.md`](AGENTS.md) — operating rules for every contributor/model.
2. [`.orbit/PROJECT.md`](.orbit/PROJECT.md) — identity, audience, problem, thesis, principles, non-goals.
3. [`.orbit/PRODUCT_SPEC.md`](.orbit/PRODUCT_SPEC.md) — the complete product contract.
4. [`.orbit/ARCHITECTURE.md`](.orbit/ARCHITECTURE.md) — verified implemented technical reality.
5. [`.orbit/DECISIONS.md`](.orbit/DECISIONS.md) — binding decisions and rationale.
6. [`.orbit/ROADMAP.md`](.orbit/ROADMAP.md) — the ordered journey and definitions of done.
7. [`.orbit/CURRENT_PHASE.md`](.orbit/CURRENT_PHASE.md) — the only approved active implementation scope.
8. [`.orbit/BACKLOG.md`](.orbit/BACKLOG.md) — deferred ideas with no active authorization.

Where things live:

- **`README.md`** is the human entry point.
- **`AGENTS.md`** contains the operating rules for anyone (person or model) doing work.
- **`.orbit/`** is the authoritative project truth: product, architecture, decisions, roadmap, active phase, and backlog.
- **`docs/`** contains setup material, deeper references, implementation plans, and history — **not** competing canonical truth.

## Quick start

Requires Node.js ≥ 22.13 and pnpm 11.9.0. Full details in [`docs/SETUP.md`](docs/SETUP.md).

```bash
pnpm install
pnpm dev          # Electron + Vite hot reload (launches the app)
pnpm typecheck    # tsc across electron + renderer
pnpm test         # persistence, lifecycle, integrity, Atlas, backup/restore, AI foundation (85 tests)
pnpm build        # compile electron main + preload + renderer
pnpm package      # Windows installer
```

Static UI/IPC contract check: `node scripts/phase2-lifecycle-ui-regression.mjs`.

## Project layout

```
README.md                 human entry point
AGENTS.md                 operating rules
.orbit/                   authoritative project truth
  PROJECT.md  PRODUCT_SPEC.md  ARCHITECTURE.md  DECISIONS.md
  ROADMAP.md  CURRENT_PHASE.md  BACKLOG.md
packages/vault-types      shared types + IPC contract
packages/vault-core       validation, use cases, pure analyzers
packages/vault-storage    SQLite (node:sqlite) + local-file persistence
apps/vault-desktop        Electron main/preload + React/Vite renderer
docs/                     setup, deep references, plans, and history (supporting)
tests/                    Node built-in test runner suites
```

## Architecture in one line

`Electron main → typed IPC → preload (window.vault) → React renderer → VaultService → SqliteVaultRepository`. The renderer never touches Node, SQLite, or the filesystem directly. See [`.orbit/ARCHITECTURE.md`](.orbit/ARCHITECTURE.md).
