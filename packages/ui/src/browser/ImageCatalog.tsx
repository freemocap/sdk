import {useState,type KeyboardEvent,type ReactNode} from 'react';
import ButtonSm from '../components/ui-components/ButtonSm';
import SubactionHeader from '../components/ui-components/SubactionHeader';

export interface ImageSelectionToggleProps {
    included:boolean|null;pending?:boolean;disabled?:boolean;error?:string;onToggle:()=>void;label?:string;
}
export function ImageSelectionToggle({included,pending,disabled,error,onToggle,label}:ImageSelectionToggleProps) {
    return <div className="sdk-image-selection" data-included={included===null?'unavailable':String(included)}>
        <ButtonSm text={pending?'Saving…':included===null?'No generated labels':included?'✓ Included':'＋ Include image'}
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
export interface ImageCatalogProps {
    actions?:ReactNode;
    onIncludeAll?:()=>void;includeAllPending?:boolean;includeAllDisabled?:boolean;
    items:readonly ImageCatalogItem[];activeId?:string;onNavigate:(id:string)=>void;onToggle:(id:string)=>void;
    pending?:boolean;error?:string;onFilterChange?:(filter:ImageCatalogFilter)=>void;navigation?:ImageCatalogNavigation;
}
function CatalogThumbnail({src,label}:{src:string|null;label:string}) {
    const [failed,setFailed]=useState<string|null>(null);
    return src&&src!==failed?<img src={src} alt={label} loading="lazy" decoding="async" onError={()=>setFailed(src)}/>
        :<span className="sdk-image-thumbnail-unavailable">Target unavailable</span>;
}
export function ImageCatalog({items,activeId,onNavigate,onToggle,pending,error,onFilterChange,navigation,actions,onIncludeAll,includeAllPending,includeAllDisabled}:ImageCatalogProps) {
    const [filter,setFilter]=useState<ImageCatalogFilter>({inclusion:'all',camera:null});
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
        {onIncludeAll&&<ButtonSm className="sdk-image-include-all" text={includeAllPending?'Saving…':'Include all'} iconClass="checkUpdate-icon" textColor=""
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
