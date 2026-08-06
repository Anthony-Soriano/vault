# Task 2 fix round 1 review package
## Commits
```
e19194a test: strengthen migration 6 coverage
```
## Stat
```
 tests/phase2-knowledge.test.ts | 78 ++++++++++++++++++++++++++++--------------
 1 file changed, 52 insertions(+), 26 deletions(-)
```
## Diff
```diff
diff --git a/tests/phase2-knowledge.test.ts b/tests/phase2-knowledge.test.ts
index 2ce59a3..9722500 100644
--- a/tests/phase2-knowledge.test.ts
+++ b/tests/phase2-knowledge.test.ts
@@ -9,62 +9,88 @@ import { SqliteVaultRepository } from "@orbit/vault-storage";
 
 const fixture = () => {
   const root = mkdtempSync(join(tmpdir(), "orbit-vault-phase2-"));
   const service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root }));
   service.initialize();
   return { root, service, dispose: () => { service.close(); rmSync(root, { recursive: true, force: true }); } };
 };
 
 test("migration preserves canonical evidence and creates one honest baseline", () => {
   const root = mkdtempSync(join(tmpdir(), "orbit-vault-migration-"));
-  const projectId = "project_legacy_001", knowledgeId = "knowledge_legacy_001", evidenceId = "evidence_legacy_001";
-  const createdAt = "2026-08-01T10:00:00.000Z";
+  const projectId = "project_legacy_001", folderId = "folder_legacy_001", documentId = "document_legacy_001", knowledgeId = "knowledge_target_001";
+  const createdAt = "2026-08-01T10:00:00.000Z", updatedAt = "2026-08-01T10:10:00.000Z";
+  const targetObject = { id: knowledgeId, projectId, parentFolderId: folderId, type: "decision", title: "Target decision", body: "Preserve every aggregate field.", status: "approved", confidence: "verified", author: "user", supersededById: null, createdAt, updatedAt };
+  const alphaObject = { id: "knowledge_alpha_001", projectId, parentFolderId: null, type: "fact", title: "Alpha fact", body: "A second baseline is required.", status: "draft", confidence: "medium", author: "ai", supersededById: null, createdAt: "2026-08-01T10:02:00.000Z", updatedAt: "2026-08-01T10:12:00.000Z" };
+  const zebraObject = { id: "knowledge_zebra_001", projectId, parentFolderId: folderId, type: "goal", title: "Zebra goal", body: "A third baseline is required.", status: "archived", confidence: "low", author: "user", supersededById: null, createdAt: "2026-08-01T10:01:00.000Z", updatedAt: "2026-08-01T10:11:00.000Z" };
+  const targetEvidence = [
+    { id: "evidence_zulu_001", projectId, sourceType: "url", sourceId: "source_zulu_001", sourcePath: "https://example.test/zulu", excerpt: "Zulu provenance.", locator: "section-z", confidence: "verified", availability: "available", createdAt: "2026-08-01T10:20:00.000Z" },
+    { id: "evidence_alpha_001", projectId, sourceType: "manual_note", sourceId: null, sourcePath: null, excerpt: null, locator: "note-a", confidence: "low", availability: "missing", createdAt: "2026-08-01T10:15:00.000Z" },
+  ];
+  const alphaEvidence = { id: "evidence_middle_001", projectId, sourceType: "image", sourceId: "source_middle_001", sourcePath: "images/proof.png", excerpt: "Middle provenance.", locator: null, confidence: "high", availability: "available", createdAt: "2026-08-01T10:18:00.000Z" };
   let service: VaultService | null = null;
   try {
     const legacy = new DatabaseSync(join(root, "vault.db"));
-    legacy.exec(`
-      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
-      CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, storage_path TEXT);
-      CREATE TABLE knowledge_objects (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, confidence TEXT NOT NULL, author TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, parent_folder_id TEXT);
-      CREATE TABLE evidence_sources (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, knowledge_object_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT, source_path TEXT, excerpt TEXT, locator TEXT, confidence TEXT NOT NULL, availability TEXT NOT NULL, created_at TEXT NOT NULL);
-      CREATE TABLE relationships (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, relationship_type TEXT NOT NULL, author TEXT NOT NULL, created_at TEXT NOT NULL);
-    `);
-    for (let version = 1; version <= 5; version++) legacy.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(version, createdAt);
-    legacy.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(projectId, "Legacy Project", null, null, null, "active", createdAt, createdAt, `${projectId}/files`);
-    legacy.prepare("INSERT INTO knowledge_objects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(knowledgeId, projectId, "decision", "Legacy decision", "Preserve provenance.", "approved", "verified", "user", createdAt, createdAt, null);
-    legacy.prepare("INSERT INTO evidence_sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(evidenceId, projectId, knowledgeId, "url", "source_legacy_001", "https://example.test/provenance", "Preserve this excerpt.", "section-2", "verified", "available", createdAt);
-    legacy.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("relationship_in_001", projectId, "document", "document_legacy_001", "knowledge", knowledgeId, "supports", "user", "2026-08-01T10:01:00.000Z");
-    legacy.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("relationship_out_001", projectId, "knowledge", knowledgeId, "project", projectId, "references", "user", "2026-08-01T10:02:00.000Z");
+    legacy.exec("PRAGMA foreign_keys = ON;");
+    const versionFiveDdl = [
+      `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT, status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE folders (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), parent_folder_id TEXT REFERENCES folders(id), name TEXT NOT NULL, relative_path TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, relative_path)); CREATE TABLE documents (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), parent_folder_id TEXT REFERENCES folders(id), title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('markdown','file')), relative_path TEXT NOT NULL, mime_type TEXT, status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, relative_path)); CREATE INDEX projects_status_idx ON projects(status); CREATE INDEX folders_project_idx ON folders(project_id); CREATE INDEX folders_parent_idx ON folders(parent_folder_id); CREATE INDEX documents_project_idx ON documents(project_id); CREATE INDEX documents_parent_idx ON documents(parent_folder_id); CREATE INDEX documents_status_idx ON documents(status); CREATE INDEX folders_path_idx ON folders(project_id, relative_path); CREATE INDEX documents_path_idx ON documents(project_id, relative_path);`,
+      `CREATE TABLE knowledge_objects (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), type TEXT NOT NULL CHECK(type IN ('fact','decision','goal','question','idea','preference')), title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','approved','superseded','archived')), confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high','verified')), author TEXT NOT NULL CHECK(author IN ('user','ai')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE evidence_sources (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE, source_type TEXT NOT NULL CHECK(source_type IN ('document','file','url','conversation','image','pdf','manual_note')), source_id TEXT, source_path TEXT, excerpt TEXT, locator TEXT, confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high','verified')), availability TEXT NOT NULL CHECK(availability IN ('available','missing')), created_at TEXT NOT NULL); CREATE INDEX knowledge_project_idx ON knowledge_objects(project_id); CREATE INDEX knowledge_status_idx ON knowledge_objects(status); CREATE INDEX knowledge_type_idx ON knowledge_objects(type); CREATE INDEX evidence_knowledge_idx ON evidence_sources(knowledge_object_id); CREATE INDEX evidence_source_idx ON evidence_sources(source_type, source_id);`,
+      `CREATE TABLE relationships (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), source_type TEXT NOT NULL CHECK(source_type IN ('project','folder','document','knowledge')), source_id TEXT NOT NULL, target_type TEXT NOT NULL CHECK(target_type IN ('project','folder','document','knowledge')), target_id TEXT NOT NULL, relationship_type TEXT NOT NULL CHECK(relationship_type IN ('supports','references','contradicts','answers','depends_on','blocks','implements','duplicates','derived_from','belongs_to')), author TEXT NOT NULL CHECK(author IN ('user','ai')), created_at TEXT NOT NULL, UNIQUE(project_id, source_type, source_id, target_type, target_id, relationship_type)); CREATE INDEX relationships_project_idx ON relationships(project_id); CREATE INDEX relationships_source_idx ON relationships(source_type, source_id); CREATE INDEX relationships_target_idx ON relationships(target_type, target_id);`,
+      "ALTER TABLE knowledge_objects ADD COLUMN parent_folder_id TEXT REFERENCES folders(id); CREATE INDEX knowledge_parent_folder_idx ON knowledge_objects(parent_folder_id);",
+      "ALTER TABLE projects ADD COLUMN storage_path TEXT; UPDATE projects SET storage_path=id || '/files' WHERE storage_path IS NULL; CREATE UNIQUE INDEX projects_storage_path_idx ON projects(storage_path);",
+    ];
+    legacy.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);");
+    for (const [index, ddl] of versionFiveDdl.entries()) { legacy.exec(ddl); legacy.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(index + 1, createdAt); }
+    legacy.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(projectId, "Legacy Project", "A complete project row.", "archive", "#445566", "active", createdAt, updatedAt, `${projectId}/files`);
+    legacy.prepare("INSERT INTO folders VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(folderId, projectId, null, "legacy", "legacy", "active", createdAt, updatedAt);
+    legacy.prepare("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(documentId, projectId, folderId, "legacy.md", "markdown", "legacy/legacy.md", "text/markdown", "active", createdAt, updatedAt);
+    const insertKnowledge = legacy.prepare("INSERT INTO knowledge_objects(id, project_id, type, title, body, status, confidence, author, created_at, updated_at, parent_folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
+    for (const object of [zebraObject, targetObject, alphaObject]) insertKnowledge.run(object.id, object.projectId, object.type, object.title, object.body, object.status, object.confidence, object.author, object.createdAt, object.updatedAt, object.parentFolderId);
+    const insertEvidence = legacy.prepare("INSERT INTO evidence_sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
+    for (const evidence of [targetEvidence[0], targetEvidence[1], alphaEvidence]) insertEvidence.run(evidence.id, evidence.projectId, evidence.id === alphaEvidence.id ? alphaObject.id : knowledgeId, evidence.sourceType, evidence.sourceId, evidence.sourcePath, evidence.excerpt, evidence.locator, evidence.confidence, evidence.availability, evidence.createdAt);
+    const insertRelationship = legacy.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
+    for (const relationship of [
+      ["relationship_in_z_001", "document", documentId, "knowledge", knowledgeId, "supports", "2026-08-01T10:26:00.000Z"], ["relationship_in_a_001", "project", projectId, "knowledge", knowledgeId, "references", "2026-08-01T10:24:00.000Z"], ["relationship_in_b_001", "folder", folderId, "knowledge", knowledgeId, "answers", "2026-08-01T10:25:00.000Z"],
+      ["relationship_out_z_001", "knowledge", knowledgeId, "document", documentId, "depends_on", "2026-08-01T10:29:00.000Z"], ["relationship_out_a_001", "knowledge", knowledgeId, "project", projectId, "implements", "2026-08-01T10:27:00.000Z"], ["relationship_out_b_001", "knowledge", knowledgeId, "folder", folderId, "blocks", "2026-08-01T10:28:00.000Z"],
+    ]) insertRelationship.run(relationship[0], projectId, relationship[1], relationship[2], relationship[3], relationship[4], relationship[5], "user", relationship[6]);
     legacy.close();
 
     service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: false, developmentRoot: root }));
     service.initialize();
-    const [evidence] = service.evidence.list(knowledgeId);
-    assert.deepEqual(evidence, { id: evidenceId, projectId, sourceType: "url", sourceId: "source_legacy_001", sourcePath: "https://example.test/provenance", excerpt: "Preserve this excerpt.", locator: "section-2", confidence: "verified", availability: "available", createdAt });
+    assert.deepEqual(service.evidence.list(knowledgeId), targetEvidence);
+    assert.deepEqual(service.evidence.list(alphaObject.id), [alphaEvidence]);
     service.close();
 
     const migrated = new DatabaseSync(join(root, "vault.db"), { readOnly: true });
     assert.equal((migrated.prepare("PRAGMA table_info(evidence_sources)").all() as { name: string }[]).some(column => column.name === "knowledge_object_id"), false);
-    assert.deepEqual((migrated.prepare("SELECT knowledge_object_id, evidence_source_id, original_knowledge_object_id FROM knowledge_evidence_links").all() as Record<string, string>[]).map(row => ({ ...row })), [{ knowledge_object_id: knowledgeId, evidence_source_id: evidenceId, original_knowledge_object_id: knowledgeId }]);
-    const baseline = migrated.prepare("SELECT event_type, actor_type, reason, before_snapshot, after_snapshot FROM knowledge_object_history WHERE knowledge_object_id=?").get(knowledgeId) as { event_type: string; actor_type: string; reason: string; before_snapshot: null; after_snapshot: string };
+    assert.deepEqual((migrated.prepare("SELECT id, project_id, source_type, source_id, source_path, excerpt, locator, confidence, availability, created_at FROM evidence_sources ORDER BY id").all() as Record<string, string | null>[]).map(row => ({ ...row })), [targetEvidence[1], alphaEvidence, targetEvidence[0]].map(evidence => ({ id: evidence.id, project_id: evidence.projectId, source_type: evidence.sourceType, source_id: evidence.sourceId, source_path: evidence.sourcePath, excerpt: evidence.excerpt, locator: evidence.locator, confidence: evidence.confidence, availability: evidence.availability, created_at: evidence.createdAt })).sort((left, right) => left.id.localeCompare(right.id)));
+    const links = (migrated.prepare("SELECT link_id, knowledge_object_id, evidence_source_id, original_knowledge_object_id, operation_id, created_at FROM knowledge_evidence_links ORDER BY evidence_source_id").all() as Record<string, string>[]).map(row => ({ ...row }));
+    assert.equal(links.length, 3);
+    assert.deepEqual(links.map(link => ({ knowledge_object_id: link.knowledge_object_id, evidence_source_id: link.evidence_source_id, original_knowledge_object_id: link.original_knowledge_object_id })), [{ knowledge_object_id: knowledgeId, evidence_source_id: "evidence_alpha_001", original_knowledge_object_id: knowledgeId }, { knowledge_object_id: alphaObject.id, evidence_source_id: alphaEvidence.id, original_knowledge_object_id: alphaObject.id }, { knowledge_object_id: knowledgeId, evidence_source_id: "evidence_zulu_001", original_knowledge_object_id: knowledgeId }]);
+    for (const link of links) { assert.match(link.link_id, /^[a-f0-9]{32}$/); assert.match(link.operation_id, /^migration6-link-evidence_/); assert.notEqual(link.created_at, ""); }
+    const histories = (migrated.prepare("SELECT history_id, knowledge_object_id, operation_id, event_type, actor_type, actor_id, reason, before_snapshot, after_snapshot, created_at FROM knowledge_object_history ORDER BY knowledge_object_id").all() as Record<string, string | null>[]).map(row => ({ ...row }));
+    assert.deepEqual(histories.map(history => history.knowledge_object_id), [alphaObject.id, knowledgeId, zebraObject.id]);
+    for (const history of histories) { assert.match(history.history_id!, /^[a-f0-9]{32}$/); assert.equal(history.operation_id, `migration6-baseline-${history.knowledge_object_id}`); assert.equal(history.event_type, "baseline_migrated"); assert.equal(history.actor_type, "system"); assert.equal(history.actor_id, null); assert.match(history.reason!, /immutable tracking began.*earlier edits cannot be reconstructed/i); assert.equal(history.before_snapshot, null); assert.notEqual(history.created_at, ""); }
+    const baseline = histories.find(history => history.knowledge_object_id === knowledgeId)!;
     assert.equal(baseline.event_type, "baseline_migrated"); assert.equal(baseline.actor_type, "system"); assert.match(baseline.reason, /immutable tracking began.*earlier edits cannot be reconstructed/i); assert.equal(baseline.before_snapshot, null);
-    const after = JSON.parse(baseline.after_snapshot);
-    assert.equal(after.schemaVersion, 1); assert.equal(after.object.supersededById, null);
-    assert.deepEqual(after.evidenceLinks.map((link: { knowledgeObjectId: string; evidenceSourceId: string; originalKnowledgeObjectId: string }) => ({ knowledgeObjectId: link.knowledgeObjectId, evidenceSourceId: link.evidenceSourceId, originalKnowledgeObjectId: link.originalKnowledgeObjectId })), [{ knowledgeObjectId: knowledgeId, evidenceSourceId: evidenceId, originalKnowledgeObjectId: knowledgeId }]);
-    assert.deepEqual(after.incomingRelationships.map((relationship: { id: string }) => relationship.id), ["relationship_in_001"]);
-    assert.deepEqual(after.outgoingRelationships.map((relationship: { id: string }) => relationship.id), ["relationship_out_001"]);
+    const after = JSON.parse(baseline.after_snapshot!);
+    assert.equal(after.schemaVersion, 1); assert.deepEqual(after.object, targetObject);
+    assert.deepEqual(JSON.parse(histories.find(history => history.knowledge_object_id === alphaObject.id)!.after_snapshot!).object, alphaObject);
+    assert.deepEqual(JSON.parse(histories.find(history => history.knowledge_object_id === zebraObject.id)!.after_snapshot!).object, zebraObject);
+    assert.deepEqual(after.evidenceLinks, links.filter(link => link.knowledge_object_id === knowledgeId).map(link => ({ id: link.link_id, knowledgeObjectId: link.knowledge_object_id, evidenceSourceId: link.evidence_source_id, originalKnowledgeObjectId: link.original_knowledge_object_id, operationId: link.operation_id, createdAt: link.created_at })));
+    assert.deepEqual(after.incomingRelationships.map((relationship: { id: string }) => relationship.id), ["relationship_in_a_001", "relationship_in_b_001", "relationship_in_z_001"]);
+    assert.deepEqual(after.outgoingRelationships.map((relationship: { id: string }) => relationship.id), ["relationship_out_a_001", "relationship_out_b_001", "relationship_out_z_001"]);
     migrated.close();
 
     service.initialize(); service.close();
     const reopened = new DatabaseSync(join(root, "vault.db"), { readOnly: true });
-    assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_evidence_links").get() as { count: number }).count, 1);
-    assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_object_history").get() as { count: number }).count, 1);
+    assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_evidence_links").get() as { count: number }).count, 3);
+    assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_object_history").get() as { count: number }).count, 3);
     reopened.close();
   } finally { service?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
 });
 
 test("manual knowledge remains draft until explicit approval and survives restart", () => {
   const ctx=fixture(); try {
     const project=ctx.service.projects.create({name:"Knowledge Project"});
     const document=ctx.service.documents.createMarkdown({projectId:project.id,parentFolderId:null,title:"architecture",content:"# Architecture\n\nUse SQLite for local-first persistence."});
     const knowledge=ctx.service.knowledge.create({projectId:project.id,type:"decision",title:"Use SQLite",body:"SQLite is the canonical local metadata store.",confidence:"high"});
     assert.equal(knowledge.status,"draft"); assert.equal(knowledge.author,"user");
```
