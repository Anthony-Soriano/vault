# Orbit Vault

> A local-first AI knowledge system that turns a project's files, notes, and decisions into an editable, transparent, evidence-backed memory layer — fully owned on your machine.

**Status:** `v0.2.0` — Phase 2 complete (manual knowledge system: documents, knowledge objects, evidence, typed relationships, lifecycle, and deterministic integrity). No AI subsystem yet; Phase 3 (AI proposals) is the next milestone.

**Product rule:** Documents are source material. Knowledge objects are interpretations. Evidence connects the two. Users stay in control — AI may propose, never silently mutate.

## Canonical documentation

Read in order (agents: see the rules in [`AGENTS.md`](AGENTS.md) first):

1. [`AGENTS.md`](AGENTS.md) — operating rules for every contributor/model.
2. [`PROJECT.md`](PROJECT.md) — what Orbit Vault is and who it's for.
3. [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) — the complete product contract.
4. [`ARCHITECTURE.md`](ARCHITECTURE.md) — verified technical reality.
5. [`DECISIONS.md`](DECISIONS.md) — locked decisions and why.
6. [`ROADMAP.md`](ROADMAP.md) — the ordered journey and definitions of done.
7. [`CURRENT_PHASE.md`](CURRENT_PHASE.md) — the operational center; only implement what's here.

Supporting: [`docs/SETUP.md`](docs/SETUP.md) · [`docs/BACKLOG.md`](docs/BACKLOG.md) · [`docs/architecture.md`](docs/architecture.md) (deep reference) · [`docs/superpowers/`](docs/superpowers) (specs & plans). Superseded material lives in [`docs/history/`](docs/history).

## Quick start

Requires Node.js ≥ 22.13 and pnpm 11.9.0. Full details in [`docs/SETUP.md`](docs/SETUP.md).

```bash
pnpm install
pnpm dev          # Electron + Vite hot reload (launches the app)
pnpm typecheck    # tsc across electron + renderer
pnpm test         # persistence, lifecycle, integrity, Atlas regression (49 tests)
pnpm build        # compile electron main + preload + renderer
pnpm package      # Windows installer
```

Static UI/IPC contract check: `node scripts/phase2-lifecycle-ui-regression.mjs`.

## Project layout

```
packages/vault-types      shared types + IPC contract
packages/vault-core       validation, use cases, pure analyzers
packages/vault-storage    SQLite (node:sqlite) + local-file persistence
apps/vault-desktop        Electron main/preload + React/Vite renderer
docs/                     canonical set is at repo root; supporting & history here
tests/                    Node built-in test runner suites
```

## Architecture in one line

`Electron main → typed IPC → preload (window.vault) → React renderer → VaultService → SqliteVaultRepository`. The renderer never touches Node, SQLite, or the filesystem directly. See [`ARCHITECTURE.md`](ARCHITECTURE.md).
