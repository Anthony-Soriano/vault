import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { VaultService } from "@orbit/vault-core";
import { SqliteVaultRepository } from "@orbit/vault-storage";

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "orbit-vault-phase2-"));
  const service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root }));
  service.initialize();
  return { root, service, dispose: () => { service.close(); rmSync(root, { recursive: true, force: true }); } };
};

test("migration preserves canonical evidence and creates one honest baseline", () => {
  const root = mkdtempSync(join(tmpdir(), "orbit-vault-migration-"));
  const projectId = "project_legacy_001", folderId = "folder_legacy_001", documentId = "document_legacy_001", knowledgeId = "knowledge_target_001";
  const createdAt = "2026-08-01T10:00:00.000Z", updatedAt = "2026-08-01T10:10:00.000Z";
  const targetObject = { id: knowledgeId, projectId, parentFolderId: folderId, type: "decision", title: "Target decision", body: "Preserve every aggregate field.", status: "approved", confidence: "verified", author: "user", supersededById: null, createdAt, updatedAt };
  const alphaObject = { id: "knowledge_alpha_001", projectId, parentFolderId: null, type: "fact", title: "Alpha fact", body: "A second baseline is required.", status: "draft", confidence: "medium", author: "ai", supersededById: null, createdAt: "2026-08-01T10:02:00.000Z", updatedAt: "2026-08-01T10:12:00.000Z" };
  const zebraObject = { id: "knowledge_zebra_001", projectId, parentFolderId: folderId, type: "goal", title: "Zebra goal", body: "A third baseline is required.", status: "archived", confidence: "low", author: "user", supersededById: null, createdAt: "2026-08-01T10:01:00.000Z", updatedAt: "2026-08-01T10:11:00.000Z" };
  const targetEvidence = [
    { id: "evidence_zulu_001", projectId, sourceType: "url", sourceId: "source_zulu_001", sourcePath: "https://example.test/zulu", excerpt: "Zulu provenance.", locator: "section-z", confidence: "verified", availability: "available", createdAt: "2026-08-01T10:20:00.000Z" },
    { id: "evidence_alpha_001", projectId, sourceType: "manual_note", sourceId: null, sourcePath: null, excerpt: null, locator: "note-a", confidence: "low", availability: "missing", createdAt: "2026-08-01T10:15:00.000Z" },
  ];
  const alphaEvidence = { id: "evidence_middle_001", projectId, sourceType: "image", sourceId: "source_middle_001", sourcePath: "images/proof.png", excerpt: "Middle provenance.", locator: null, confidence: "high", availability: "available", createdAt: "2026-08-01T10:18:00.000Z" };
  let service: VaultService | null = null;
  try {
    const legacy = new DatabaseSync(join(root, "vault.db"));
    legacy.exec("PRAGMA foreign_keys = ON;");
    const versionFiveDdl = [
      `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, color TEXT, status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE folders (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), parent_folder_id TEXT REFERENCES folders(id), name TEXT NOT NULL, relative_path TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, relative_path)); CREATE TABLE documents (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), parent_folder_id TEXT REFERENCES folders(id), title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('markdown','file')), relative_path TEXT NOT NULL, mime_type TEXT, status TEXT NOT NULL CHECK(status IN ('active','archived','trashed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, relative_path)); CREATE INDEX projects_status_idx ON projects(status); CREATE INDEX folders_project_idx ON folders(project_id); CREATE INDEX folders_parent_idx ON folders(parent_folder_id); CREATE INDEX documents_project_idx ON documents(project_id); CREATE INDEX documents_parent_idx ON documents(parent_folder_id); CREATE INDEX documents_status_idx ON documents(status); CREATE INDEX folders_path_idx ON folders(project_id, relative_path); CREATE INDEX documents_path_idx ON documents(project_id, relative_path);`,
      `CREATE TABLE knowledge_objects (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), type TEXT NOT NULL CHECK(type IN ('fact','decision','goal','question','idea','preference')), title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','approved','superseded','archived')), confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high','verified')), author TEXT NOT NULL CHECK(author IN ('user','ai')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE evidence_sources (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), knowledge_object_id TEXT NOT NULL REFERENCES knowledge_objects(id) ON DELETE CASCADE, source_type TEXT NOT NULL CHECK(source_type IN ('document','file','url','conversation','image','pdf','manual_note')), source_id TEXT, source_path TEXT, excerpt TEXT, locator TEXT, confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high','verified')), availability TEXT NOT NULL CHECK(availability IN ('available','missing')), created_at TEXT NOT NULL); CREATE INDEX knowledge_project_idx ON knowledge_objects(project_id); CREATE INDEX knowledge_status_idx ON knowledge_objects(status); CREATE INDEX knowledge_type_idx ON knowledge_objects(type); CREATE INDEX evidence_knowledge_idx ON evidence_sources(knowledge_object_id); CREATE INDEX evidence_source_idx ON evidence_sources(source_type, source_id);`,
      `CREATE TABLE relationships (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), source_type TEXT NOT NULL CHECK(source_type IN ('project','folder','document','knowledge')), source_id TEXT NOT NULL, target_type TEXT NOT NULL CHECK(target_type IN ('project','folder','document','knowledge')), target_id TEXT NOT NULL, relationship_type TEXT NOT NULL CHECK(relationship_type IN ('supports','references','contradicts','answers','depends_on','blocks','implements','duplicates','derived_from','belongs_to')), author TEXT NOT NULL CHECK(author IN ('user','ai')), created_at TEXT NOT NULL, UNIQUE(project_id, source_type, source_id, target_type, target_id, relationship_type)); CREATE INDEX relationships_project_idx ON relationships(project_id); CREATE INDEX relationships_source_idx ON relationships(source_type, source_id); CREATE INDEX relationships_target_idx ON relationships(target_type, target_id);`,
      "ALTER TABLE knowledge_objects ADD COLUMN parent_folder_id TEXT REFERENCES folders(id); CREATE INDEX knowledge_parent_folder_idx ON knowledge_objects(parent_folder_id);",
      "ALTER TABLE projects ADD COLUMN storage_path TEXT; UPDATE projects SET storage_path=id || '/files' WHERE storage_path IS NULL; CREATE UNIQUE INDEX projects_storage_path_idx ON projects(storage_path);",
    ];
    legacy.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);");
    for (const [index, ddl] of versionFiveDdl.entries()) { legacy.exec(ddl); legacy.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(index + 1, createdAt); }
    legacy.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(projectId, "Legacy Project", "A complete project row.", "archive", "#445566", "active", createdAt, updatedAt, `${projectId}/files`);
    legacy.prepare("INSERT INTO folders VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(folderId, projectId, null, "legacy", "legacy", "active", createdAt, updatedAt);
    legacy.prepare("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(documentId, projectId, folderId, "legacy.md", "markdown", "legacy/legacy.md", "text/markdown", "active", createdAt, updatedAt);
    const insertKnowledge = legacy.prepare("INSERT INTO knowledge_objects(id, project_id, type, title, body, status, confidence, author, created_at, updated_at, parent_folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const object of [zebraObject, targetObject, alphaObject]) insertKnowledge.run(object.id, object.projectId, object.type, object.title, object.body, object.status, object.confidence, object.author, object.createdAt, object.updatedAt, object.parentFolderId);
    const insertEvidence = legacy.prepare("INSERT INTO evidence_sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const evidence of [targetEvidence[0], targetEvidence[1], alphaEvidence]) insertEvidence.run(evidence.id, evidence.projectId, evidence.id === alphaEvidence.id ? alphaObject.id : knowledgeId, evidence.sourceType, evidence.sourceId, evidence.sourcePath, evidence.excerpt, evidence.locator, evidence.confidence, evidence.availability, evidence.createdAt);
    const insertRelationship = legacy.prepare("INSERT INTO relationships VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const relationship of [
      ["relationship_in_z_001", "document", documentId, "knowledge", knowledgeId, "supports", "2026-08-01T10:26:00.000Z"], ["relationship_in_a_001", "project", projectId, "knowledge", knowledgeId, "references", "2026-08-01T10:24:00.000Z"], ["relationship_in_b_001", "folder", folderId, "knowledge", knowledgeId, "answers", "2026-08-01T10:25:00.000Z"],
      ["relationship_out_z_001", "knowledge", knowledgeId, "document", documentId, "depends_on", "2026-08-01T10:29:00.000Z"], ["relationship_out_a_001", "knowledge", knowledgeId, "project", projectId, "implements", "2026-08-01T10:27:00.000Z"], ["relationship_out_b_001", "knowledge", knowledgeId, "folder", folderId, "blocks", "2026-08-01T10:28:00.000Z"],
    ]) insertRelationship.run(relationship[0], projectId, relationship[1], relationship[2], relationship[3], relationship[4], relationship[5], "user", relationship[6]);
    legacy.close();

    service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: false, developmentRoot: root }));
    service.initialize();
    assert.deepEqual(service.evidence.list(knowledgeId), targetEvidence);
    assert.deepEqual(service.evidence.list(alphaObject.id), [alphaEvidence]);
    service.close();

    const migrated = new DatabaseSync(join(root, "vault.db"), { readOnly: true });
    assert.equal((migrated.prepare("PRAGMA table_info(evidence_sources)").all() as { name: string }[]).some(column => column.name === "knowledge_object_id"), false);
    assert.deepEqual((migrated.prepare("SELECT id, project_id, source_type, source_id, source_path, excerpt, locator, confidence, availability, created_at FROM evidence_sources ORDER BY id").all() as Record<string, string | null>[]).map(row => ({ ...row })), [targetEvidence[1], alphaEvidence, targetEvidence[0]].map(evidence => ({ id: evidence.id, project_id: evidence.projectId, source_type: evidence.sourceType, source_id: evidence.sourceId, source_path: evidence.sourcePath, excerpt: evidence.excerpt, locator: evidence.locator, confidence: evidence.confidence, availability: evidence.availability, created_at: evidence.createdAt })).sort((left, right) => left.id.localeCompare(right.id)));
    const links = (migrated.prepare("SELECT link_id, knowledge_object_id, evidence_source_id, original_knowledge_object_id, operation_id, created_at FROM knowledge_evidence_links ORDER BY evidence_source_id").all() as Record<string, string>[]).map(row => ({ ...row }));
    assert.equal(links.length, 3);
    assert.deepEqual(links.map(link => ({ knowledge_object_id: link.knowledge_object_id, evidence_source_id: link.evidence_source_id, original_knowledge_object_id: link.original_knowledge_object_id })), [{ knowledge_object_id: knowledgeId, evidence_source_id: "evidence_alpha_001", original_knowledge_object_id: knowledgeId }, { knowledge_object_id: alphaObject.id, evidence_source_id: alphaEvidence.id, original_knowledge_object_id: alphaObject.id }, { knowledge_object_id: knowledgeId, evidence_source_id: "evidence_zulu_001", original_knowledge_object_id: knowledgeId }]);
    for (const link of links) { assert.match(link.link_id, /^[a-f0-9]{32}$/); assert.match(link.operation_id, /^migration6-link-evidence_/); assert.notEqual(link.created_at, ""); }
    const histories = (migrated.prepare("SELECT history_id, knowledge_object_id, operation_id, event_type, actor_type, actor_id, reason, before_snapshot, after_snapshot, created_at FROM knowledge_object_history ORDER BY knowledge_object_id").all() as Record<string, string | null>[]).map(row => ({ ...row }));
    assert.deepEqual(histories.map(history => history.knowledge_object_id), [alphaObject.id, knowledgeId, zebraObject.id]);
    for (const history of histories) { assert.match(history.history_id!, /^[a-f0-9]{32}$/); assert.equal(history.operation_id, `migration6-baseline-${history.knowledge_object_id}`); assert.equal(history.event_type, "baseline_migrated"); assert.equal(history.actor_type, "system"); assert.equal(history.actor_id, null); assert.match(history.reason!, /immutable tracking began.*earlier edits cannot be reconstructed/i); assert.equal(history.before_snapshot, null); assert.notEqual(history.created_at, ""); }
    const baseline = histories.find(history => history.knowledge_object_id === knowledgeId)!;
    assert.equal(baseline.event_type, "baseline_migrated"); assert.equal(baseline.actor_type, "system"); assert.match(baseline.reason, /immutable tracking began.*earlier edits cannot be reconstructed/i); assert.equal(baseline.before_snapshot, null);
    const after = JSON.parse(baseline.after_snapshot!);
    assert.equal(after.schemaVersion, 1); assert.deepEqual(after.object, targetObject);
    assert.deepEqual(JSON.parse(histories.find(history => history.knowledge_object_id === alphaObject.id)!.after_snapshot!).object, alphaObject);
    assert.deepEqual(JSON.parse(histories.find(history => history.knowledge_object_id === zebraObject.id)!.after_snapshot!).object, zebraObject);
    assert.deepEqual(after.evidenceLinks, links.filter(link => link.knowledge_object_id === knowledgeId).map(link => ({ id: link.link_id, knowledgeObjectId: link.knowledge_object_id, evidenceSourceId: link.evidence_source_id, originalKnowledgeObjectId: link.original_knowledge_object_id, operationId: link.operation_id, createdAt: link.created_at })));
    assert.deepEqual(after.incomingRelationships.map((relationship: { id: string }) => relationship.id), ["relationship_in_a_001", "relationship_in_b_001", "relationship_in_z_001"]);
    assert.deepEqual(after.outgoingRelationships.map((relationship: { id: string }) => relationship.id), ["relationship_out_a_001", "relationship_out_b_001", "relationship_out_z_001"]);
    migrated.close();

    service.initialize(); service.close();
    const reopened = new DatabaseSync(join(root, "vault.db"), { readOnly: true });
    assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_evidence_links").get() as { count: number }).count, 3);
    assert.equal((reopened.prepare("SELECT count(*) AS count FROM knowledge_object_history").get() as { count: number }).count, 3);
    reopened.close();
  } finally { service?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

test("immutable lifecycle history records create edit approve archive restore and supersede", () => {
  const ctx=fixture(); try {
    const project=ctx.service.projects.create({name:"Lifecycle history"});
    const source=ctx.service.knowledge.create({projectId:project.id,type:"decision",title:"Original decision",body:"The first version is evidence-backed.",confidence:"high"});
    const created=ctx.service.knowledge.history(source.id);
    assert.equal(created.length,1); assert.equal(created[0].eventType,"created"); assert.equal(created[0].beforeSnapshot,null); assert.deepEqual(created[0].afterSnapshot?.object,source);
    ctx.service.evidence.attach({projectId:project.id,knowledgeObjectId:source.id,sourceType:"manual_note",sourceId:null,sourcePath:null,excerpt:"A supporting note.",locator:null,confidence:"verified"});
    const incoming=ctx.service.relationships.create({projectId:project.id,sourceType:"project",sourceId:project.id,targetType:"knowledge",targetId:source.id,relationshipType:"references"});
    const outgoing=ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:source.id,targetType:"project",targetId:project.id,relationshipType:"implements"});
    const edited=ctx.service.knowledge.update(source.id,{title:"Revised decision"});
    const unchanged=ctx.service.knowledge.update(source.id,{title:"Revised decision"});
    assert.equal(unchanged.updatedAt,edited.updatedAt);
    assert.equal(ctx.service.knowledge.approve(source.id).status,"approved");
    assert.equal(ctx.service.knowledge.archive(source.id).status,"archived");
    assert.equal(ctx.service.knowledge.restore(source.id," restore rationale ").status,"approved");
    const replacement=ctx.service.knowledge.create({projectId:project.id,type:"decision",title:"Replacement decision",body:"This version supersedes the original.",confidence:"verified"});
    const superseded=ctx.service.knowledge.supersede({projectId:project.id,knowledgeObjectId:source.id,supersededById:replacement.id,reason:" replacement rationale "});
    assert.equal(superseded.status,"superseded"); assert.equal(superseded.supersededById,replacement.id);
    const history=ctx.service.knowledge.history(source.id);
    assert.deepEqual(history.map(item=>item.eventType),["superseded","restored","archived","approved","edited","created"]);
    assert.equal(new Set(history.map(item=>item.operationId)).size,history.length);
    for(const item of history){assert.notEqual(item.operationId,"");assert.equal(item.actorType,"user");assert.equal(item.actorId,null);assert.ok(item.afterSnapshot);}
    assert.equal(history[0].reason,"replacement rationale"); assert.equal(history[1].reason,"restore rationale"); assert.equal(history[2].reason,null);
    assert.deepEqual(history[4].beforeSnapshot?.evidenceLinks,history[4].afterSnapshot?.evidenceLinks);
    assert.deepEqual(history[0].afterSnapshot?.evidenceLinks.map(item=>item.knowledgeObjectId),[source.id]);
    assert.deepEqual(history[0].afterSnapshot?.incomingRelationships.map(item=>item.id),[incoming.id]);
    assert.deepEqual(history[0].afterSnapshot?.outgoingRelationships.map(item=>item.id),[outgoing.id]);
    assert.equal(ctx.service.knowledge.list({projectId:project.id}).some(item=>item.id===source.id),false);
    assert.deepEqual(ctx.service.knowledge.list({projectId:project.id,status:"superseded"}).map(item=>item.id),[source.id]);
    assert.equal(ctx.service.knowledge.search({projectId:project.id,query:"revised decision"}).some(item=>item.id===source.id),false);
    assert.equal(ctx.service.search({projectId:project.id,query:"revised decision"}).some(item=>item.id===source.id),false);
    assert.equal(ctx.service.snapshot().knowledgeObjects.some(item=>item.id===source.id),false);
  } finally { ctx.dispose(); }
});

