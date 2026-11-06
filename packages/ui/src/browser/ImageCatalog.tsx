import {useState,useRef,useLayoutEffect,useMemo,useEffect,type KeyboardEvent,type ReactNode} from 'react';
import ButtonSm from '../components/ui-components/ButtonSm';
import SubactionHeader from '../components/ui-components/SubactionHeader';
import {AnnotationImage,ImagePreview} from './ImagePreview';

export interface ImageSelectionToggleProps {
    included:boolean|null;pending?:boolean;disabled?:boolean;error?:string;onToggle:()=>void;label?:string;
}
export function ImageSelectionToggle({included,pending,disabled,error,onToggle,label}:ImageSelectionToggleProps) {
    return <div className="sdk-image-selection" data-included={included===null?'unavailable':String(included)}>
        <ButtonSm text={pending?'Savingâ€¦':included===null?'No generated labels':included?'âœ“ Included':'ï¼‹ Include image'}
            title={label??(included===null?'No generated labels for this frame':included?'Exclude image from selection':'Include image in selection')}
            ariaPressed={included===null?undefined:included} ariaBusy={!!pending}
            disabled={disabled||pending||included===null} onClick={onToggle}
            textColor="" className={included?'sdk-image-included':'sdk-image-excluded'}/>
        {error && <span className="sdk-image-save-error" role="alert">{error}</span>}
    </div>;
}
export type ImageCatalogFilter={inclusion:'all'|'included'|'excluded';camera:string|null};
export interface ImageCatalogItem {
    id:string;groupId:string;groupLabel:string;camera:string;thumbnailUrl:string|null;label:string;detail?:string;
    included:boolean;pending?:boolean;error?:string;
    sourceFrameNumber?:number;cameraId?:string;momentId?:string;
}
export interface ImageCatalogNavigation {
    mode:'included'|'generated';onModeChange:(mode:'included'|'generated')=>void;
    previousId?:string;nextId?:string;pending?:boolean;
}
export type DatasetImageItem=Omit<ImageCatalogItem,'included'> & {
    facts?:ReactNode;removed?:boolean;
    rawThumbnailUrl?:string|null;fullImageUrl?:string|null;rawFullImageUrl?:string|null;
};
interface ImageCatalogBaseProps {
    actions?:ReactNode;
    onIncludeAll?:()=>void;includeAllPending?:boolean;includeAllDisabled?:boolean;
    activeId?:string;onNavigate:(id:string)=>void;
    pending?:boolean;error?:string;onFilterChange?:(filter:ImageCatalogFilter)=>void;navigation?:ImageCatalogNavigation;
}
export type ImageCatalogProps=ImageCatalogBaseProps & (
    {mode?:'selection';items:readonly ImageCatalogItem[];onToggle:(id:string)=>void} |
    {mode:'members';items:readonly DatasetImageItem[];onRemove:(id:string)=>void;selectedIds?:readonly string[];onSelectionChange?:(ids:string[])=>void;cardWidth?:number;showAnnotations?:boolean}
);
function CatalogThumbnail({src,label}:{src:string|null;label:string}) {
    const [failed,setFailed]=useState<string|null>(null);
    return src&&src!==failed?<img src={src} alt={label} loading="lazy" decoding="async" onError={()=>setFailed(src)}/>
        :<span className="sdk-image-thumbnail-unavailable">Target unavailable</span>;
}
export function ImageCatalog(props:ImageCatalogProps) {
    const [filter,setFilter]=useState<ImageCatalogFilter>({inclusion:'all',camera:null});
    if(props.mode==='members')return <MemberImageCatalog {...props}/>;
    const {items,activeId,onNavigate,onToggle,pending,error,onFilterChange,navigation,actions,onIncludeAll,includeAllPending,includeAllDisabled}=props;
    const change=(patch:Partial<ImageCatalogFilter>)=>{const next={...filter,...patch};setFilter(next);onFilterChange?.(next);};
    const included=items.filter(item=>item.included).length;
    const cameras=[...new Set(items.map(item=>item.camera))];
    const visible=items.filter(item=>(!filter.camera||item.camera===filter.camera) &&
        (filter.inclusion==='all'||item.included===(filter.inclusion==='included')));
    const groups=new Map<string,ImageCatalogItem[]>();
    for(const item of visible){const group=groups.get(item.groupId)??[];group.push(item);groups.set(item.groupId,group);}
    const navigate=(id:string|undefined)=>{if(id&&!pending&&!navigation?.pending)onNavigate(id);};
    const keys=(event:KeyboardEvent<HTMLElement>)=>{
        const target=event.target as HTMLElement;
        if(event.ctrlKey||event.metaKey||event.altKey||target.closest('input,textarea,select,[contenteditable="true"]'))return;
        const key=event.key.toLowerCase();if(key!=='f'&&key!=='g')return;
        event.preventDefault();event.stopPropagation();navigate(key==='f'?navigation?.previousId:navigation?.nextId);
    };
    return <section className="sdk-image-catalog" aria-label="Generated images" tabIndex={0} onKeyDown={keys}>
        <SubactionHeader text="Image selection"/>
        <div className="sdk-image-catalog-counts"><strong>{included}<small> included</small></strong><span>{items.length} generated images</span></div>
        {onIncludeAll&&<ButtonSm className="sdk-image-include-all" text={includeAllPending?'Savingâ€¦':'Include all'} iconClass="checkUpdate-icon" textColor=""
            title="Include all generated images in this batch" disabled={pending||includeAllPending||includeAllDisabled||!items.length||included===items.length}
            ariaBusy={!!includeAllPending} onClick={onIncludeAll}/>}
        {actions&&<div className="sdk-image-catalog-actions">{actions}</div>}
        {navigation && <div className="sdk-image-navigation">
            <div className="sdk-image-filter" role="group" aria-label="Frame stepping mode">
                {(['included','generated'] as const).map(mode=><ButtonSm key={mode} text={mode==='included'?'Included frames':'All generated'}
                    ariaPressed={navigation.mode===mode} className={navigation.mode===mode?'selected':''} textColor=""
                    onClick={()=>navigation.onModeChange(mode)} disabled={pending||navigation.pending}/>)}
            </div>
            <div className="sdk-image-step-buttons">
                <ButtonSm text="Previous" iconClass="framebackward-icon" title={`Previous ${navigation.mode} frame (F)`} textColor=""
                    disabled={pending||navigation.pending||!navigation.previousId} onClick={()=>navigate(navigation.previousId)}/>
                <ButtonSm text="Next" iconClass="frameforward-icon" title={`Next ${navigation.mode} frame (G)`} textColor=""
                    disabled={pending||navigation.pending||!navigation.nextId} onClick={()=>navigate(navigation.nextId)}/>
            </div>
        </div>}
        <div className="sdk-image-filter" role="group" aria-label="Image inclusion filter">
            {(['all','included','excluded'] as const).map(value=><ButtonSm key={value}
                text={value==='all'?'All':value==='included'?'Included':'Excluded'} ariaPressed={filter.inclusion===value}
                className={filter.inclusion===value?'selected':''} textColor="" onClick={()=>change({inclusion:value})}/>)}
        </div>
        {cameras.length>1 && <div className="sdk-image-filter" role="group" aria-label="Camera filter">
            <ButtonSm text="Both cameras" ariaPressed={!filter.camera} className={!filter.camera?'selected':''} textColor="" onClick={()=>change({camera:null})}/>
            {cameras.map(camera=><ButtonSm key={camera} text={camera} ariaPressed={filter.camera===camera} textColor=""
                className={filter.camera===camera?'selected':''} onClick={()=>change({camera})}/>)}
        </div>}
        {error && <div className="sdk-image-save-error" role="alert">{error}</div>}
        <div className="sdk-image-catalog-scroll">
            {visible.length===0 && <div className="sdk-image-empty">{items.length?'No images match this filter':'Generate candidates to select images'}</div>}
            {[...groups].map(([id,group])=><section key={id} className="sdk-image-moment" aria-label={group[0].groupLabel}>
                <h4>{group[0].groupLabel}</h4><div className="sdk-image-moment-grid">
                    {group.map(item=><article key={item.id} className={`sdk-image-card ${activeId===item.id?'active':''}`} data-image-id={item.id}>
                        <button className="sdk-image-thumbnail" aria-label={`Show ${item.label}`} aria-current={activeId===item.id?'true':undefined}
                            disabled={pending||navigation?.pending} onClick={()=>onNavigate(item.id)}>
                            <CatalogThumbnail src={item.thumbnailUrl} label={item.label}/>
                            <span className="sdk-image-camera">{item.camera}</span>
                        </button>
                        <div className="sdk-image-card-body"><strong>{item.label}</strong>{item.detail&&<small>{item.detail}</small>}
                            <ImageSelectionToggle included={item.included} pending={item.pending} disabled={pending}
                                error={item.error} label={`${item.included?'Exclude':'Include'} ${item.label}`} onToggle={()=>onToggle(item.id)}/>
                        </div>
                    </article>)}
                </div>
            </section>)}
        </div>
    </section>;
}

