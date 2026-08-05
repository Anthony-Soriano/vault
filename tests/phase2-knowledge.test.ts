import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VaultService } from "@orbit/vault-core";
import { SqliteVaultRepository } from "@orbit/vault-storage";

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "orbit-vault-phase2-"));
  const service = new VaultService(new SqliteVaultRepository({ vaultRoot: root, developmentMode: true, developmentRoot: root }));
  service.initialize();
  return { root, service, dispose: () => { service.close(); rmSync(root, { recursive: true, force: true }); } };
};

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
