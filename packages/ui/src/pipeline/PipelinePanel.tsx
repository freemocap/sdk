import {useId, useState, type ReactNode} from 'react';
import ProcessingGraphView, {type GraphFocus} from './ProcessingGraphView';
import {buildStageGraph, type PipelinePanelProps, type GraphNode, type ProcessingSection} from './model';
import {useExplainTarget} from './explain-registry';
import {OperationRow} from './OperationRow';

/** Shared setting content registers with Core's graph explanation scope. Values remain app-owned. */
export function PipelineSetting({id, label, description, children}: {
    id:string; label:string; description:string; children:ReactNode;
}) {
    const target=useExplainTarget(`setting:${id}`,label,description,'right');
    return <div ref={target} className="sdk-pipeline-setting"><div>{children}</div>
        <details><summary aria-label={`About ${label}`}>About {label}</summary><p>{description}</p></details>
    </div>;
}

// Core StageSection's expanded section lifecycle; app switches/settings replace mocap-specific controls.
function StageSection({node,section,locked,onFocus,onOpenArtifact}:{node:GraphNode;section:ProcessingSection;locked:boolean;onFocus:()=>void;onOpenArtifact?: (path:string)=>void}) {
    const [expanded,setExpanded]=useState(true);
    const bodyId=useId();
    return <section className="sdk-pipeline-section" aria-label={section.title} data-stage-id={node.id}>
        <div className="sdk-pipeline-section-heading">
            <button type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={()=>setExpanded(!expanded)}>
                <span aria-hidden="true">{expanded?'▾':'▸'}</span><span>{section.number}</span><h2>{section.title}</h2>
            </button>
            <span className="pg-pill">{node.presentation.availability}</span>
            <button type="button" onClick={onFocus} aria-label={`Show ${section.title} in graph`}>↗ Graph</button>
        </div>
        <div id={bodyId} hidden={!expanded}>
            <p className="sdk-pipeline-description">{node.presentation.description}</p>
            <div className="sdk-pipeline-stage-status"><p>{node.presentation.reason}</p>{node.presentation.summary}</div>
            <div className="sdk-pipeline-port-list"><span>Inputs: {node.inputs.length ? node.inputs.map(key=>JSON.parse(key)[2]).join(', ') : 'Application inputs'}</span>
                <span>Outputs: {node.outputs.map(key=>JSON.parse(key)[2]).join(', ') || 'None'}</span></div>
            <div className="sdk-pipeline-configuration" inert={locked}>{section.content}</div>
            {node.operation && <div className="sdk-pipeline-operation"><OperationRow operation={node.operation} title={node.operation.label}/></div>}
            {!!node.presentation.artifacts?.length && <div className="sdk-pipeline-artifacts">{node.presentation.artifacts.map(path=>onOpenArtifact
                ? <button key={path} type="button" onClick={()=>onOpenArtifact(path)} title={path}>{path}</button>
                : <span key={path}>{path}</span>)}</div>}
        </div>
    </section>;
}

/** Real typed graph and one app-owned set of settings, presented as Core's graph or section list. */
export function PipelinePanel({graph,nodePresentation,view,onViewChange,locked=false,notice,actions,operations=[],onOpenArtifact}:PipelinePanelProps) {
    const [focus,setFocus]=useState<GraphFocus|null>(null);
    let visual;
    try {visual=buildStageGraph(graph,nodePresentation,operations);} catch(error) {
        return <p role="alert">{error instanceof Error ? error.message : String(error)}</p>;
    }
    const sections:ProcessingSection[]=visual.nodes.map((node,index)=>({id:node.id,number:index+1,title:node.presentation.label,
        content:node.presentation.configuration ?? null,presentation:node.presentation}));
    return <section className="sdk-pipeline-panel" aria-label="Pipeline control panel">
        <div className="sdk-pipeline-toolbar">
            <div role="group" aria-label="Pipeline view">
                <button type="button" aria-pressed={view==='list'} onClick={()=>onViewChange('list')}>List</button>
                <button type="button" aria-pressed={view==='graph'} onClick={()=>onViewChange('graph')}>Graph</button>
            </div>{actions}
        </div>
        {notice && <div className="sdk-pipeline-notice">{notice}</div>}
        <div className="sdk-pipeline-body">
            {view==='graph' ? <ProcessingGraphView graph={visual} sections={sections} notice={null} locked={locked}
                focus={focus} onFocus={setFocus} onOpenArtifact={onOpenArtifact}/> :
                <div className="sdk-pipeline-list">{visual.nodes.map((node,index)=><StageSection key={node.id} node={node} section={sections[index]}
                    locked={locked} onOpenArtifact={onOpenArtifact} onFocus={()=>{setFocus({id:node.id,explain:false});onViewChange('graph');}}/>)}</div>}
        </div>
    </section>;
}