test("single-object lifecycle rejects invalid transitions and project crossings", () => {
  const ctx=fixture(); try {
    const first=ctx.service.projects.create({name:"First lifecycle"}),second=ctx.service.projects.create({name:"Second lifecycle"});
    const draft=ctx.service.knowledge.create({projectId:first.id,type:"fact",title:"Draft",body:"Requires support before approval.",confidence:"medium"});
    assert.throws(()=>ctx.service.knowledge.approve(draft.id),/evidence source/);
    ctx.service.evidence.attach({projectId:first.id,knowledgeObjectId:draft.id,sourceType:"manual_note",sourceId:null,sourcePath:null,excerpt:null,locator:null,confidence:"verified"});
    assert.equal(ctx.service.knowledge.approve(draft.id).status,"approved");
    assert.throws(()=>ctx.service.knowledge.approve(draft.id),/draft/);
    assert.throws(()=>ctx.service.knowledge.restore(draft.id),/archived/);
    const replacement=ctx.service.knowledge.create({projectId:first.id,type:"fact",title:"Replacement",body:"A valid replacement.",confidence:"high"});
    assert.throws(()=>ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:draft.id}),/itself/);
    const archived=ctx.service.knowledge.create({projectId:first.id,type:"fact",title:"Archived replacement",body:"An invalid replacement.",confidence:"high"});
    ctx.service.evidence.attach({projectId:first.id,knowledgeObjectId:archived.id,sourceType:"manual_note",sourceId:null,sourcePath:null,excerpt:null,locator:null,confidence:"high"}); ctx.service.knowledge.approve(archived.id); ctx.service.knowledge.archive(archived.id);
    assert.throws(()=>ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:archived.id}),/draft or approved/);
    const foreign=ctx.service.knowledge.create({projectId:second.id,type:"fact",title:"Foreign replacement",body:"Belongs elsewhere.",confidence:"high"});
    assert.throws(()=>ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:foreign.id}),/same project/);
    assert.throws(()=>ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:replacement.id,reason:"x".repeat(501)}),/500/);
    ctx.service.knowledge.supersede({projectId:first.id,knowledgeObjectId:draft.id,supersededById:replacement.id});
    assert.throws(()=>ctx.service.knowledge.archive(draft.id),/draft or approved/);
  } finally { ctx.dispose(); }
});

