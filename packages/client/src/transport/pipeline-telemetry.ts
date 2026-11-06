import {z} from 'zod';

const name=z.string().min(1).max(256);
const axisLabel=z.string().min(1).max(64);
export const MetricPointSchema=z.object({step:z.number().finite().nonnegative(),value:z.number().finite()});
export const MetricSeriesSchema=z.object({
    operation_id:z.string(),id:name,label:name,step_label:axisLabel,unit:axisLabel,
    points:z.array(MetricPointSchema),omitted_points:z.number().int().nonnegative(),
}).refine(series=>series.points.every((point,index)=>index===0||point.step>series.points[index-1].step),
    {message:'Metric points must have increasing steps'});
export const SamplePreviewSchema=z.object({
    operation_id:z.string(),id:name,label:name,
    image_url:z.string().min(1).max(4096).refine(value=>{
        if(value.includes('\\'))return false;
        if(value.startsWith('/')&&!value.startsWith('//'))return true;
        try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!!url.host;}catch{return false;}
    },{message:'Preview needs an HTTP(S) or root-relative artifact URL'}),
    step:z.number().finite().nonnegative(),step_label:axisLabel,checkpoint_id:z.string().max(1024).nullable(),
});
export type MetricPoint=z.infer<typeof MetricPointSchema>;
export type MetricSeries=z.infer<typeof MetricSeriesSchema>;
export type SamplePreview=z.infer<typeof SamplePreviewSchema>;
