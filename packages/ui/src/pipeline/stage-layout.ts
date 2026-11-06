// Core's measured cards generalized to application-defined stages and wrapped ports.
import type {DataKey, GraphNode, NodeId, StageGraph} from './model';
export const NODE_WIDTH = 360;
export const ROWS = {head: 44, portsPad: 6, port: 26};
export interface Box {x:number; y:number; w:number; h:number}
export interface NodeMeasurement {height:number;ports:Record<DataKey,number>}
export interface StageLayout {boxes:Map<NodeId,Box>; wires:{id:string;d:string}[];width:number;height:number}
export function portOffset(node:GraphNode,direction:'in'|'out',data:DataKey):number {
    const ports = direction === 'out' ? node.outputs : node.inputs;
    const index = ports.indexOf(data);
    if (index < 0) throw new Error(`${node.id} has no ${direction} port ${data}`);
    return ROWS.head + ROWS.portsPad + (index + (direction === 'in' ? node.outputs.length : 0)) * ROWS.port + ROWS.port / 2;
}
interface Point {x:number;y:number}
/** Round each gutter corner with tangent quadratic arcs; never cut across a card. */
export function roundedRoute(points:Point[],radius=16):string {
    let d=`M${points[0].x},${points[0].y}`;
    for(let i=1;i<points.length-1;i++) {
        const before=points[i-1],at=points[i],after=points[i+1];
        const a=Math.hypot(at.x-before.x,at.y-before.y),b=Math.hypot(after.x-at.x,after.y-at.y);
        if(!a||!b)continue;
        const r=Math.min(radius,a/2,b/2);
        const enter={x:at.x+(before.x-at.x)*r/a,y:at.y+(before.y-at.y)*r/a};
        const leave={x:at.x+(after.x-at.x)*r/b,y:at.y+(after.y-at.y)*r/b};
        d+=` L${enter.x},${enter.y} Q${at.x},${at.y} ${leave.x},${leave.y}`;
    }
    const end=points[points.length-1];return d+` L${end.x},${end.y}`;
}
export function stageLayout(graph:StageGraph,measurements:Partial<Record<NodeId,NodeMeasurement>>,layout:'two-rows'|'single-row'='two-rows'):StageLayout {
    const boxes=new Map<NodeId,Box>();
    if(!graph.nodes.length)return {boxes,wires:[],width:0,height:0};
    const columns=layout==='single-row'?graph.nodes.length:Math.ceil(graph.nodes.length/2),margin=64,gap=80,rowGap=112;
    let y=margin;
    for(let start=0;start<graph.nodes.length;start+=columns) {
        const row=graph.nodes.slice(start,start+columns);
        row.forEach((node,index)=>boxes.set(node.id,{x:margin+index*(NODE_WIDTH+gap),y,w:NODE_WIDTH,
            h:measurements[node.id]?.height??ROWS.head+ROWS.portsPad*2+ROWS.port*(node.inputs.length+node.outputs.length)+160}));
        y+=Math.max(...row.map(node=>boxes.get(node.id)!.h))+rowGap;
    }
    const wires=graph.wires.map((wire,index)=>{
        const from=boxes.get(wire.source)!,to=boxes.get(wire.target)!;
        const a={x:from.x+from.w,y:from.y+(measurements[wire.source]?.ports[wire.sourcePort]??portOffset(graph.nodes.find(n=>n.id===wire.source)!,'out',wire.sourcePort))};
        const b={x:to.x,y:to.y+(measurements[wire.target]?.ports[wire.targetPort]??portOffset(graph.nodes.find(n=>n.id===wire.target)!,'in',wire.targetPort))};
        if(from.y===to.y && to.x===from.x+NODE_WIDTH+gap) {
            const k=(b.x-a.x)/2;
            return {id:wire.id,d:`M${a.x},${a.y} C${a.x+k},${a.y} ${b.x-k},${b.y} ${b.x},${b.y}`};
        }
        const lane=(from.y===to.y?from.y:Math.max(from.y,to.y))-28-index%4*10;
        const outX=a.x+gap/2,inX=b.x-gap/2;
        return {id:wire.id,d:roundedRoute([a,{x:outX,y:a.y},{x:outX,y:lane},{x:inX,y:lane},{x:inX,y:b.y},b])};
    });
    return {boxes,wires,width:Math.max(...[...boxes.values()].map(b=>b.x+b.w))+margin,height:y-rowGap+margin};
}