test("knowledge lifecycle history persists across restart", () => {
  const ctx=fixture(); try {
    const project=ctx.service.projects.create({name:"Persist lifecycle"});
    const source=ctx.service.knowledge.create({projectId:project.id,type:"fact",title:"Persistent source",body:"Lifecycle rows must survive restart.",confidence:"high"});
    ctx.service.evidence.attach({projectId:project.id,knowledgeObjectId:source.id,sourceType:"manual_note",sourceId:null,sourcePath:null,excerpt:null,locator:null,confidence:"verified"}); ctx.service.knowledge.approve(source.id);
    const replacement=ctx.service.knowledge.create({projectId:project.id,type:"fact",title:"Persistent replacement",body:"The replacement persists too.",confidence:"high"});
    ctx.service.knowledge.supersede({projectId:project.id,knowledgeObjectId:source.id,supersededById:replacement.id,reason:"restart proof"});
    const before=ctx.service.knowledge.history(source.id); ctx.service.close(); ctx.service.initialize();
    const after=ctx.service.knowledge.history(source.id); const reloaded=ctx.service.knowledge.list({projectId:project.id,status:"superseded"})[0]!;
    assert.equal(reloaded.id,source.id); assert.equal(reloaded.supersededById,replacement.id); assert.deepEqual(after,before);
  } finally { ctx.dispose(); }
});

