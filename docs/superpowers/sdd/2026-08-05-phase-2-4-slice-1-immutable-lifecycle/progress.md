# SDD ledger — plan: docs/superpowers/plans/2026-08-05-phase-2-4-slice-1-immutable-lifecycle.md

Baseline: commit 8a84860; typecheck passed; 18 tests passed.
Task 1: complete (commits 8a84860..fe0c875, review clean)
Task 1: transition boundary — `supersededById` remains optional and deprecated required `EvidenceSource.knowledgeObjectId` remains until Task 2 removes them atomically.
Task 2: fix round 1/5 (1 addressed, 0 open — strengthened schema-equivalent multi-row migration regression; commit e19194a)
Task 2: complete (commits fe0c875..e19194a, review clean)
Task 3: minor (deferred): tests inspect all after-snapshots but only the edited before-snapshot and do not directly assert Atlas node exclusion.
Task 3: complete (commits e19194a..706b311, review clean with 1 deferred test-hardening minor)
Task 4: minor (deferred): history test does not deeply assert all relationship metadata/full source object fields in every before-snapshot.
Task 4: minor (deferred): execution tests do not separately call every structural-invalid input already covered through shared preview planner.
Task 4: complete (commits 706b311..d3e4f01, review clean with 2 deferred test-hardening minors)
Task 5: complete (commits d3e4f01..a4c937d, review clean)