/** Membership and bulk action selection are controlled independently by the application. */
function MemberImageCatalog({items,activeId,onNavigate,onRemove,pending,error,actions,selectedIds=[],onSelectionChange,cardWidth=176,showAnnotations=true}:Extract<ImageCatalogProps,{mode:'members'}>){
    const scroll=useRef<HTMLDivElement>(null);
    const [preview,setPreview]=useState<DatasetImageItem|null>(null);
    const [viewport,setViewport]=useState({width:400,height:600,top:0});
    const desiredWidth=Number.isFinite(cardWidth)?Math.max(112,Math.min(640,cardWidth)):176;
    const columns=Math.max(1,Math.floor((viewport.width+8)/(desiredWidth+8)));
    const [imageAspects,setImageAspects]=useState<Map<string,number>>(new Map());
    const [captionSizes,setCaptionSizes]=useState<{width:number;heights:Map<string,number>}>({width:0,heights:new Map()});
    const cellWidth=(viewport.width-8*(columns-1))/columns;
    const imageHeightFor=(item:DatasetImageItem)=>Math.round(Math.max(1,cellWidth)/(imageAspects.get(item.thumbnailUrl??'')??(4/3)));
    const rows=Math.ceil(items.length/columns);
    const rowTops=[0];
    for(let row=0;row<rows;row++) {
        let height=0;
        for(let col=0;col<columns;col++) {const item=items[row*columns+col];if(item)height=Math.max(height,imageHeightFor(item)+(captionSizes.width===cellWidth?(captionSizes.heights.get(item.id)??66):66));}
        rowTops.push(rowTops[row]+height+10);
    }
    const rowAt=(top:number)=>{let lo=0,hi=rows;while(lo<hi){const mid=Math.floor((lo+hi+1)/2);if(rowTops[mid]<=top)lo=mid;else hi=mid-1;}return Math.min(Math.max(0,rows-1),lo);};
    const firstRow=Math.max(0,rowAt(viewport.top)-2);
    const lastRow=Math.min(rows,rowAt(viewport.top+viewport.height)+3);
    const visible=items.slice(firstRow*columns,lastRow*columns);
    const selected=useMemo(()=>new Set(selectedIds),[selectedIds]);
    const lastSelected=useRef<string|null>(null);
    const anchor=useRef<{ids:readonly string[];index:number;offset:number;columns:number;tops:number[]}>({ids:[],index:0,offset:0,columns,tops:[]});
    const ids=useMemo(()=>items.map(item=>item.id),[items]);
    const remember=()=>{
        const top=scroll.current?.scrollTop??0;const row=rowAt(top),index=row*columns;
        anchor.current={ids,index,offset:top-rowTops[row],columns,tops:rowTops};
    };
    useLayoutEffect(()=>{
        const element=scroll.current;if(!element)return;
        const measure=()=>setViewport(v=>({...v,width:Math.max(1,element.clientWidth-4),height:element.clientHeight,top:element.scrollTop}));
        const observer=new ResizeObserver(measure);observer.observe(element);measure();return()=>observer.disconnect();
    },[]);
    useLayoutEffect(()=>{
        const element=scroll.current;if(!element)return;
        const old=anchor.current;
        if(old.ids.length){
            const positions=new Map(ids.map((id,index)=>[id,index]));
            let next=-1;
            for(let i=old.index;i<old.ids.length&&next<0;i++)next=positions.get(old.ids[i])??-1;
            if(next<0)for(let i=Math.min(old.index-1,old.ids.length-1);i>=0&&next<0;i--)next=positions.get(old.ids[i])??-1;
            const row=Math.floor(next/columns);
            element.scrollTop=next<0?0:rowTops[row]+Math.min(old.offset,rowTops[row+1]-rowTops[row]-1);
            setViewport(v=>({...v,top:element.scrollTop}));
        }
        remember();
    },[ids,columns,cellWidth,imageAspects,captionSizes]);
    const visibleKey=visible.map(item=>item.id).join('\u0000');
    useLayoutEffect(()=>{
        const element=scroll.current;if(!element)return;
        const measure=()=>{
            const measured=[...element.querySelectorAll<HTMLElement>('.sdk-image-card-body')].map(body=>[body.closest<HTMLElement>('[data-image-id]')!.dataset.imageId!,Math.ceil(body.getBoundingClientRect().height)] as const);
            setCaptionSizes(previous=>{
                const heights=previous.width===cellWidth?new Map(previous.heights):new Map<string,number>();let changed=previous.width!==cellWidth;
                for(const [id,height] of measured)if(heights.get(id)!==height){heights.set(id,height);changed=true;}
                return changed?{width:cellWidth,heights}:previous;
            });
        };
        const observer=new ResizeObserver(measure);element.querySelectorAll('.sdk-image-card-body').forEach(body=>observer.observe(body));measure();return()=>observer.disconnect();
    },[visibleKey,cellWidth,items]);
    useEffect(()=>{
        if(!onSelectionChange||!selectedIds.length)return;
        const eligible=new Set(items.filter(item=>!item.removed).map(item=>item.id));
        const next=selectedIds.filter(id=>eligible.has(id));
        if(next.length!==selectedIds.length)onSelectionChange(next);
    },[items,selectedIds,onSelectionChange]);
    const select=(id:string,checked:boolean,range:boolean)=>{
        const next=new Set(selectedIds);const end=items.findIndex(item=>item.id===id);
        const start=range&&lastSelected.current?items.findIndex(item=>item.id===lastSelected.current):-1;
        const targets=start<0?[items[end]]:items.slice(Math.min(start,end),Math.max(start,end)+1);
        for(const item of targets)if(item&&!item.removed){if(checked)next.add(item.id);else next.delete(item.id);}
        lastSelected.current=id;onSelectionChange?.(items.filter(item=>next.has(item.id)&&!item.removed).map(item=>item.id));
    };
    return <section className="sdk-image-catalog sdk-image-members" aria-label="Training images">
        <SubactionHeader text="Training images"/>
        <div className="sdk-image-catalog-counts"><strong>{items.filter(item=>!item.removed).length}<small> images</small></strong>
            {onSelectionChange&&<span>{selectedIds.length} selected</span>}</div>
        {actions&&<div className="sdk-image-catalog-actions">{actions}</div>}
        {error&&<div className="sdk-image-save-error" role="alert">{error}</div>}
        <div ref={scroll} tabIndex={0} aria-label="Training image gallery" className="sdk-image-catalog-scroll sdk-image-virtual-scroll" onLoadCapture={event=>{
            const img=event.target;if(!(img instanceof HTMLImageElement)||!img.naturalWidth||!img.naturalHeight)return;
            const id=img.closest<HTMLElement>('[data-image-id]')?.dataset.imageId;
            const item=items.find(item=>item.id===id);if(!item?.thumbnailUrl)return;
            const ratio=img.naturalWidth/img.naturalHeight;
            setImageAspects(previous=>previous.get(item.thumbnailUrl!)===ratio?previous:new Map(previous).set(item.thumbnailUrl!,ratio));
        }} onScroll={()=>{
            remember();setViewport(v=>({...v,top:scroll.current?.scrollTop??0}));
        }}>
            {!items.length&&<div className="sdk-image-empty">No images in the training set</div>}
            <div className="sdk-image-members-grid sdk-image-virtual-grid" style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gridTemplateRows:rowTops.slice(firstRow,lastRow).map((top,i)=>`${rowTops[firstRow+i+1]-top-8}px`).join(' '),
                paddingTop:rowTops[firstRow],paddingBottom:rowTops[rows]-rowTops[lastRow]}}>
                {visible.map(item=><article key={item.id}
                    className={`sdk-image-card ${activeId===item.id?'active':''}${item.removed?' sdk-image-removed':''}`} data-image-id={item.id} style={{height:'auto',maxWidth:'none'}}
                    aria-label={`${item.camera} · ${item.groupLabel}`}>
                    <button className="sdk-image-thumbnail" aria-label={`Show ${item.label}`} aria-current={activeId===item.id?'true':undefined}
                        disabled={pending} style={{height:imageHeightFor(item)}} onClick={()=>item.fullImageUrl?setPreview(item):onNavigate(item.id)}>
                        {item.rawThumbnailUrl?<AnnotationImage annotatedUrl={item.thumbnailUrl} rawUrl={item.rawThumbnailUrl} label={item.label} showAnnotations={showAnnotations}/>:<CatalogThumbnail src={item.thumbnailUrl} label={item.label}/>}
                        <span className="sdk-image-camera">{item.camera}</span>
                    </button>
                    {item.removed?<span className="sdk-member-removed-label">Removed</span>:<ButtonSm text="×" buttonType="secondary btn-danger" className="sdk-member-remove"
                        title={`Remove ${item.label} from training set`} disabled={pending||item.pending}
                        ariaBusy={!!item.pending} onClick={()=>onRemove(item.id)}/>}
                    <div className="sdk-image-card-body">
                        {onSelectionChange&&<label className="sdk-member-checkbox"><input type="checkbox" aria-label={`Select ${item.label}`} checked={selected.has(item.id)&&!item.removed}
                            disabled={pending||item.pending||item.removed} onChange={event=>select(item.id,event.currentTarget.checked,(event.nativeEvent as MouseEvent).shiftKey??false)}/><span>{item.camera}</span></label>}
                        {!onSelectionChange&&<strong>{item.camera}</strong>}
                        <small>{item.sourceFrameNumber===undefined?item.groupLabel:`Frame ${item.sourceFrameNumber}`}</small>
                        {item.detail&&<small title={item.detail}>{item.detail}</small>}
                        {item.facts&&<div className="sdk-member-facts">{item.facts}</div>}
                        {item.error&&<span className="sdk-image-save-error" role="alert">{item.error}</span>}
                    </div>
                </article>)}
            </div>
        </div>
        {preview?.fullImageUrl&&<ImagePreview label={preview.label} annotatedUrl={preview.fullImageUrl} rawUrl={preview.rawFullImageUrl} showAnnotations={showAnnotations} onClose={()=>setPreview(null)}/>}
    </section>;
}