test("manual knowledge remains draft until explicit approval and survives restart", () => {
  const ctx=fixture(); try {
    const project=ctx.service.projects.create({name:"Knowledge Project"});
    const document=ctx.service.documents.createMarkdown({projectId:project.id,parentFolderId:null,title:"architecture",content:"# Architecture\n\nUse SQLite for local-first persistence."});
    const knowledge=ctx.service.knowledge.create({projectId:project.id,type:"decision",title:"Use SQLite",body:"SQLite is the canonical local metadata store.",confidence:"high"});
    assert.equal(knowledge.status,"draft"); assert.equal(knowledge.author,"user");
    assert.throws(()=>ctx.service.knowledge.approve(knowledge.id),/evidence source/);
    const evidence=ctx.service.evidence.attach({projectId:project.id,knowledgeObjectId:knowledge.id,sourceType:"document",sourceId:document.id,sourcePath:document.relativePath,excerpt:"Use SQLite for local-first persistence.",locator:"Architecture",confidence:"verified"});
    assert.equal(evidence.sourceId,document.id);
    assert.equal(ctx.service.knowledge.approve(knowledge.id).status,"approved");
    ctx.service.close(); ctx.service.initialize();
    assert.equal(ctx.service.knowledge.search({query:"canonical local",projectId:project.id})[0].id,knowledge.id);
    assert.equal(ctx.service.evidence.list(knowledge.id)[0].availability,"available");
  } finally { ctx.dispose(); }
});

