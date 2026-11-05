// Core's measured cards and fixed port rows, generalized from its hardcoded mocap layout.
import type {DataKey, GraphNode, NodeId, StageGraph} from './model';
export const NODE_WIDTH = 360;
export const ROWS = {head: 44, portsPad: 6, port: 26};
export interface Box {x:number; y:number; w:number; h:number}
export interface StageLayout {boxes:Map<NodeId,Box>; wires:{id:string;d:string}[];width:number;height:number}
export function portOffset(node:GraphNode,direction:'in'|'out',data:DataKey):number {
    const ports = direction === 'out' ? node.outputs : node.inputs;
    const index = ports.indexOf(data);
    if (index < 0) throw new Error(`${node.id} has no ${direction} port ${data}`);
    return ROWS.head + ROWS.portsPad + (index + (direction === 'in' ? node.outputs.length : 0)) * ROWS.port + ROWS.port / 2;
}
export function stageLayout(graph:StageGraph,heights:Partial<Record<NodeId,number>>):StageLayout {
    const boxes = new Map<NodeId,Box>();
    const columns = 3, margin = 48, gap = 110;
    let y = margin;
    for (let start=0; start<graph.nodes.length; start+=columns) {
        const row = graph.nodes.slice(start,start+columns);
        row.forEach((node,index) => boxes.set(node.id,{x:margin+index*(NODE_WIDTH+gap),y,w:NODE_WIDTH,
            h:heights[node.id] ?? ROWS.head+ROWS.portsPad*2+ROWS.port*(node.inputs.length+node.outputs.length)+160}));
        y += Math.max(...row.map(node=>boxes.get(node.id)!.h))+120;
    }
    const wires = graph.wires.map((wire,index)=> {
        const from = boxes.get(wire.source)!, to = boxes.get(wire.target)!;
        const a = {x:from.x+from.w,y:from.y+portOffset(graph.nodes.find(n=>n.id===wire.source)!,'out',wire.sourcePort)};
        const b = {x:to.x,y:to.y+portOffset(graph.nodes.find(n=>n.id===wire.target)!,'in',wire.targetPort)};
        if (from.y===to.y && to.x-from.x < (NODE_WIDTH+gap)*1.5) {
            const k = Math.max(36,(b.x-a.x)*.5);
            return {id:wire.id,d:`M${a.x},${a.y} C${a.x+k},${a.y} ${b.x-k},${b.y} ${b.x},${b.y}`};
        }
        // Route skip/row-wrap edges in a gutter outside intervening cards.
        const lane = to.y===from.y ? from.y-20-index%4*6 : to.y-40-index%4*9;
        return {id:wire.id,d:`M${a.x},${a.y} C${a.x+38},${a.y} ${a.x+38},${lane} ${a.x+50},${lane} L${b.x-42},${lane} C${b.x-22},${lane} ${b.x-30},${b.y} ${b.x},${b.y}`};
    });
    return {boxes,wires,width:Math.max(...[...boxes.values()].map(b=>b.x+b.w))+margin+60,height:y-120+margin};
}
