import ButtonSm from '../components/ui-components/ButtonSm';
import AnchoredInfo from '../components/ui-components/AnchoredInfo';

export interface SidebarProcessingActionProps {
    text: string;
    onClick(): void;
    disabled?: boolean;
    description?: string;
    iconClass?: string;
}

/** Core SidePanelContent → ProcessMocapPanel action, with app-supplied label and behavior. */
export function SidebarProcessingAction({text,onClick,disabled=false,description,iconClass='processmocap-icon'}:SidebarProcessingActionProps) {
    return <div className="main-side-actions sdk-sidebar-processing-action flex flex-col gap-1">
        <div className="process-group bg-middark br-2 p-2 flex flex-col gap-1">
            <div className="flex flex-row flex-1 items-center gap-1 w-full">
                <ButtonSm text={text} iconClass={iconClass} disabled={disabled} onClick={onClick}
                    className="accent text-nowrap flex flex-row flex-1 gap-1 br-1 button sm flex-inline text-left items-center full-width primary justify-center"/>
                {description && <AnchoredInfo title={text} text={description}/>}
            </div>
        </div>
    </div>;
}