test("knowledge evidence is project isolated and Atlas derives knowledge nodes", () => {
  const ctx=fixture(); try {
    const first=ctx.service.projects.create({name:"First"}), second=ctx.service.projects.create({name:"Second"});
    const document=ctx.service.documents.createMarkdown({projectId:second.id,parentFolderId:null,title:"other"});
    const knowledge=ctx.service.knowledge.create({projectId:first.id,type:"fact",title:"Local fact",body:"Belongs only to First.",confidence:"medium"});
    assert.throws(()=>ctx.service.evidence.attach({projectId:first.id,knowledgeObjectId:knowledge.id,sourceType:"document",sourceId:document.id,sourcePath:document.relativePath,excerpt:null,locator:null,confidence:"medium"}),/another project/);
    const node=ctx.service.snapshot().atlasNodes.find(item=>item.id===knowledge.id);
    assert.equal(node?.type,"knowledge"); assert.equal(node?.parentId,first.id);
    assert.equal(ctx.service.knowledge.search({query:"local fact",projectId:second.id}).length,0);
  } finally { ctx.dispose(); }
});

test("typed relationships create navigable backlinks, persist, and can be removed", () => {
  const ctx=fixture(); try {
    const project=ctx.service.projects.create({name:"Relationship Project"});
    const document=ctx.service.documents.createMarkdown({projectId:project.id,parentFolderId:null,title:"plan"});
    const decision=ctx.service.knowledge.create({projectId:project.id,type:"decision",title:"Use SQLite",body:"Keep metadata local.",confidence:"high"});
    const goal=ctx.service.knowledge.create({projectId:project.id,type:"goal",title:"Ship local-first",body:"Operate without a network.",confidence:"medium"});
    const support=ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:decision.id,targetType:"knowledge",targetId:goal.id,relationshipType:"supports"});
    const reference=ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:decision.id,targetType:"document",targetId:document.id,relationshipType:"references"});
    const backlinks=ctx.service.relationships.list({projectId:project.id,entityType:"knowledge",entityId:goal.id});
    assert.deepEqual(backlinks.map(item=>item.id),[support.id]);
    assert.throws(()=>ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:decision.id,targetType:"knowledge",targetId:goal.id,relationshipType:"supports"}),/already exists/);
    assert.throws(()=>ctx.service.relationships.create({projectId:project.id,sourceType:"knowledge",sourceId:decision.id,targetType:"knowledge",targetId:decision.id,relationshipType:"duplicates"}),/itself/);
    ctx.service.close(); ctx.service.initialize();
    assert.equal(ctx.service.snapshot().relationships.length,2);
    assert.deepEqual(ctx.service.relationships.remove(reference.id),{id:reference.id});
    assert.equal(ctx.service.relationships.list({projectId:project.id}).length,1);
  } finally { ctx.dispose(); }
});

