import {useId, useState, useRef, type ReactNode} from 'react';
import ProcessingGraphView, {type GraphFocus} from './ProcessingGraphView';
import {buildStageGraph, type PipelinePanelProps, type GraphNode, type ProcessingSection} from './model';
import SettingRow from './settings/setting-row';
import AnchoredInfo from '../components/ui-components/AnchoredInfo';
import {OperationRow} from './OperationRow';

/** Legacy wrapper delegates to the same Core row/info primitive as new forms. */
export function PipelineSetting({label,description,children}:{id:string;label:string;description:string;children:ReactNode}) {
    return <SettingRow label={label} info={{title:label,text:description}} control={children}/>;
}

// Core StageSection, with application-owned settings and status instead of Mocap toggles.
function StageSection({node,section,locked,expanded,onToggle}:{node:GraphNode;section:ProcessingSection;locked:boolean;expanded:boolean;onToggle:()=>void}) {
    const bodyId=useId();
    return <section className={`settings-section mp-section sdk-stage-${node.presentation.kind}`} aria-label={section.title} data-stage-id={node.id}>
        <div className="settings-section-header mp-section-header">
            <button type="button" className="mp-section-title" aria-label={`Toggle ${section.title} settings`} aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle}>
                <span className="settings-section-chevron"/><span className="mp-outline-number">{section.number}</span>
                <h2 className="settings-section-title">{section.title}</h2>
            </button>
            <AnchoredInfo title={section.title} text={<>{node.presentation.description}<p>{node.presentation.reason}</p>
                {node.presentation.artifacts?.map(path=><p key={path}>{path}</p>)}</>}/>
            <span className="settings-section-summary">{node.presentation.availability!=='reusable' && <span className="settings-summary-chip">{node.presentation.availability}</span>}{node.presentation.summary}</span>
        </div>
        <div id={bodyId} className="settings-section-body" hidden={!expanded} inert={locked}>
            {section.content}
            {node.operation && <OperationRow operation={node.operation} title={node.operation.label}/>}
        </div>
    </section>;
}

/** Core MocapSetupModal composition: run header, left ProcessingOutline, StageSection list or graph. */
export function PipelinePanel({graph,nodePresentation,view,graphLayout='two-rows',onViewChange,locked=false,notice,actions,operations=[],onOpenArtifact}:PipelinePanelProps) {
    const [focus,setFocus]=useState<GraphFocus|null>(null);
    const [active,setActive]=useState<string|null>(null);
    const [expanded,setExpanded]=useState<Record<string,boolean>>({});
    const toggle=(id:string)=>setExpanded(previous=>({...previous,[id]:!(previous[id]??true)}));
    const sectionsRef=useRef(new Map<string,HTMLDivElement>());
    let visual;try {visual=buildStageGraph(graph,nodePresentation,operations);} catch(error) {
        return <p role="alert">{error instanceof Error ? error.message : String(error)}</p>;
    }
    const sections:ProcessingSection[]=visual.nodes.map((node,index)=>({id:node.id,number:index+1,title:node.presentation.label,
        content:node.presentation.configuration ?? null,presentation:node.presentation}));
    const pick=(id:string)=>{setActive(id);if(view==='graph')setFocus({id,explain:false});
        else sectionsRef.current.get(id)?.scrollIntoView({behavior:'smooth',block:'start'});};
    return <section className="sdk-pipeline-panel" aria-label="Pipeline control panel">
        <div className="mp-head">
            <div role="group" aria-label="Pipeline view" className="mp-seg">{(['list','graph'] as const).map(option=>
                <button key={option} type="button" aria-pressed={view===option} className={view===option?'on':''}
                    onClick={()=>onViewChange(option)}>{option==='list'?'List':'Graph'}</button>)}</div>
            <div className="sdk-pipeline-actions">{actions}</div>
        </div>
        {notice && <div role="alert" className="sdk-pipeline-validation">{notice}</div>}
        <div className="mp-body">
            <nav className="mp-outline" aria-label="Workflow stages"><span className="mp-outline-heading">Pipeline</span>
                <ul>{sections.map(section=><li key={section.id} className={`mp-outline-row${(view==='graph'?focus?.id:active)===section.id?' active':''}`}>
                    <button type="button" className="mp-outline-link" title={section.title} onClick={()=>pick(section.id)}>
                        <span className="mp-outline-number">{section.number}</span>{section.title}</button>
                </li>)}</ul>
            </nav>
            <main className="mp-main">
                {view==='graph'?<ProcessingGraphView graph={visual} sections={sections} notice={null} locked={locked}
                    graphLayout={graphLayout} focus={focus} onFocus={setFocus} expanded={expanded} onToggle={toggle} onOpenArtifact={onOpenArtifact}/>:
                    <div className="mp-list settings-layout">{visual.nodes.map((node,index)=><div key={node.id} ref={element=>{
                        if(element)sectionsRef.current.set(node.id,element);else sectionsRef.current.delete(node.id);}}>
                        <StageSection node={node} section={sections[index]} locked={locked} expanded={expanded[node.id]??true} onToggle={()=>toggle(node.id)}/>
                    </div>)}</div>}
            </main>
        </div>
    </section>;
}
