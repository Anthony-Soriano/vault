import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { AtlasNode } from "@orbit/vault-types";

type VaultItem = AtlasNode;
type VaultItemType = AtlasNode["type"];

export type GraphNode = VaultItem & {
  depth:number;childCount:number;descendantCount:number;path:string;branchId:string;
  targetX:number;targetY:number;clusterX:number;clusterY:number;
  x:number;y:number;vx:number;vy:number;fx?:number|null;fy?:number|null;
  radius:number;regionRadius:number;
};

export type StructuralEdge={id:string;sourceId:string;targetId:string;type:"contains"};
export type SemanticEdgeType="references"|"supports"|"contradicts"|"related_to";
export type SemanticEdge={id:string;sourceId:string;targetId:string;type:SemanticEdgeType};
export type AggregatedRelationshipBridge={sourceBranchId:string;targetBranchId:string;count:number;edgeIds:string[]};
export type HierarchyModel={nodes:GraphNode[];nodeById:Map<string,GraphNode>;childrenById:Map<string,GraphNode[]>;structuralEdges:StructuralEdge[];semanticEdges:SemanticEdge[]};

const stableUnit=(id:string)=>{let hash=2166136261;for(const character of id){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619);}return(hash>>>0)/4294967296;};
const stableAngle=(id:string)=>stableUnit(id)*Math.PI*2;
const radiusFor=(type:VaultItemType,depth:number,childCount:number)=>{
  if(depth===0)return 11;
  if(depth===1)return 12.5+Math.min(2,childCount*.22);
  if(type==="project")return 11+Math.min(1.5,childCount*.15);
  if(type==="folder")return 7.5+Math.min(1.8,childCount*.16);
  return 3.7;
};

export function createHierarchyModel(items:VaultItem[]):HierarchyModel{
  const itemById=new Map(items.map(item=>[item.id,item])),rawChildren=new Map<string,VaultItem[]>();
  for(const item of items){if(item.parentId&&!itemById.has(item.parentId))throw new Error(`Missing parent ${item.parentId} for ${item.id}`);if(item.parentId)rawChildren.set(item.parentId,[...(rawChildren.get(item.parentId)??[]),item]);}
  const roots=items.filter(item=>item.parentId===null);if(roots.length!==1)throw new Error("The demo hierarchy must contain exactly one root");
  const depthMemo=new Map<string,number>(),pathMemo=new Map<string,string>(),descendantMemo=new Map<string,number>();
  const depthOf=(item:VaultItem):number=>{const cached=depthMemo.get(item.id);if(cached!==undefined)return cached;const value=item.parentId?depthOf(itemById.get(item.parentId)!)+1:0;depthMemo.set(item.id,value);return value;};
  const pathOf=(item:VaultItem):string=>{const cached=pathMemo.get(item.id);if(cached)return cached;const value=item.parentId?`${pathOf(itemById.get(item.parentId)!)} / ${item.name}`:item.name;pathMemo.set(item.id,value);return value;};
  const branchOf=(item:VaultItem):string=>{if(!item.parentId)return item.id;const parent=itemById.get(item.parentId)!;return parent.parentId===null?item.id:branchOf(parent);};
  const descendantCountOf=(item:VaultItem):number=>{const cached=descendantMemo.get(item.id);if(cached!==undefined)return cached;const value=(rawChildren.get(item.id)??[]).reduce((sum,child)=>sum+1+descendantCountOf(child),0);descendantMemo.set(item.id,value);return value;};
  const nodes:GraphNode[]=items.map(item=>({...item,depth:depthOf(item),childCount:rawChildren.get(item.id)?.length??0,descendantCount:descendantCountOf(item),path:pathOf(item),branchId:branchOf(item),targetX:0,targetY:0,clusterX:0,clusterY:0,x:0,y:0,vx:0,vy:0,radius:0,regionRadius:0}));
  const nodeById=new Map(nodes.map(node=>[node.id,node])),childrenById=new Map<string,GraphNode[]>();
  for(const node of nodes)if(node.parentId)childrenById.set(node.parentId,[...(childrenById.get(node.parentId)??[]),node]);
  for(const children of childrenById.values())children.sort((a,b)=>a.id.localeCompare(b.id));
  const root=nodeById.get(roots[0].id)!;nodes.forEach(node=>{node.radius=radiusFor(node.type,node.depth,node.childCount);node.regionRadius=node.radius+7;});
  const projects=childrenById.get(root.id)??[];
  const footprint=(project:GraphNode)=>Math.max(125,Math.sqrt(project.descendantCount+1)*28);
  const largest=Math.max(125,...projects.map(footprint)),circumference=projects.reduce((sum,project)=>sum+footprint(project)*2+70,0);
  const orbit=projects.length<=1?0:Math.max(270,largest+circumference/(Math.PI*2));
  const clusterCenters=new Map<string,{x:number;y:number}>();
  projects.forEach((project,index)=>{const angle=stableAngle(root.id)+index*Math.PI*2/Math.max(1,projects.length);clusterCenters.set(project.id,{x:Math.cos(angle)*orbit,y:Math.sin(angle)*orbit});});
  root.clusterX=0;root.clusterY=0;root.x=0;root.y=0;
  for(const node of nodes){if(node===root)continue;const center=clusterCenters.get(node.branchId)??{x:0,y:0};node.clusterX=center.x;node.clusterY=center.y;const angle=stableAngle(node.id),seedRadius=12+Math.sqrt(Math.max(1,node.depth))*22+stableUnit(`${node.id}:radius`)*18;node.x=center.x+Math.cos(angle)*seedRadius;node.y=center.y+Math.sin(angle)*seedRadius;}
  const structuralEdges:StructuralEdge[]=nodes.filter((node):node is GraphNode&{parentId:string}=>node.parentId!==null).map(node=>({id:`${node.parentId}->${node.id}`,sourceId:node.parentId,targetId:node.id,type:"contains"}));
  const links=structuralEdges.map(edge=>({source:edge.sourceId,target:edge.targetId,id:edge.id})).sort((a,b)=>a.id.localeCompare(b.id));
  const simulationNodes=[...nodes].sort((a,b)=>a.id.localeCompare(b.id));
  forceSimulation(simulationNodes)
    .randomSource(()=>.5).alphaDecay(.025).velocityDecay(.36)
    .force("link",forceLink<GraphNode,typeof links[number]>(links).id(node=>node.id).distance(link=>{const target=typeof link.target==="string"?nodeById.get(link.target):link.target;return target?.depth===1?165:target?.childCount?58+stableUnit(`${target.id}:link`)*24:40+stableUnit(`${target?.id??"leaf"}:link`)*32;}).strength(link=>{const target=typeof link.target==="string"?nodeById.get(link.target):link.target;return target?.depth===1?.02:.18;}))
    .force("cluster-x",forceX<GraphNode>(node=>node.clusterX).strength(node=>node===root?.01:node.depth===1?.18:.032))
    .force("cluster-y",forceY<GraphNode>(node=>node.clusterY).strength(node=>node===root?.01:node.depth===1?.18:.032))
    .force("charge",forceManyBody<GraphNode>().strength(node=>node===root?-5:-62).distanceMin(8).distanceMax(220))
    .force("collide",forceCollide<GraphNode>(node=>node.regionRadius+2).strength(1).iterations(4)).stop().tick(520);
  const round=(value:number)=>Math.round(value*100)/100;
  nodes.forEach(node=>{node.targetX=round(node.x);node.targetY=round(node.y);node.x=node.targetX;node.y=node.targetY;node.vx=0;node.vy=0;node.fx=null;node.fy=null;});
  return{nodes,nodeById,childrenById,structuralEdges,semanticEdges:[]};
}

