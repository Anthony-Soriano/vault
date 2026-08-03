const port = process.argv[2] ?? "9341";
const vaultPath = process.argv[3];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
if (!targets[0]?.webSocketDebuggerUrl) throw new Error(`No renderer target on port ${port}`);
const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
const evaluate = expression => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, message => {
    if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text));
    else resolve(message.result.result?.value);
  });
  socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});
const clickText = text => evaluate(`(()=>{const button=[...document.querySelectorAll("button")].find(item=>item.textContent.trim()===${JSON.stringify(text)});button?.click();return Boolean(button)})()`);
const setGraphSearch = value => evaluate(`(()=>{const input=document.querySelector(".graph-search input");if(!input)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event("input",{bubbles:true}));return true})()`);

const output = {};
if (vaultPath) {
  output.lifecycle = await evaluate(`(async()=>{const response=await window.vault.lifecycle.switch(${JSON.stringify(vaultPath)});return response.value??response})()`);
  await sleep(700);
}
output.initial = await evaluate(`(async()=>{const raw=await window.vault.snapshot();const snapshot=raw.value??raw;return {projects:snapshot.projects.map(({id,name,status})=>({id,name,status})),documents:snapshot.documents.map(({title,status})=>({title,status}))}})()`);
await clickText("Atlas");
await sleep(700);
output.graph = await evaluate(`({graph:Boolean(document.querySelector(".graph-v2")),canvas:Boolean(document.querySelector("canvas.graph")),controls:Boolean(document.querySelector(".graph-controls")),motion:[...document.querySelectorAll(".switch-row")].some(item=>item.textContent.includes("Live motion")),labels:[...document.querySelectorAll(".switch-row")].some(item=>item.textContent.includes("Labels")),projects:document.querySelectorAll(".group-row").length,zoom:document.querySelector(".graph-actions span")?.textContent})`);
await clickText("Collapse all");
await setGraphSearch("phase11-renamed.md");
await sleep(500);
output.collapsedSearch = await evaluate(`([...document.querySelectorAll(".graph-search .search-results button b")].map(item=>item.textContent))`);
await evaluate(`(()=>{document.querySelector(".graph-search .search-results button")?.click();return true})()`);
await sleep(300);
output.focus = await evaluate(`({selection:document.querySelector(".selection-pill b")?.textContent,open:Boolean([...document.querySelectorAll(".selection-pill button")].find(item=>item.textContent.trim()==="Open"))})`);
output.zoomBefore = await evaluate(`document.querySelector(".graph-actions span")?.textContent`);
await evaluate(`(()=>{document.querySelector("button[title='Zoom in']")?.click();return true})()`);
await sleep(300);
output.zoomAfter = await evaluate(`document.querySelector(".graph-actions span")?.textContent`);
output.created = await evaluate(`(async()=>{const raw=await window.vault.snapshot();const snapshot=raw.value??raw;let documentFile=snapshot.documents.find(item=>item.title==="graph-sync-check.md");if(!documentFile){const project=snapshot.projects.find(item=>item.status==="active")??snapshot.projects[0];if(!project)throw new Error("No project available for graph synchronization check");const response=await window.vault.documents.createMarkdown({projectId:project.id,parentFolderId:null,title:"graph-sync-check.md"});documentFile=response.value??response;await window.vault.documents.updateContent(documentFile.id,"# Graph Sync Check\\n\\nInstalled 0.1.2 graph synchronization and restart persistence verified.")}return {id:documentFile.id,title:documentFile.title}})()`);
await sleep(800);
await setGraphSearch("graph-sync-check");
await sleep(500);
output.synchronizedSearch = await evaluate(`([...document.querySelectorAll(".graph-search .search-results button b")].map(item=>item.textContent))`);
await evaluate(`(()=>{document.querySelector(".graph-search .search-results button")?.click();return true})()`);
await sleep(300);
output.synchronizedFocus = await evaluate(`document.querySelector(".selection-pill b")?.textContent`);
output.persistence = await evaluate(`(async()=>{const raw=await window.vault.snapshot();const snapshot=raw.value??raw;const documentFile=snapshot.documents.find(item=>item.title==="graph-sync-check.md");const readResponse=await window.vault.documents.read(documentFile.id);const searchResponse=await window.vault.search.query({query:"restart persistence verified",limit:20});const read=readResponse.value??readResponse;const results=searchResponse.value??searchResponse;return {content:read.content,searchTitles:results.map(item=>item.title)}})()`);

console.log(JSON.stringify(output, null, 2));
socket.close();
