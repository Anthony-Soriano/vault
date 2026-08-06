> **HISTORICAL — SUPERSEDED.** Kept for reference only. The canonical project docs live in the repo root; start at `AGENTS.md`. Do not treat this file as current.

# Orbit Vault — Project Status & Work Log

**Snapshot date:** 2026-08-05
**App version:** `0.1.3`
**Repository:** `AnthonySoriano999/vault`
**This document is the organizing index** for Orbit Vault: what it is, what's built, who built what, where everything lives, and what comes next. For deep detail, follow the links in the [Document Index](#document-index).

---

## 1. What Orbit Vault is

A **local-first desktop knowledge system** (Electron + React/Vite + SQLite via Node's built-in `node:sqlite`). It turns files, notes, and decisions into an **editable, transparent, evidence-backed memory layer** for projects.

**Product rule (the whole thesis):**
> Documents are source material. Knowledge objects are interpretations. Evidence connects the two. **Users stay in control.** AI may eventually *propose* knowledge, but never silently mutates it.

**Five canonical entities:** Project → Document/File → Knowledge Object → Relationship → Evidence Source.

---

## 2. Status at a glance

| Aspect | State |
|---|---|
| **Phase 1** (local Vault foundation) | ✅ Complete |
| **Phase 2** (manual knowledge system) | ✅ Essentially complete — 2.4 closes the last gaps |
| **Phase 2.4 Slice 1** (lifecycle: history / supersede / merge) | ✅ Done, verified |
| **Phase 2.4 Slice 2** (deterministic integrity + review panel) | ✅ Done, verified |
| **Phase 3** (AI proposals) | ⬜ Next major milestone — not started |
| **Verification** | `pnpm typecheck` ✅ · `pnpm test` **49/49** ✅ · static UI regression ✅ · `pnpm build` ✅ |
| **Latest work branch** | `phase-2-4-slice-2` (pushed to GitHub) — contains everything below |
| **`main` branch** | Still at transfer snapshot `57890f8` — Phase 2.4 not yet merged in |

---

## 3. Architecture (one screen)

Strict one-directional boundary — the renderer never touches Node/SQLite/the filesystem directly:

```
Electron main (electron/main/main.ts)      owns native ops, dialogs, fs watcher, IPC
   ↓ typed IPC (handle "vault:*")
Preload bridge (electron/preload/preload.cts)   exposes window.vault
   ↓
React renderer (renderer/src/*.tsx)         App / KnowledgeView / GraphViewV2 / IntegrityView
   ↓
VaultService (packages/vault-core)          validation + use cases + pure analyzers
   ↓
SqliteVaultRepository (packages/vault-storage)   vault.db metadata + ordinary local files
```

**Package responsibilities:**
- `packages/vault-types` — shared types + the `VaultRendererApi` IPC contract (single source of truth for the wire).
- `packages/vault-core` — validation, use cases, repository interfaces, and pure analyzers (incl. the integrity analyzer).
- `packages/vault-storage` — SQLite migrations, local-file ops, search, reconciliation, knowledge/evidence/relationship/history persistence.
- `apps/vault-desktop` — Electron shell (`electron/`) + React renderer (`renderer/`).

**Vault on disk:** a chosen folder containing `vault.db` (+ WAL/SHM), `projects/<id>/files/…` (ordinary local files are the source of truth for content), and `backups/`.

**Key invariants:** Vault owns state · renderer has no direct Node/SQLite/fs access · AI returns proposals, never silent mutations · every model-generated object needs provenance · Atlas/Graph visualizes canonical data, never a second database · integrations use a stable Vault API, never `vault.db` directly.

---

## 4. Repository & branch/worktree map

| Branch | Tip | Contents | Pushed? |
|---|---|---|---|
| `main` | `57890f8` | Transfer snapshot / v0.1.3 baseline | yes (origin) |
| `codex/phase-2-4-slice-1` | `0ebd0b9` | Slice 1 lifecycle + Claude's safety hardening | no (local) |
| `phase-2-4-slice-2` | `5868b42` | **Everything** — Slice 1 + Slice 2 + all specs/plans | **yes (origin)** |

`phase-2-4-slice-2` was branched from Slice 1's tip, so it is the cumulative branch — merging it into `main` brings all of Phase 2.4.

**Worktrees present locally:**
- `C:\Users\Bando\Documents\VAULT` → `main`
- `.worktrees\phase-2-4-slice-1` → `codex/phase-2-4-slice-1` (now redundant — superseded by slice-2)
- `.worktrees\phase-2-4-slice-2` → `phase-2-4-slice-2` (active)

---

## 5. Complete work log (chronological)

**Legend:** 🟦 = Anthony (owner) · 🟨 = Codex (prior AI session) · 🟩 = Claude (this session)

### Baseline — 🟦 Anthony
| Commit | What |
|---|---|
| `fc2905e` | Initial public release: Orbit Vault Foundation v0.1.3 |
| `57890f8` | Transfer snapshot: current Orbit Vault build (migration to main PC) |

### Phase 2.4 Slice 1 — Immutable Lifecycle — 🟨 Codex
The write-side operations for safely retiring and reconciling knowledge.
| Commit | What | Size |
|---|---|---|
| `8a84860` | chore: prepare Phase 2.4 Slice 1 (scaffolding + planning docs) | 6 files, +816 |
| `fe0c875` | feat: define immutable knowledge lifecycle contracts (types) | +40 |
| `6859991` | feat: normalize evidence links + add history schema (migration 6) | 4 files, +140 |
| `e19194a` | test: strengthen migration 6 coverage | +52 |
| `706b311` | feat: record immutable knowledge lifecycle history | 3 files, +114 |
| `d3e4f01` | feat: add transactional deterministic knowledge merge | 3 files, +269 |
| `a4c937d` | feat: expose knowledge lifecycle IPC | 4 files, +78 |
| `df9b5e8` | feat: add knowledge lifecycle inspector workflows (KnowledgeView UI) | 3 files, +649 |

### Phase 2.4 Slice 1 — Safety hardening — 🟩 Claude
| Commit | What | Size |
|---|---|---|
| `0ebd0b9` | fix: harden knowledge lifecycle inspector safety guards | 3 files, +193/-35 |

Four fixes on top of Codex's inspector: stale-async request guards (no cross-project/selection data bleed), merge preview⇄execute parity (a snapshot key proves the plan shown equals the plan submitted), a real modal focus-trap via body portal, and modal/selection reset on project switch.

### Phase 2.4 Slice 2 — Knowledge Integrity — 🟩 Claude
Read-only deterministic detection of objective problems + a review panel that routes into the Slice 1 fixes.
| Commit | What | Size |
|---|---|---|
| `114d9b9` | docs: Phase 2.4 Slice 2 integrity **design spec** | +201 |
| `5e9b33e` | docs: Phase 2.4 Slice 2 integrity **implementation plan** | +871 |
| `80b8988` | feat: deterministic integrity **analysis backend** (analyzer + storage + IPC + 23 tests) | 7 files, +431 |
| `5868b42` | feat: read-only integrity **review panel** (UI) | 4 files, +119 |

**Slice 2 rules (all deterministic, no AI):** `broken_reference` (error / warning if archived-trashed), `missing_evidence` (approved object, no evidence — error), `orphaned` (active, no evidence & no relationships — warning), `duplicate_candidate` (same-type + `duplicates` link or normalized-identical title — warning), `unanswered_question` (warning). Stable version-tagged finding ids; byte-identical reports for identical Vault state.

---

## 6. Phase roadmap & where we are

| Phase | Scope | Status |
|---|---|---|
| Phase 0 | Desktop foundation (Electron shell, build pipeline, package boundaries) | ✅ |
| Phase 1 / 1.1 | Local Vault foundation (real Vaults, CRUD, autosave, archive/trash, search, Atlas, persistence) | ✅ |
| Phase 1.2 / 1.3 | File import, native open/reveal, fs reconciliation + watcher | ◑ partially absorbed, not formally closed |
| Phase 2.0–2.3 | Manual knowledge, evidence, typed relationships, folder org, Atlas overlays, managed files | ✅ |
| **Phase 2.4** | **Lifecycle (history/supersede/merge) + deterministic integrity** | ✅ **done** |
| Phase 3 | **AI proposals** — project-scoped assistant, cited answers, context builder. AI proposes; user approves. | ⬜ next major |
| Phase 4 | Derived Project DNA | ⬜ |
| Phase 5 | Semantic drift / conflict detection | ⬜ |
| Phase 6 | Stable Vault API for the wider Orbit platform | ⬜ |

**On a "Phase 2.5":** not defined in the roadmap — the `2.x` numbers were slices carved during Phase 2, and the roadmap goes 2 → 3. An optional light "finish Phase 2" pass could add dedicated **Decision Log / Goals / Open Questions** views, lifecycle UX polish, and broader regression coverage — but that's *polish, not major*. The next genuinely major change is **Phase 3 (AI)**, because it introduces a whole new subsystem (model provider, proposal pipeline). It is deliberately gated behind the now-complete manual system + integrity checks.

---

## 7. Document index

**Product & architecture (start here):**
- [`README.md`](README.md) — product overview, pillars, roadmap.
- [`ORBIT_VAULT_MASTER_HANDOFF.md`](ORBIT_VAULT_MASTER_HANDOFF.md) — architecture rules, invariants, risks, safe-start checklist. **Primary orientation doc.**
- [`docs/architecture.md`](docs/architecture.md) — data model, entity fields, invariants, phase contracts.

**Setup & migration:**
- [`MAIN_PC_SETUP.md`](MAIN_PC_SETUP.md) — clone / install / run / package on Windows.

**Graph / Atlas history:**
- [`CODEX_HANDOFF_graph_layout.md`](CODEX_HANDOFF_graph_layout.md), [`CODEX_HANDOFF_graph_style_pivot.md`](CODEX_HANDOFF_graph_style_pivot.md) — superseded by the master handoff where they conflict.

**Phase 2.4 specs & plans:**
- `docs/superpowers/specs/2026-08-05-phase-2-4-knowledge-integrity-design.md` — Codex's broader 2.4 integrity design.
- `docs/superpowers/plans/2026-08-05-phase-2-4-slice-1-immutable-lifecycle.md` — Slice 1 implementation plan.
- `docs/superpowers/specs/2026-08-05-phase-2-4-slice-2-integrity-design.md` — Slice 2 design spec (approved).
- `docs/superpowers/plans/2026-08-05-phase-2-4-slice-2-integrity.md` — Slice 2 implementation plan (test-first).
- **`ORBIT_VAULT_PROJECT_STATUS.md`** — this file.

**Task briefs (untracked, in the Slice 1 worktree):** `.worktrees/phase-2-4-slice-1/.superpowers/sdd/2026-08-05-phase-2-4-slice-1-immutable-lifecycle/` holds `task-1..6-brief.md` + `progress.md` from the Slice 1 SDD run. These are gitignored (`.superpowers/`).

---

## 8. How to run & verify

Requires Node ≥ 22.13 and pnpm 11.9.0.

```bash
pnpm install        # restore deps
pnpm dev            # Electron + Vite hot reload (launches the app)
pnpm typecheck      # tsc across electron + renderer
pnpm test           # persistence, lifecycle, integrity, Atlas regression (49 tests)
pnpm build          # compile electron main + preload + renderer
pnpm package        # Windows installer (Orbit-Vault-0.1.3-Setup.exe)
```

Static UI contract check: `node scripts/phase2-lifecycle-ui-regression.mjs`.

**Manual acceptance for Phase 2.4** (UI can't be auto-driven): in a project's Knowledge area — (1) History timeline shows events; (2) Supersede modal retires an object; (3) Merge preview→confirm moves evidence/links; (4) the **Integrity** tab auto-runs and lists Orphaned / Duplicate / Unanswered findings; (5) a duplicate's **Merge…** opens the merge modal pre-filled; **Refresh** re-runs.

---

## 9. Operational notes / gotchas (learned this session)

- **`pnpm` may not be on PATH** (only Node + corepack installed). Use `corepack pnpm …`, or a small `pnpm.cmd` shim forwarding to `corepack pnpm`. `corepack enable` needs admin (writes to Program Files).
- **The current `main` checkout's `node_modules` was incompletely linked** after the file transfer (missing top-level `vite` + `@orbit/*` links), which broke `pnpm dev`. A clean reinstall (delete `node_modules`, `pnpm install --frozen-lockfile`) fixes it. **The `phase-2-4-slice-2` branch installs cleanly** — merging it into `main` also brings the corrected workspace manifests, so the install problem goes away once merged.
- **`pnpm dev` exiting with code 1 on window-close is normal** — Electron exits 0, and `concurrently -k` then SIGTERMs the Vite renderer (reports 1). Not a crash.
- **Git commits are durable across session/usage limits** — an interrupted session never loses committed work.

---

## 10. Open decisions / next actions

1. **Integrate Phase 2.4 into `main`** — open a PR (`phase-2-4-slice-2` → `main`) or merge locally. Recommended: PR, for a clean record.
2. **Worktree cleanup** — `.worktrees/phase-2-4-slice-1` is now redundant (contained in slice-2); safe to remove.
3. **Optional "finish Phase 2" polish** — dedicated Decision Log / Goals / Open Questions views + broader regression. Minor.
4. **Phase 3 (AI) kickoff** — the real next milestone. A fresh brainstorm → spec → plan cycle. Local model (Ollama / Llama on the NVIDIA GPU) is viable *because* the approval + integrity gates already de-risk a fallible model.
