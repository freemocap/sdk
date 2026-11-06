import {useRef, useState} from 'react';
import {LogTerminal} from './LogTerminal';
import ButtonSm from '../components/ui-components/ButtonSm';
import type {LogStore} from './log-store';

export interface BottomLogPanelProps {store:LogStore;title?:string;initialHeight?:number;showHeader?:boolean}
/** Hiding presentation never clears the application-owned log store. */
export function BottomLogPanel({store,title='Backend logs',initialHeight=210,showHeader=false}:BottomLogPanelProps) {
    const [height,setHeight]=useState(Math.max(0,initialHeight));
    const lastExpanded=useRef(initialHeight>0?initialHeight:210);
    const drag=useRef<{y:number;height:number}|null>(null);
    const collapsed=height===0;
    const resize=(value:number)=>{const next=Math.max(0,Math.min(window.innerHeight*.7,value));setHeight(next<12?0:next);};
    const toggle=()=>{if(collapsed)resize(lastExpanded.current);else {lastExpanded.current=height;setHeight(0);}};
    return <section className="sdk-bottom-log-panel" aria-label={title} style={{height,position:'relative',borderTop:collapsed?'none':undefined}}>
        <div role="separator" aria-label="Resize log panel" aria-orientation="horizontal" tabIndex={collapsed?-1:0}
            aria-valuenow={Math.round(height)} aria-valuemin={0} aria-valuemax={Math.round(typeof window==='undefined'?700:window.innerHeight*.7)}
            className="sdk-log-resize" style={collapsed?{height:0}:undefined}
            onPointerDown={event=>{drag.current={y:event.clientY,height};if(height>0)lastExpanded.current=height;event.currentTarget.setPointerCapture(event.pointerId);}}
            onPointerMove={event=>{if(drag.current)resize(drag.current.height+drag.current.y-event.clientY);}}
            onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
            onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();if(height>0)lastExpanded.current=height;resize(height+(event.key==='ArrowUp'?20:-20));}}}/>
        <div className="sdk-log-visibility" style={{position:'absolute',right:8,...(collapsed?{bottom:8}:{top:8}),zIndex:30}}>
            <ButtonSm text={collapsed?'Logs':'Hide logs'} title={collapsed?'Restore log panel':'Collapse log panel'}
                ariaExpanded={!collapsed} iconClass={collapsed?'arrowup-icon':'arrowdown-icon'} onClick={toggle}/>
        </div>
        {showHeader&&!collapsed&&<div className="sdk-log-heading"><span>{title}</span></div>}
        <div className="sdk-log-content" style={collapsed?{display:'none'}:undefined}>
            <LogTerminal store={store} isCollapsed={collapsed} onExpand={()=>resize(lastExpanded.current)}/>
        </div>
    </section>;
}
