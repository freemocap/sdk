import {useState} from 'react';
import {createPortal} from 'react-dom';
import {PipelineDialog} from '../pipeline/PipelineDialog';
import AnchoredInfo from '../components/ui-components/AnchoredInfo';

/** Two real, identically framed assets. Hover never attempts to erase annotations. */
export function AnnotationImage({annotatedUrl,rawUrl,label,showAnnotations=true}:{
    annotatedUrl:string|null;rawUrl?:string|null;label:string;showAnnotations?:boolean;
}) {
    const [hovered,setHovered]=useState(false);
    const [rawState,setRawState]=useState<{url:string;failed:boolean}|null>(null);
    const [annotatedState,setAnnotatedState]=useState<{url:string;failed:boolean}|null>(null);
    const rawRequested=!!rawUrl&&(hovered||!showAnnotations);
    const selected=rawRequested?rawUrl:annotatedUrl;
    const state=rawRequested?rawState:annotatedState;
    const ready=!!selected&&state?.url===selected&&!state.failed;
    const failed=!selected||(state?.url===selected&&state.failed);
    return <span className="sdk-annotation-image" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
        {annotatedUrl&&<img src={annotatedUrl} alt={rawRequested?'':label} aria-hidden={rawRequested} loading="eager" decoding="async"
            style={{visibility:!rawRequested&&ready?'visible':'hidden'}}
            onLoad={()=>setAnnotatedState({url:annotatedUrl,failed:false})} onError={()=>setAnnotatedState({url:annotatedUrl,failed:true})}/>}
        {rawUrl&&<img src={rawUrl} alt={rawRequested?label:''} aria-hidden={!rawRequested} loading="eager" decoding="async"
            style={{visibility:rawRequested&&ready?'visible':'hidden'}}
            onLoad={()=>setRawState({url:rawUrl,failed:false})} onError={()=>setRawState({url:rawUrl,failed:true})}/>}
        {!ready&&<span className="sdk-image-thumbnail-unavailable">{failed?'Image unavailable':'Loading image…'}</span>}
    </span>;
}

export function ImagePreview({label,annotatedUrl,rawUrl,showAnnotations,onClose}:{
    label:string;annotatedUrl:string;rawUrl?:string|null;showAnnotations:boolean;onClose:()=>void;
}) {
    const [annotations,setAnnotations]=useState(showAnnotations);
    return createPortal(<PipelineDialog title={label} onClose={onClose}>
        <div className="sdk-image-preview-controls">
            <label><input type="checkbox" checked={annotations} disabled={!rawUrl} onChange={e=>setAnnotations(e.target.checked)}/>Annotations</label>
            <AnchoredInfo title="Image preview controls" text="This is the full image. Hover over it to temporarily hide annotations; move away to restore them. The annotation checkbox supports keyboard and touch. Escape closes the preview."/>
        </div>
        <div className="sdk-image-preview-surface"><AnnotationImage annotatedUrl={annotatedUrl} rawUrl={rawUrl} label={label} showAnnotations={annotations}/></div>
    </PipelineDialog>,document.body);
}