test("relationships cannot cross project boundaries", () => {
  const ctx=fixture(); try {
    const first=ctx.service.projects.create({name:"First Relations"}), second=ctx.service.projects.create({name:"Second Relations"});
    const source=ctx.service.knowledge.create({projectId:first.id,type:"fact",title:"First fact",body:"First.",confidence:"medium"});
    const target=ctx.service.knowledge.create({projectId:second.id,type:"fact",title:"Second fact",body:"Second.",confidence:"medium"});
    assert.throws(()=>ctx.service.relationships.create({projectId:first.id,sourceType:"knowledge",sourceId:source.id,targetType:"knowledge",targetId:target.id,relationshipType:"references"}),/project boundaries/);
  } finally { ctx.dispose(); }
});

test("knowledge folder assignment is organizational, project isolated, and drives Atlas placement", () => {
  const ctx=fixture(); try {
    const project=ctx.service.projects.create({name:"Organized Knowledge"}), other=ctx.service.projects.create({name:"Other Knowledge"});
    const folder=ctx.service.folders.create({projectId:project.id,parentFolderId:null,name:"decisions"});
    const otherFolder=ctx.service.folders.create({projectId:other.id,parentFolderId:null,name:"foreign"});
    const knowledge=ctx.service.knowledge.create({projectId:project.id,parentFolderId:folder.id,type:"decision",title:"Folder decision",body:"Placement is organization only.",confidence:"high"});
    assert.equal(knowledge.parentFolderId,folder.id);
    assert.equal(ctx.service.snapshot().atlasNodes.find(item=>item.id===knowledge.id)?.parentId,folder.id);
    assert.throws(()=>ctx.service.knowledge.update(knowledge.id,{parentFolderId:otherFolder.id}),/another project/);
    const unfiled=ctx.service.knowledge.update(knowledge.id,{parentFolderId:null});
    assert.equal(unfiled.parentFolderId,null);
    assert.equal(ctx.service.snapshot().atlasNodes.find(item=>item.id===knowledge.id)?.parentId,project.id);
  } finally { ctx.dispose(); }
});

