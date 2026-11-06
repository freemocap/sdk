import {z} from 'zod';
import {ENVELOPE, ProcessingPlanSchema, TaskOperationSchema} from './message-contract.js';
import {MetricSeriesSchema,SamplePreviewSchema} from './pipeline-telemetry.js';

export const PipelineSnapshotSchema=z.object({
    run_id:z.string().uuid(),sequence:z.number().int().nonnegative(),
    status:z.enum(['queued','running','complete','failed','cancelled']),cancel_requested:z.boolean(),
    graph:z.object({definition:ProcessingPlanSchema.shape.graph,topological_order:z.array(z.string())}),
    operations:z.array(TaskOperationSchema),elapsed_seconds:z.number().nonnegative(),error:z.string().nullable(),
    metrics:z.array(MetricSeriesSchema),previews:z.array(SamplePreviewSchema),
}).superRefine((snapshot,ctx)=>{
    const ids=snapshot.graph.definition.nodes.map(node=>node.id);
    const order=snapshot.graph.topological_order;
    const operations=snapshot.operations.map(operation=>operation.operation_id);
    if(!ids.length||new Set(ids).size!==ids.length||new Set(order).size!==ids.length||order.length!==ids.length||order.some(id=>!ids.includes(id))||
       new Set(operations).size!==ids.length||operations.length!==ids.length||operations.some(id=>!ids.includes(id)))
        ctx.addIssue({code:'custom',message:'Snapshot must contain its complete graph order and every operation'});
    for(const entries of [snapshot.metrics,snapshot.previews]){
        const keys=entries.map(item=>JSON.stringify([item.operation_id,item.id]));
        if(new Set(keys).size!==keys.length||entries.some(item=>!ids.includes(item.operation_id)))
            ctx.addIssue({code:'custom',message:'Telemetry must identify unique items in existing operations'});
    }
});
export type PipelineSnapshot=z.infer<typeof PipelineSnapshotSchema>;
export const PipelineSnapshotMessageSchema=z.object({kind:z.literal('pipeline_snapshot'),...ENVELOPE,
    version:z.literal(1),snapshot:PipelineSnapshotSchema,
}).refine(message=>message.sequence===message.snapshot.sequence,{message:'Envelope and snapshot sequence disagree'});
export const pipelineSnapshotKind={version:1,parse:(message:unknown)=>PipelineSnapshotMessageSchema.parse(message)};
