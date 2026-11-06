import {useEffect,useRef,useState,type RefObject,type PointerEvent,type KeyboardEvent} from 'react';
import {clampCloseup,initialCloseup,resizeCloseup,type CloseupEdge,type CloseupLayout,type CloseupSurface} from './target-closeup-layout';

interface Props {topInset?:number;surfaceRef:RefObject<HTMLDivElement|null>;videoId:string;registerCanvas:(canvas:HTMLCanvasElement|null)=>void}
/** Per-camera placement survives frame/provider/source updates; only parent size constrains it. */
export function TargetCloseup({surfaceRef,videoId,registerCanvas,topInset=0}:Props) {
    const [layout,setLayout]=useState<CloseupLayout|null>(null);
    const figure=useRef<HTMLElement|null>(null);
    const adjusted=useRef(false);
    const surface=useRef<CloseupSurface>({width:0,height:0});
    const gesture=useRef<{pointer:number;mode:'move'|CloseupEdge;x:number;y:number;layout:CloseupLayout}|null>(null);
    useEffect(()=>{
        const parent=surfaceRef.current;if(!parent)return;
        const update=()=>{
            const ratio=Number(figure.current?.style.getPropertyValue('--target-aspect'));
            const next={width:parent.clientWidth,height:parent.clientHeight,topInset,aspect:ratio>0?ratio:1};surface.current=next;
            if(next.width>0 && next.height>0)setLayout(old=>old&&adjusted.current?clampCloseup(old,next):initialCloseup(next));
        };
        const observer=new ResizeObserver(update);observer.observe(parent);if(figure.current)observer.observe(figure.current);update();return()=>observer.disconnect();
    },[surfaceRef,topInset]);
    const start=(event:PointerEvent<HTMLButtonElement>,mode:'move'|CloseupEdge)=>{
        event.stopPropagation();event.preventDefault();if(!layout || event.button!==0)return;
        adjusted.current=true;
        gesture.current={pointer:event.pointerId,mode,x:event.clientX,y:event.clientY,layout};
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const move=(event:PointerEvent<HTMLButtonElement>)=>{
        const active=gesture.current;if(!active || active.pointer!==event.pointerId)return;
        event.stopPropagation();event.preventDefault();
        const dx=event.clientX-active.x,dy=event.clientY-active.y;
        if(active.mode==='move')setLayout(clampCloseup({...active.layout,x:active.layout.x+dx,y:active.layout.y+dy},surface.current));
        else setLayout(resizeCloseup(active.layout,active.mode,dx,dy,surface.current));
    };
    const stop=(event:PointerEvent<HTMLButtonElement>)=>{
        event.stopPropagation();gesture.current=null;
        if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const keyboard=(event:KeyboardEvent<HTMLButtonElement>,mode:'move'|CloseupEdge)=>{
        if(!layout || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
        adjusted.current=true;
        event.preventDefault();event.stopPropagation();const step=event.shiftKey?24:8;
        const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;
        const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
        setLayout(mode==='move'?clampCloseup({...layout,x:layout.x+dx,y:layout.y+dy},surface.current):resizeCloseup(layout,mode,dx,dy,surface.current));
    };
    const handlers={onPointerMove:move,onPointerUp:stop,onPointerCancel:stop,onLostPointerCapture:()=>{gesture.current=null;}};
    return <figure ref={figure} className="playback-target-closeup" data-camera={videoId} aria-label={`${videoId} target close-up`}
        style={{left:layout?.x??6,top:layout?.y??6,width:layout?.size??240,aspectRatio:'var(--target-aspect, 1)',visibility:layout?'visible':'hidden'}}
        onMouseDown={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()}
        onTouchStart={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}>
        <canvas ref={registerCanvas} width={640} height={640} data-video-id={videoId} data-crop-status="unavailable"/>
        <button type="button" className="playback-closeup-drag" aria-label={`Move ${videoId} target close-up`} title="Drag image to move"
            onPointerDown={event=>start(event,'move')} onKeyDown={event=>keyboard(event,'move')} {...handlers}/>
        <span className="playback-closeup-unavailable">Target unavailable</span>
        {(['n','ne','e','se','s','sw','w','nw'] as const).map(edge=><button key={edge} type="button"
            className={`playback-closeup-resize resize-${edge}`} data-edge={edge} aria-label={`Resize ${videoId} target close-up ${edge}`}
            onPointerDown={event=>start(event,edge)} onKeyDown={event=>keyboard(event,edge)} {...handlers}/>)}
    </figure>;
}