test("managed source files import, index, persist, expose evidence, and report missing", () => {
  const ctx=fixture(); const sourceRoot=mkdtempSync(join(tmpdir(),"orbit-source-")); try {
    const sourcePath=join(sourceRoot,"research.txt");writeFileSync(sourcePath,"Phase 2.3 searchable source material.","utf8");
    const project=ctx.service.projects.create({name:"Source Project"}),folder=ctx.service.folders.create({projectId:project.id,parentFolderId:null,name:"sources"});
    const [file]=ctx.service.documents.importFiles({projectId:project.id,parentFolderId:folder.id,sourcePaths:[sourcePath]});
    assert.equal(file.kind,"file");assert.equal(file.availability,"available");assert.equal(readFileSync(ctx.service.documents.resolvePath(file.id),"utf8"),"Phase 2.3 searchable source material.");
    assert.equal(ctx.service.search({query:"searchable source",projectId:project.id})[0]?.id,file.id);
    const knowledge=ctx.service.knowledge.create({projectId:project.id,type:"fact",title:"Imported fact",body:"Backed by a managed source.",confidence:"high"});
    const evidence=ctx.service.evidence.attach({projectId:project.id,knowledgeObjectId:knowledge.id,sourceType:"file",sourceId:file.id,sourcePath:file.relativePath,excerpt:"searchable source material",locator:null,confidence:"verified"});
    assert.equal(evidence.sourceType,"file");assert.equal(ctx.service.evidence.list(knowledge.id)[0].availability,"available");
    ctx.service.close();ctx.service.initialize();assert.equal(ctx.service.documents.list(project.id).find(item=>item.id===file.id)?.availability,"available");
    rmSync(ctx.service.documents.resolvePath(file.id));assert.equal(ctx.service.documents.list(project.id).find(item=>item.id===file.id)?.availability,"missing");assert.equal(ctx.service.evidence.list(knowledge.id)[0].availability,"missing");
    assert.equal(existsSync(sourcePath),true);
  } finally { ctx.dispose();rmSync(sourceRoot,{recursive:true,force:true}); }
});

