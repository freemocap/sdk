// Extracted from Core's Mocap processing graph: app-defined stages carry typed
// data sockets, shared settings, retained progress and artifact references.
// The magnifier zooms onto one node; the info button zooms onto it, covers the graph and points at each part.
import {type PointerEvent, type ReactNode, type WheelEvent, useCallback, useId, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useExplainScope, useExplainTarget, type ExplainEntry} from './explain-registry';
import {type DataKey, type GraphNode, type NodeId, type NodeState, type StageGraph, type ProcessingSection, type PortData} from './model';
import {type Box, type NodeMeasurement, ROWS, type StageLayout, stageLayout} from './stage-layout';
import {OperationRow} from './OperationRow';
import AnchoredInfo from '../components/ui-components/AnchoredInfo';

export interface GraphFocus {id: NodeId; explain: boolean}
interface ProcessingGraphViewProps {
    graph: StageGraph | {error: string}; sections: ProcessingSection[]; notice: ReactNode;
    locked: boolean; focus: GraphFocus | null; onFocus: (focus: GraphFocus | null) => void;
    onOpenArtifact?: (path:string)=>void;
    expanded:Readonly<Record<string,boolean>>;onToggle:(id:string)=>void;
}
interface Camera {x:number;y:number;z:number}
const MIN_ZOOM=0.05, MAX_ZOOM=2.2, FIT_MARGIN=24;
const stateClass=(state:NodeState):string=>state.replaceAll(' ','-');

