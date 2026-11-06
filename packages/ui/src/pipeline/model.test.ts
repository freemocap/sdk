import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildStageGraph,type PipelineGraph,type PipelineStagePresentation} from './model';
import {stageLayout,portOffset} from './stage-layout';

const contract={kind:'artifact',data_granularity:'recording' as const,namespace:'example',reference_frame:null,units:null};
const meta:PipelineStagePresentation={label:'Stage',description:'An example stage',kind:'computation',availability:'available',reason:'Inputs available'};
function fixture() {
    const ids=['input','extract','geometry','pose','candidates','review','dataset'];
    const graph:PipelineGraph={definition:{nodes:ids.map((id,index)=>({id,operation:id,execution_resource:'compute',stage:null,effects:[],
        inputs:index?[{name:'input',contract}]:[],outputs:[{name:'output',contract}]})),
        edges:ids.slice(1).map((id,index)=>({source:{node:ids[index],port:'output'},target:{node:id,port:'input'},binding:'same_key'}))},topological_order:ids};
    const metadata=Object.fromEntries(ids.map(id=>[id,{...meta,label:id,...(id==='review'?{kind:'review',availability:'manual',reason:'Human approval required'}:id==='dataset'?{kind:'publication',availability:'unimplemented',reason:'Not implemented'}:{})}])) as Record<string,PipelineStagePresentation>;
    return {graph,metadata};
}
test('manual and unimplemented stages retain declared edges without pretending to execute',()=>{
    const {graph,metadata}=fixture();const view=buildStageGraph(graph,metadata);
    assert.equal(view.nodes[5].state,'manual');assert.equal(view.nodes[6].state,'unimplemented');
    assert.equal(view.wires.length,6);assert.ok(view.nodes.every(n=>n.operation===undefined));
    const layout=stageLayout(view,{review:{height:800,ports:{}}});
    for(const node of view.nodes) assert.ok(layout.boxes.get(node.id));
    const wrap=view.wires[2], path=layout.wires[2].d;
    const source=layout.boxes.get(wrap.source)!,target=layout.boxes.get(wrap.target)!;
    assert.ok(path.startsWith(`M${source.x+source.w},${source.y+portOffset(view.nodes[2],'out',wrap.sourcePort)}`));
    assert.ok(path.endsWith(`${target.x},${target.y+portOffset(view.nodes[3],'in',wrap.targetPort)}`));
    assert.ok(layout.boxes.get('dataset')!.y>layout.boxes.get('input')!.y);
    assert.equal(new Set([...layout.boxes.values()].map(box=>box.y)).size,2);
    assert.ok(layout.boxes.get('dataset')!.x>layout.boxes.get('review')!.x);
    assert.ok(layout.height>=800);
});
test('malformed dependencies cannot render a misleading valid workflow',()=>{
    const {graph,metadata}=fixture();
    graph.definition.edges[0].source.port='missing';assert.throws(()=>buildStageGraph(graph,metadata),/unknown port/);
    graph.definition.edges[0].source.port='output';graph.topological_order.reverse();assert.throws(()=>buildStageGraph(graph,metadata),/dependency/);
});
test('missing metadata and required bindings are reported instead of disappearing',()=>{
    const {graph,metadata}=fixture();delete metadata.pose;assert.throws(()=>buildStageGraph(graph,metadata),/Missing presentation/);
    metadata.pose=meta;graph.definition.edges.pop();assert.throws(()=>buildStageGraph(graph,metadata),/unbound input/);
});

test('wrapped measurements drive wire anchors and separate expanded rows',()=>{
    const {graph,metadata}=fixture();const view=buildStageGraph(graph,metadata);
    const source=view.nodes[3],target=view.nodes[4];
    const layout=stageLayout(view,{pose:{height:900,ports:{[source.outputs[0]]:143}},candidates:{height:400,ports:{[target.inputs[0]]:187}}});
    const from=layout.boxes.get('pose')!,to=layout.boxes.get('candidates')!;
    assert.ok(to.y>from.y+from.h);
    assert.ok([...layout.boxes.values()].every(box=>box.w===360));
    const path=layout.wires[3].d;
    assert.ok(path.startsWith(`M${from.x+from.w},${from.y+143}`));
    assert.ok(path.endsWith(`${to.x},${to.y+187}`));
    assert.equal((path.match(/Q/g)??[]).length,4,'all gutter corners are rounded');
});

test('single-row opt-in keeps four measured cards readable without changing default wrapping',()=>{
    const {graph,metadata}=fixture();
    graph.definition.nodes=graph.definition.nodes.slice(0,4);
    graph.definition.edges=graph.definition.edges.slice(0,3);
    graph.topological_order=graph.topological_order.slice(0,4);
    const view=buildStageGraph(graph,metadata);
    const layout=stageLayout(view,{pose:{height:900,ports:{}}},'single-row');
    const boxes=[...layout.boxes.values()];
    assert.equal(new Set(boxes.map(box=>box.y)).size,1);
    assert.ok(boxes.every(box=>box.w===360));
    assert.ok(layout.height>=boxes[3].y+900);
    assert.ok(boxes.every((box,i)=>!i||box.x>=boxes[i-1].x+boxes[i-1].w));
    assert.equal(layout.wires.length,3);
    assert.equal(new Set([...stageLayout(view,{}).boxes.values()].map(box=>box.y)).size,2);
});
