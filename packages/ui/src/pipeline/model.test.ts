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
    const layout=stageLayout(view,{review:800});
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
