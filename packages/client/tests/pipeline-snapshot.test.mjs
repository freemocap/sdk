import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pipelineSnapshotKind,parseApplicationMessage} from '../dist/index.js';

const operation={operation_id:'publish',label:'Publish',stage:null,effects:['write_disk'],dependencies:[],waiting_for:[],blocked_by:[],files_read:[],files_written:[],status:'complete',progress_fraction:1,detail:'',completed:1,total:1,unit:'artifact',items:[],elapsed_seconds:1,seconds_per_motion_frame:null};
const message={kind:'pipeline_snapshot',version:1,timestamp:1,sequence:4,snapshot:{run_id:'321fba64-005c-47ab-bcba-b1db22c9cecb',sequence:4,status:'complete',cancel_requested:false,graph:{definition:{nodes:[{id:'publish',operation:'publish',execution_resource:'compute',stage:null,effects:['write_disk'],inputs:[],outputs:[]}],edges:[]},topological_order:['publish']},operations:[operation],metrics:[],previews:[],elapsed_seconds:1,error:null}};

test('full retained pipeline state validates independently, including blocked operations',()=>{
 assert.deepEqual(parseApplicationMessage(pipelineSnapshotKind,message),message);
 const blocked=structuredClone(message);blocked.snapshot.operations[0].status='blocked';blocked.snapshot.operations[0].blocked_by=['upstream'];blocked.snapshot.status='failed';
 assert.equal(pipelineSnapshotKind.parse(blocked).snapshot.operations[0].status,'blocked');
});
test('incomplete graph state and mismatched envelope cannot masquerade as valid progress',()=>{
 const missing=structuredClone(message);missing.snapshot.operations=[];
 assert.throws(()=>pipelineSnapshotKind.parse(missing),/complete graph/);
 assert.throws(()=>pipelineSnapshotKind.parse({...message,sequence:5}),/sequence disagree/);
 const count=structuredClone(message);count.snapshot.operations[0].completed=-1;
 assert.throws(()=>pipelineSnapshotKind.parse(count));
 assert.equal(parseApplicationMessage(pipelineSnapshotKind,{...message,version:2}),null);
});

test('telemetry retains explicit units, sample identity, and complete reconnect history',()=>{
 const sample=structuredClone(message);
 sample.snapshot.metrics=[{operation_id:'publish',id:'loss',label:'Training loss',step_label:'Epoch',unit:'loss',points:[{step:1,value:2},{step:2,value:1.5}],omitted_points:0}];
 sample.snapshot.previews=[{operation_id:'publish',id:'left',label:'Left sample',image_url:'/samples/e2.png',step:2,step_label:'Epoch',checkpoint_id:'epoch-2'}];
 assert.deepEqual(pipelineSnapshotKind.parse(sample),sample);
 for(const change of [s=>s.metrics[0].points[0].value=NaN,s=>s.metrics[0].points[1].step=0,
    s=>s.metrics[0].operation_id='missing',s=>s.metrics.push(s.metrics[0]),
    s=>s.previews[0].image_url='file:///private.png',s=>s.previews[0].image_url='javascript:alert(1)',
    s=>delete s.metrics]){
   const invalid=structuredClone(sample);change(invalid.snapshot);
   assert.throws(()=>pipelineSnapshotKind.parse(invalid));
 }
});