function Port({data,direction,portKey}: {data:PortData;direction:'in'|'out';portKey:string}) {
    const explain=useExplainTarget(`${direction}:${data.name}`,data.name,data.description,direction==='in'?'left':'right');
    return <div ref={explain} className={`pg-port ${direction}`} data-port-key={portKey} style={{minHeight:ROWS.port}} title={data.description}>
        <i className="pg-socket" style={{background:data.colour}}/>
        <span className="pg-port-name" style={direction==='out'?{color:data.colour}:undefined}>{data.name}{data.detail && <small> {data.detail}</small>}</span>
    </div>;
}
function Node({node,section,box,focused,explaining,locked,onMeasure,onFocus,onEntries,data,onOpenArtifact,expanded,onToggle}: {
    node:GraphNode;section:ProcessingSection;box:Box;focused:boolean;explaining:boolean;locked:boolean;
    expanded:boolean;onToggle:()=>void;onMeasure:(id:NodeId,measurement:NodeMeasurement)=>void;onFocus:(focus:GraphFocus|null)=>void;
    onEntries:(id:NodeId,entries:()=>ExplainEntry[])=>void;data:Record<DataKey,PortData>;onOpenArtifact?:(path:string)=>void;
}) {
    const {entries,Scope}=useExplainScope();
    const bodyId=useId();
    useEffect(()=>onEntries(node.id,entries),[node.id,entries,onEntries]);
    const element=useRef<HTMLDivElement>(null);
    useLayoutEffect(()=>{
        const current=element.current;if(!current)return;
        const measure=()=>{
            const ports:Record<string,number>={};
            // offsetTop is in layout pixels, independent of the animated camera transform.
            current.querySelectorAll<HTMLElement>('[data-port-key]').forEach(port=>{
                let y=port.offsetHeight/2;let element:HTMLElement|null=port;
                while(element && element!==current){y+=element.offsetTop;element=element.offsetParent as HTMLElement|null;}
                ports[port.dataset.portKey!]=y;
            });
            onMeasure(node.id,{height:current.offsetHeight,ports});
        };
        const observer=new ResizeObserver(measure);observer.observe(current);current.querySelectorAll('.pg-node-head, .pg-port').forEach(item=>observer.observe(item));measure();
        return ()=>observer.disconnect();
    },[node.id,onMeasure]);
    return <div ref={element} role="group" aria-label={section.title} data-stage-id={node.id}
        className={`pg-node ${stateClass(node.state)}${focused?' focused':''}${explaining?' explaining':''}`}
        style={{left:box.x,top:box.y,width:box.w}}><Scope>
        <Header node={node} section={section} focused={focused} explaining={explaining} onFocus={onFocus} expanded={expanded} onToggle={onToggle} bodyId={bodyId}/>
        <div className="pg-ports" style={{paddingTop:ROWS.portsPad,paddingBottom:ROWS.portsPad}}>
            {node.outputs.map(key=><Port key={key} portKey={key} data={data[key]} direction="out"/>)}
            {node.inputs.map(key=><Port key={key} portKey={key} data={data[key]} direction="in"/>)}
        </div>
        <div className="sdk-pipeline-stage-status">{node.presentation.availability!=='reusable' && <span className="pg-pill">{node.presentation.availability}</span>}<AnchoredInfo title={`${section.title} availability`} text={<>{node.presentation.reason}{node.presentation.artifacts?.map(path=><p key={path}>{path}</p>)}</>}/>{node.presentation.summary}</div>
        <div id={bodyId} className="pg-node-settings settings-layout" hidden={!expanded} inert={locked}>{section.content}</div>
        {node.operation && <div className="sdk-pipeline-operation"><OperationRow operation={node.operation} title={node.operation.label}/></div>}
        </Scope></div>;
}
function Header({node,section,focused,explaining,onFocus,expanded,onToggle,bodyId}:{expanded:boolean;onToggle:()=>void;bodyId:string;node:GraphNode;section:ProcessingSection;focused:boolean;explaining:boolean;onFocus:(focus:GraphFocus|null)=>void}) {
    const explain=useExplainTarget('stage',section.title,node.presentation.description,'left');
    const kind=node.presentation.kind==='source'?'source':node.presentation.kind==='publication'?'sink':'stage';
    return <div ref={explain} className={`pg-node-head ${kind}`} style={{minHeight:ROWS.head}}>
        <button type="button" className="pg-head-button sdk-stage-disclosure" aria-label={`Toggle ${section.title} settings`} aria-expanded={expanded} aria-controls={bodyId} onClick={event=>{event.stopPropagation();onToggle();}}><span className="settings-section-chevron"/></button>
        <span className="pg-node-title" title={section.title}><small>{section.number}</small>{section.title}</span>
        <button type="button" className={`pg-head-button${explaining?' on':''}`} aria-label={`Explain ${section.title}`} aria-pressed={explaining}
            onClick={()=>onFocus(explaining?null:{id:node.id,explain:true})}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4M8 4.8v.2"/></svg></button>
        <button type="button" className={`pg-head-button${focused&&!explaining?' on':''}`} aria-label={`Zoom to ${section.title}`} aria-pressed={focused&&!explaining}
            onClick={()=>onFocus(focused&&!explaining?null:{id:node.id,explain:false})}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5L14 14"/></svg></button>
    </div>;
}

interface Callout {key: string; title: string; text: ReactNode; side: 'left' | 'right'; tx: number; ty: number}

const CALLOUT_WIDTH = 340;
const CALLOUT_GAP = 14;

/** Callouts in two columns beside the node, stacked in the order of what they point at so no arrows cross. */
function placeCallouts(callouts: Callout[], heights: Map<string, number>, node: DOMRect, canvas: {w: number; h: number}) {
    const placed: {callout: Callout; x: number; y: number; h: number}[] = [];
    for (const side of ['left', 'right'] as const) {
        const column = callouts.filter(item => item.side === side).sort((a, b) => a.ty - b.ty);
        const x = side === 'left' ? Math.max(12, node.left - 64 - CALLOUT_WIDTH) : Math.min(canvas.w - 12 - CALLOUT_WIDTH, node.right + 64);
        let floor = 12;
        const items = column.map(callout => {
            const h = heights.get(callout.key) ?? 96;
            const y = Math.max(callout.ty - h / 2, floor);
            floor = y + h + CALLOUT_GAP;
            return {callout, x, y, h};
        });
        const overflow = items.length ? items[items.length - 1].y + items[items.length - 1].h - (canvas.h - 12) : 0;
        if (overflow > 0) {
            items.forEach(item => item.y -= overflow);
            items.forEach((item, i) => item.y = Math.max(item.y, i ? items[i - 1].y + items[i - 1].h + CALLOUT_GAP : 12));
        }
        placed.push(...items);
    }
    return placed;
}