test("filesystem reconciliation registers dropped projects and external changes in place", () => {
  const ctx=fixture();try{
    const dropped=join(ctx.root,"projects","Dropped Project");mkdirSync(join(dropped,"src"),{recursive:true});mkdirSync(join(dropped,"node_modules","ignored"),{recursive:true});
    writeFileSync(join(dropped,"README.md"),"# Dropped Project\n\nVisible from disk.","utf8");writeFileSync(join(dropped,"src","index.ts"),"export const reconciled = true;","utf8");writeFileSync(join(dropped,"node_modules","ignored","package.js"),"ignored","utf8");
    const first=ctx.service.filesystem.reconcile();assert.equal(first.projectsAdded,1);assert.equal(first.foldersAdded,1);assert.equal(first.documentsAdded,2);assert.ok(first.ignoredEntries>=1);
    const project=ctx.service.projects.list().find(item=>item.name==="Dropped Project")!;assert.equal(project.storagePath,"Dropped Project");
    assert.deepEqual(ctx.service.documents.list(project.id).map(item=>item.relativePath),["README.md","src/index.ts"]);assert.equal(ctx.service.search({query:"reconciled",projectId:project.id})[0]?.title,"index.ts");
    writeFileSync(join(dropped,"src","new.txt"),"Added outside Orbit.","utf8");const second=ctx.service.filesystem.reconcile();assert.equal(second.documentsAdded,1);
    const original=ctx.service.documents.list(project.id).find(item=>item.title==="new.txt")!;renameSync(join(dropped,"src","new.txt"),join(dropped,"src","renamed.txt"));const third=ctx.service.filesystem.reconcile();assert.equal(third.documentsAdded,1);assert.equal(ctx.service.documents.list(project.id).find(item=>item.id===original.id)?.availability,"missing");
    assert.equal(ctx.service.filesystem.reconcile().projectsAdded,0);
    rmSync(dropped,{recursive:true,force:true});const removed=ctx.service.filesystem.reconcile();assert.equal(removed.projectsArchived,1);assert.equal(ctx.service.projects.list({status:"active"}).some(item=>item.id===project.id),false);assert.equal(ctx.service.projects.list({status:"archived"}).some(item=>item.id===project.id),true);
  }finally{ctx.dispose();}
});
