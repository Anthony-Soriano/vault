> **HISTORICAL — SUPERSEDED.** Kept for reference only. The canonical project docs live in the repo root; start at `AGENTS.md`. Do not treat this file as current.

Claude just reworked the Atlas graph layout/physics (`hierarchyGraph.ts` + `GraphViewV2.tsx`). The changes are already on disk but need to be built and verified. Do this:

## 1. Install and restart
- `pnpm install` — a new dependency, `d3-force` (+ `@types/d3-force`), was added to `apps/vault-desktop/renderer/package.json`.
- Fully **restart** the dev server (`pnpm dev`), don't rely on hot-reload — Vite pre-bundles deps at startup and won't pick up a brand-new one otherwise.
- Heads up: `apps/vault-desktop/renderer/node_modules/{d3-force,d3-dispatch,d3-quadtree,d3-timer,@types/d3-force}` currently contain manually-extracted tarball contents (not pnpm's normal symlink layout) from Claude's sandbox verification. `pnpm install` should reconcile this automatically, but if it errors on those specific folders, delete them manually first and reinstall.

## 2. Run the test suite
`node --experimental-strip-types --test tests/graph-v2.test.ts` (or `pnpm test`) — all 6 tests must pass. They cover determinism, collapse/ancestor logic, and region-separation invariants for the new layout.

## 3. What actually changed (context)
- Root cause of the "hairball/spine" layout: in `hierarchyGraph.ts`, the code that anchors each top-level folder into its own radial wedge only matched nodes with `type === "project"`, but real vault data has top-level items typed `"folder"`. Every folder below the vault root had no radial anchor at all, collapsed onto the origin, and got flung into a tangled chain by leftover physics.
- The hand-rolled physics (a 300-iteration relaxation loop, plus in `GraphViewV2.tsx` two separate `requestAnimationFrame` loops fighting over the same node positions during drag/idle) has been replaced with a single `d3-force` simulation in both files — `forceX`/`forceY` pull toward the deterministic hierarchy position, `forceCollide` resolves real overlaps, `forceManyBody` (short-range) adds breathing room.
- Dragging a folder now pins the node and all its visible descendants via `fx`/`fy` so the whole subtree follows, then springs back on release.
- A density-aware ring radius was added: when a folder has many sibling folders/files packed into a narrow inherited angular wedge, the ring expands outward proportionally instead of letting collision detection just pack everyone into a tight disc.

## 4. Verify visually
Open the Atlas view on `test vault / Orbit-main` (or any project with several sibling folders). Confirm:
- No overlapping/blobby clusters, even in folders with lots of siblings or files.
- Dragging a folder carries its children with it in real time, then eases back on release.
- Toggling "Live motion" off freezes positions; back on resumes smoothly.
- The "Node size", "Node spacing", "Hierarchy pull" sliders visibly affect the layout.

If it still looks off after a real restart + reinstall, report back what specifically looks wrong (screenshot ideally) rather than re-tuning blind — the constants in `hierarchyGraph.ts` (`baseRingRadius`, collide `strength`/`iterations`) are the tuning knobs, but don't touch the `d3-force` architecture itself without a reason; it replaced two independently-fighting hand-rolled physics loops that were the actual root cause of the "contradiction" bugs.
