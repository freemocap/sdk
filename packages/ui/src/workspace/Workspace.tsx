import {useId,type ReactNode} from 'react';

export interface WorkspaceTab {id:string;label:string;panelId:string}
/** Controlled tabs; the application owns panel lifetimes and persistence. */
export function WorkspaceTabs({tabs,value,onChange,label='Workspace views'}:{tabs:readonly WorkspaceTab[];value:string;onChange:(id:string)=>void;label?:string}) {
    const prefix=useId();
    return <nav className="sdk-workspace-tabs" role="tablist" aria-label={label}>{tabs.map((tab,index)=><button key={tab.id}
        id={`${prefix}-${tab.id}`} type="button" role="tab" aria-selected={value===tab.id} aria-controls={tab.panelId}
        tabIndex={value===tab.id?0:-1} onClick={()=>onChange(tab.id)} onKeyDown={event=>{
            const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:null;
            if(next===null)return;event.preventDefault();onChange(tabs[next].id);
            const buttons=event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]');buttons?.[next].focus();
        }}>{tab.label}</button>)}</nav>;
}

/** Persistent command area; product-specific fields and actions remain caller-owned. */
export function WorkspaceToolbar({children,details,label='Workspace controls'}:{children:ReactNode;details?:ReactNode;label?:string}) {
    return <section className="sdk-workspace-toolbar" aria-label={label}><div className="sdk-workspace-toolbar-main">{children}</div>{details&&<div className="sdk-workspace-toolbar-details">{details}</div>}</section>;
}

export interface RunActivityProps {
    stage:string;active:boolean;elapsedSeconds:number;completed?:number;total?:number;unit?:string;
    updateAgeSeconds?:number;detail?:ReactNode;className?:string;
}
/** Display supplied activity truth. An old update stops the activity animation. */
export function RunActivity({stage,active,elapsedSeconds,completed,total,unit='steps',updateAgeSeconds,detail,className=''}:RunActivityProps) {
    const stale=active&&updateAgeSeconds!==undefined&&updateAgeSeconds>=30;
    const determinate=completed!==undefined&&total!==undefined&&total>0;
    return <section className={`sdk-run-activity ${className}`} aria-label="Run activity" data-active={active} data-stale={stale}>
        <strong role="status"><span className="sdk-run-indicator" aria-hidden="true"/>{stage}</strong>
        <span>{Math.max(0,Math.floor(elapsedSeconds))} s elapsed</span>
        {determinate&&<><span>{unit} {completed} / {total}</span><progress aria-label={`${unit} progress`} value={Math.min(total,Math.max(0,completed))} max={total}/></>}
        {active&&updateAgeSeconds!==undefined&&<span className="sdk-run-freshness">{stale?'No update for':'Last update'} {Math.max(0,Math.floor(updateAgeSeconds))} s{stale?' · check connection and logs':' ago'}</span>}
        {detail&&<span className="sdk-run-detail">{detail}</span>}
    </section>;
}
