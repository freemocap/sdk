import {useEffect,useRef,type ReactNode} from 'react';
/** Core processing window title/chrome; native dialog supplies focus containment and return. */
export function PipelineDialog({title,subtitle,onClose,children}:{title:string;subtitle?:string;onClose():void;children:ReactNode}) {
    const ref=useRef<HTMLDialogElement>(null);
    useEffect(()=>{
        const dialog=ref.current!, previous=document.activeElement;
        dialog.showModal();
        return ()=>{dialog.close();if(previous instanceof HTMLElement && previous.isConnected)previous.focus({preventScroll:true});};
    },[]);
    return <dialog ref={ref} className="mocap-processing sdk-pipeline-dialog flex flex-col" aria-label={title}
        onCancel={event=>{event.preventDefault();onClose();}}
        onKeyDownCapture={event=>{if(event.key==='Escape' && ref.current?.querySelector(':popover-open'))event.preventDefault();}}>
        <header className="mp-title"><h1>{title}</h1>{subtitle && <span className="mp-recording">{subtitle}</span>}
            <button type="button" className="mp-close" aria-label={`Close ${title}`} onClick={onClose}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
        </header>{children}
    </dialog>;
}