function Explain({entries, nodeElement, canvasElement, size, onClose}: {
    entries: ExplainEntry[]; nodeElement: HTMLElement; canvasElement: HTMLElement; size: {w: number; h: number}; onClose: () => void;
}) {
    const [heights, setHeights] = useState(new Map<string, number>());
    const origin = canvasElement.getBoundingClientRect();
    const nodeRect = nodeElement.getBoundingClientRect();
    const node = new DOMRect(nodeRect.left - origin.left, nodeRect.top - origin.top, nodeRect.width, nodeRect.height);
    const targets = entries.filter(entry => nodeElement.contains(entry.element) && entry.element.getClientRects().length>0).map(entry => ({entry, rect: entry.element.getBoundingClientRect()}));
    const callout = (entry: ExplainEntry, rect: DOMRect, side: 'left' | 'right'): Callout => ({key: entry.key, title: entry.title, text: entry.text, side,
        tx: side === 'left' ? rect.left - origin.left - (entry.key.startsWith('in:') ? 0 : 2) : rect.right - origin.left + (entry.key.startsWith('out:') ? 0 : 2),
        ty: rect.top - origin.top + Math.min(rect.height, 40) / 2});
    const fixed = targets.filter(({entry}) => !entry.key.startsWith('setting:')).map(({entry, rect}) => callout(entry, rect, entry.side));
    const settings = targets.filter(({entry}) => entry.key.startsWith('setting:')).sort((a, b) => a.rect.top - b.rect.top);
    // Settings fill the right column from the top and the left column below that, split where the two columns come out closest in height.
    const height = (key: string): number => (heights.get(key) ?? 96) + CALLOUT_GAP;
    const columnHeight = (side: 'left' | 'right', items: Callout[]): number => items.filter(item => item.side === side).reduce((sum, item) => sum + height(item.key), 0);
    let best: Callout[] = [];
    let bestHeight = Infinity;
    for (let split = 0; split <= settings.length; split++) {
        const items = [...fixed, ...settings.map(({entry, rect}, index) => callout(entry, rect, index < split ? 'right' : 'left'))];
        const tallest = Math.max(columnHeight('left', items), columnHeight('right', items));
        if (tallest < bestHeight) {
            best = items;
            bestHeight = tallest;
        }
    }
    const callouts = best;
    const placed = placeCallouts(callouts, heights, node, size);
    const measure = useCallback((key: string) => (element: HTMLDivElement | null) => {
        if (!element) return;
        const h = element.offsetHeight;
        setHeights(previous => previous.get(key) === h ? previous : new Map(previous).set(key, h));
    }, []);
    return <div className="pg-explain" role="region" aria-label="Stage explanation" onPointerDown={event => {if (event.target === event.currentTarget) onClose();}}>
        <button type="button" className="sdk-explain-close" onClick={onClose}>Close explanation</button>
        <svg className="pg-leaders" width={size.w} height={size.h} aria-hidden="true">
            <defs><marker id="pg-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z"/></marker></defs>
            {placed.map(({callout, x, y, h}) => {
                const edge = callout.side === 'left' ? x + CALLOUT_WIDTH : x;
                const mid = y + h / 2;
                const dx = callout.tx - edge;
                const dy = callout.ty - mid;
                const length = Math.hypot(dx, dy) || 1;
                return <path key={callout.key} d={`M${edge},${mid} L${callout.tx - dx / length * 16},${callout.ty - dy / length * 16}`} markerEnd="url(#pg-arrow)"/>;
            })}
        </svg>
        {placed.map(({callout, x, y}) => <div key={callout.key} ref={measure(callout.key)} className="pg-callout" style={{left: x, top: y, width: CALLOUT_WIDTH}}>
            <b><i>i</i>{callout.title}</b>
            <div className="pg-callout-text">{callout.text}</div>
        </div>)}
    </div>;
}

