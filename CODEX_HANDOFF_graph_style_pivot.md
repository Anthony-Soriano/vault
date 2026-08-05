## Goal

Change the Atlas graph's visual style away from the current rigid radial/wedge layout toward an organic, Obsidian-graph-style force layout — while keeping the one property that actually matters: **each project's nodes stay visually clustered together and never intermingle with another project's nodes.**

Right now `hierarchyGraph.ts` computes a strict polar layout — every node gets an exact angle and radius via recursive wedge-slicing from a shared origin. That's what's been causing a string of bugs (runaway radius expansion on unevenly deep branches, the root node feeling like a heavy hub everything's pinned to) and it doesn't look like what's actually wanted: it looks like pie-chart slices, not a graph. Obsidian's graph view has no rings or slices — nodes settle into organic clumps wherever the physics puts them, connected by visible springy links, with clusters emerging naturally from which nodes are linked to which.

## What to build

Replace the wedge/angle/radius math in `hierarchyGraph.ts` with a **clustered force-directed layout** — the standard d3-force pattern for "force layout, but keep unrelated groups apart" (this is a well-known recipe, sometimes called "cluster force" or "group foci"):

1. Give each top-level project (each direct child of the vault root) a distinct "cluster center" point — these can be arranged in a simple non-overlapping pattern (a circle or grid scaled by how many total clusters there are), they don't need wedge math.
2. Every node in a project's subtree gets a **weak** pull toward its own project's cluster center (not a rigid pin — just enough to keep it gravitating back toward its own region instead of drifting into a neighbor's).
3. Use `forceManyBody` (charge/repulsion) between all nodes so things spread out naturally instead of clumping into a ball.
4. Use `forceLink` along the existing "contains" parent→child edges so linked nodes actually pull toward each other — this is what gives it that organic, springy Obsidian look, and it also naturally keeps a project's internal structure coherent since every node is transitively linked back to its own project root.
5. Keep `forceCollide` so nodes never visually overlap — that guarantee shouldn't be lost in the redesign.
6. The vault root itself should still exist as a real node (it's real data — every project genuinely belongs to it), but don't treat it as a rigid hub everything is anchored to. It can just be another lightly-charged node in the graph, maybe visually de-emphasized (smaller / dimmer), rather than the fixed origin the whole coordinate system revolves around.

## What must be preserved

- **Determinism.** The current code runs the force simulation for a fixed number of ticks with a seeded/sorted node order specifically so the same vault data produces byte-identical positions every time (not a re-shuffled layout on every reload). Keep that discipline — same technique (seed nodes sorted by id, run a fixed tick count, round the output) applies regardless of which forces are used.
- **No overlaps**, enforced by `forceCollide`, same as now.
- **No cross-project intermingling** — this is the actual ask, and it's what the cluster-center foci force is for. Verify it by checking that nodes from two different projects never end up closer to each other than to their own project's centroid.
- All the existing interactive behavior in `GraphViewV2.tsx` — drag-to-nudge with children trailing elastically via the weak `forceLink` (already implemented and working, keep it), live-motion toggle, zoom/pan, collapse/expand, search, and the node size / spacing / hierarchy-pull sliders. Those sliders should still map to real force parameters (collide radius, charge strength, link/cluster-pull strength) — just against the new force set instead of the old radial one.
- The existing test suite in `tests/graph-v2.test.ts` will need its assertions rewritten (it currently checks exact wedge angles and ring radii, which won't exist anymore), but the underlying properties it should verify stay the same: deterministic regardless of input order, a node's own project-mates are closer to it than nodes from other projects, and no pair of nodes overlaps.

## Where

- `apps/vault-desktop/renderer/src/hierarchyGraph.ts` — the layout computation
- `apps/vault-desktop/renderer/src/GraphViewV2.tsx` — the live interactive simulation (mirror whatever force set the baked layout ends up using)
- `tests/graph-v2.test.ts` — update assertions to match the new invariants above

Don't touch the canvas rendering, camera/zoom, search, or collapse logic in `GraphViewV2.tsx` — those are unrelated to the layout style and already work.
