import {useRef, useState} from 'react';
import {LogTerminal} from './LogTerminal';
import type {LogStore} from './log-store';

export interface BottomLogPanelProps {store: LogStore; title?: string; initialHeight?: number; showHeader?: boolean}

/** Core's bottom log region, with application-owned data instead of route/store coupling. */
export function BottomLogPanel({store, title = 'Backend logs', initialHeight = 210, showHeader = false}: BottomLogPanelProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [height, setHeight] = useState(initialHeight);
    const drag = useRef<{y: number; height: number} | null>(null);
    const resize = (value: number) => setHeight(Math.max(100, Math.min(window.innerHeight * .7, value)));
    return <section className="sdk-bottom-log-panel" aria-label={title} style={{height: collapsed ? 66 : height}}>
        <div role="separator" aria-label="Resize log panel" aria-orientation="horizontal" tabIndex={0}
            aria-valuenow={Math.round(height)} aria-valuemin={100} aria-valuemax={Math.round(typeof window === 'undefined' ? 700 : window.innerHeight * .7)}
            className="sdk-log-resize"
            onPointerDown={event => {if (collapsed) return; drag.current = {y: event.clientY, height}; event.currentTarget.setPointerCapture(event.pointerId);}}
            onPointerMove={event => {if (drag.current) resize(drag.current.height + drag.current.y - event.clientY);}}
            onPointerUp={() => {drag.current = null;}} onPointerCancel={() => {drag.current = null;}}
            onKeyDown={event => {if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {event.preventDefault(); resize(height + (event.key === 'ArrowUp' ? 20 : -20));}}}/>
        {showHeader && <div className="sdk-log-heading"><span>{title}</span>
            <button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? 'Expand logs' : 'Collapse logs'}</button>
        </div>}
        <div className="sdk-log-content"><LogTerminal store={store} isCollapsed={collapsed} onExpand={() => setCollapsed(false)}/></div>
    </section>;
}
