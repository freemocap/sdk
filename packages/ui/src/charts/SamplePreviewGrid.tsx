import {useState} from 'react';
import type {SamplePreview} from '@freemocap/client';

export interface SamplePreviewGridProps {
    previews:readonly SamplePreview[];
    /** Resolve root-relative backend routes when UI and API have different origins. */
    resolveImageUrl?:(url:string)=>string;
}
function Preview({preview,url}:{preview:SamplePreview;url:string}){
    const [loaded,setLoaded]=useState<string|null>(null);
    const [failed,setFailed]=useState<string|null>(null);
    return <figure className="sdk-sample-preview">
        <div className="sdk-sample-image" aria-busy={loaded!==url&&failed!==url}>
            {failed!==url&&<img key={url} src={url} alt={preview.label} loading="lazy" decoding="async"
                onLoad={()=>setLoaded(url)} onError={()=>setFailed(url)} style={{opacity:loaded===url?1:0}}/>}
            {failed===url?<span role="status">Preview unavailable</span>:loaded!==url&&<span>Loading preview…</span>}
        </div>
        <figcaption><strong>{preview.label}</strong><span>{preview.step_label} {preview.step}</span>
            {preview.checkpoint_id&&<small title={preview.checkpoint_id}>Checkpoint: {preview.checkpoint_id}</small>}
        </figcaption>
    </figure>;
}
export function SamplePreviewGrid({previews,resolveImageUrl}:SamplePreviewGridProps){
    if(!previews.length)return <p className="sdk-telemetry-empty">Sample predictions will appear when available.</p>;
    return <div className="sdk-sample-grid">{previews.map(preview=><Preview
        key={JSON.stringify([preview.operation_id,preview.id])} preview={preview}
        url={resolveImageUrl?resolveImageUrl(preview.image_url):preview.image_url}/>)}</div>;
}
