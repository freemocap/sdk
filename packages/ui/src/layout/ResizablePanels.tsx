import type {ComponentProps} from 'react';
import {PanelResizeHandle} from 'react-resizable-panels';

// The same pane implementation used by Core's playback workspace.
export {Panel as ResizablePanel, PanelGroup as ResizablePanelGroup} from 'react-resizable-panels';

export function ResizableHandle({className = '', ...props}: ComponentProps<typeof PanelResizeHandle>) {
    return <PanelResizeHandle {...props} className={`sdk-resize-handle ${className}`}/>;
}