export function ancestorIds(node:GraphNode,nodeById:Map<string,GraphNode>){const ids:string[]=[];let current:GraphNode|undefined=node;while(current?.parentId){ids.push(current.parentId);current=nodeById.get(current.parentId);}return ids;}
export function isHiddenByCollapse(node:GraphNode,collapsed:Set<string>,nodeById:Map<string,GraphNode>){let parentId=node.parentId;while(parentId){if(collapsed.has(parentId))return true;parentId=nodeById.get(parentId)?.parentId??null;}return false;}
export function assertHierarchyModel(model:HierarchyModel){if(model.structuralEdges.length!==model.nodes.length-1)throw new Error("Every non-root node must have exactly one structural edge");for(const edge of model.structuralEdges){const child=model.nodeById.get(edge.targetId);if(!child||child.parentId!==edge.sourceId||edge.type!=="contains")throw new Error(`Invalid structural edge ${edge.id}`);}for(const node of model.nodes){if(node.type!=="file"||!node.parentId)continue;const parent=model.nodeById.get(node.parentId);if(!parent||node.radius>=parent.radius)throw new Error(`File ${node.id} must remain smaller than its parent`);}}
export function aggregateRelationshipBridges(edges:SemanticEdge[],nodeById:Map<string,GraphNode>){const bridges=new Map<string,AggregatedRelationshipBridge>();for(const edge of edges){const source=nodeById.get(edge.sourceId),target=nodeById.get(edge.targetId);if(!source||!target||source.branchId===target.branchId)continue;const pair=[source.branchId,target.branchId].sort(),key=pair.join("::"),bridge=bridges.get(key)??{sourceBranchId:pair[0],targetBranchId:pair[1],count:0,edgeIds:[]};bridge.count++;bridge.edgeIds.push(edge.id);bridges.set(key,bridge);}return[...bridges.values()];}