export default function ProcessingGraphView({graph, sections, notice, locked, focus, onFocus, onOpenArtifact, expanded, onToggle}: ProcessingGraphViewProps) {
    const [measurements, setMeasurements] = useState<Partial<Record<NodeId,NodeMeasurement>>>({});
    const onMeasure = useCallback((id:NodeId,measurement:NodeMeasurement)=>setMeasurements(previous=>
        JSON.stringify(previous[id])===JSON.stringify(measurement)?previous:{...previous,[id]:measurement}),[]);
    const entryGetters = useRef(new Map<NodeId, () => ExplainEntry[]>());
    const onEntries = useCallback((id: NodeId, entries: () => ExplainEntry[]) => {entryGetters.current.set(id, entries);}, []);
    const layout: StageLayout | null = useMemo(() => 'error' in graph ? null : stageLayout(graph, measurements), [graph, measurements]);

    const canvasRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({w: 0, h: 0});
    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const observer = new ResizeObserver(() => setSize({w: canvas.clientWidth, h: canvas.clientHeight}));
        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);
    const [camera, setCamera] = useState<Camera | null>(null);
    const [overview, setOverview] = useState(false);
    const [animate, setAnimate] = useState(false);
    const [dragging, setDragging] = useState(false);
    const drag = useRef<{x: number; y: number; camera: Camera} | null>(null);
    /** The camera that centres a box in the canvas, scaled to fill `share` of its width, never above `maxZoom`. */
    const fitBox = (box: {x: number; y: number; w: number; h: number}, share: number, maxZoom: number): Camera => {
        const z = Math.min(maxZoom, Math.max(MIN_ZOOM, Math.min((size.w * share - 2 * FIT_MARGIN) / box.w, (size.h - 2 * FIT_MARGIN) / box.h)));
        return {z, x: box.x + box.w / 2 - size.w / 2 / z, y: box.y + box.h / 2 - size.h / 2 / z};
    };
    const target: Camera = !layout || !size.w ? {x: 0, y: 0, z: 1}
        : focus && layout.boxes.has(focus.id) ? fitBox(layout.boxes.get(focus.id)!, focus.explain ? 0.42 : 1, MAX_ZOOM)
            : overview ? fitBox({x: 0, y: 0, w: layout.width, h: layout.height}, 1, 1)
                : {x: 0, y: 0, z: 1};
    // A focus change hands the camera back to the target and animates there; the reader's own panning and zooming is immediate.
    const previousFocus = useRef(focus);
    useEffect(() => {
        // Initial card measurements must fit immediately, not animate through stale estimated bounds.
        if (previousFocus.current?.id === focus?.id && previousFocus.current?.explain === focus?.explain) return;
        previousFocus.current = focus;
        setCamera(null);
        setAnimate(true);
        const timer = setTimeout(() => setAnimate(false), 360);
        return () => clearTimeout(timer);
    }, [focus?.id, focus?.explain]);
    const cam = camera ?? target;
    const toggleSettings=(id:string)=>{
        // Freeze the current camera before measured card bounds change, including
        // when the preceding explicit action was focus or Fit all.
        const transform=animate&&worldRef.current?new DOMMatrixReadOnly(getComputedStyle(worldRef.current).transform):null;
        setCamera(transform?{z:transform.a,x:-transform.e/transform.a,y:-transform.f/transform.a}:{...cam});
        setAnimate(false);onToggle(id);
    };
    const zoomAbout = (z: number, px: number, py: number): void => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
        setCamera({z: next, x: cam.x + px / cam.z - px / next, y: cam.y + py / cam.z - py / next});
    };
    const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
        if (focus?.explain) return;
        const rect = event.currentTarget.getBoundingClientRect();
        zoomAbout(cam.z * Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
        if ((event.target as Element).closest('.pg-node, .pg-zoom') || focus?.explain) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {x: event.clientX, y: event.clientY, camera: cam};
        setDragging(false);
    };
    const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
        const start = drag.current;
        if (!start) return;
        if (!dragging && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
        setDragging(true);
        setCamera({z: start.camera.z, x: start.camera.x - (event.clientX - start.x) / start.camera.z, y: start.camera.y - (event.clientY - start.y) / start.camera.z});
    };
    const onPointerUp = (): void => {
        // A click on empty canvas, not a drag, leaves the zoomed node.
        if (drag.current && !dragging && focus) onFocus(null);
        drag.current = null;
        setDragging(false);
    };

    const nodeElements = useRef(new Map<NodeId, HTMLElement>());
    const [explainReady, setExplainReady] = useState(false);
    useEffect(() => {
        setExplainReady(false);
        if (!focus?.explain) return;
        const timer = setTimeout(() => setExplainReady(true), 380);
        return () => clearTimeout(timer);
    }, [focus?.id, focus?.explain]);

    const byId = new Map(sections.map(section => [section.id, section]));
    return <div ref={canvasRef} className={`pg-canvas${dragging ? ' dragging' : ''}${focus?.explain ? ' explaining' : ''}`} onWheel={onWheel}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        tabIndex={0} onKeyDown={event => {if (event.key === 'Escape' && focus) {event.preventDefault();event.stopPropagation();onFocus(null);}}} aria-label="Processing graph. Drag to pan, scroll to zoom.">
        {'error' in graph && <p role="alert" className="pg-notice warn">{graph.error}</p>}
        {notice}
        {layout && 'nodes' in graph && size.w > 0 && <div ref={worldRef} className={`pg-world${animate ? ' animate' : ''}`}
            style={{width: layout.width, height: layout.height, transform: `scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`}}>
            <svg className="pg-wires" width={layout.width} height={layout.height} aria-hidden="true">
                {graph.wires.map(wire => <path key={wire.id} data-wire-id={wire.id} d={layout.wires.find(item => item.id === wire.id)!.d}
                    className={`pg-wire${wire.active ? '' : ' quiet'}${graph.nodes.find(node => node.id === wire.target)!.state === 'running' ? ' flow' : ''}`}
                    style={{stroke: graph.data[wire.data].colour}}/>)}
            </svg>
            {focus?.explain && <div className="pg-explain-cover"/>}
            {graph.nodes.map(node => <div key={node.id} ref={element => {if (element) nodeElements.current.set(node.id, element.firstElementChild as HTMLElement);}}>
                <Node node={node} section={byId.get(node.id)!} box={layout.boxes.get(node.id)!} focused={focus?.id === node.id}
                    expanded={expanded[node.id]??true} onToggle={()=>toggleSettings(node.id)} explaining={focus?.id === node.id && focus.explain} locked={locked} onMeasure={onMeasure} onFocus={onFocus} onEntries={onEntries} data={graph.data} onOpenArtifact={onOpenArtifact}/>
            </div>)}
        </div>}
        {focus?.explain && explainReady && canvasRef.current && nodeElements.current.get(focus.id) &&
            <Explain entries={entryGetters.current.get(focus.id)?.() ?? []} nodeElement={nodeElements.current.get(focus.id)!}
                canvasElement={canvasRef.current} size={size} onClose={() => onFocus(null)}/>}
        <div className="pg-zoom" role="toolbar" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" onClick={() => zoomAbout(cam.z / 1.2, size.w / 2, size.h / 2)}>−</button>
            <span>{Math.round(cam.z * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => zoomAbout(cam.z * 1.2, size.w / 2, size.h / 2)}>+</button>
            <button type="button" onClick={() => {onFocus(null); setOverview(false); setCamera({x:0,y:0,z:1});}}>100%</button>
            <button type="button" onClick={() => {onFocus(null); setOverview(true); setCamera(null);}}>Fit all</button>
        </div>
    </div>;
}
