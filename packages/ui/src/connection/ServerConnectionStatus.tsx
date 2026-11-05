/** Core server monitor presentation with app-owned connection state and actions. */
import {ConnectionState} from '@freemocap/client';
import DropdownButton from '../components/ui-components/DropdownButton';
import SubactionHeader from '../components/ui-components/SubactionHeader';
import ButtonSm from '../components/ui-components/ButtonSm';

export interface ServerConnectionStatusProps {
    state: ConnectionState;
    endpoint: string;
    onReconnect?: () => void;
    onDisconnect?: () => void;
    error?: string | null;
    httpStatus?: 'checking' | 'available' | 'unavailable';
    processId?: number;
}
export function connectionPresentation(state: ConnectionState): {text:string; icon:string} {
    switch (state) {
        case ConnectionState.CONNECTED: return {text:'Connected',icon:'connected-icon'};
        case ConnectionState.CONNECTING: return {text:'Connecting…',icon:'loader-icon'};
        case ConnectionState.RECONNECTING: return {text:'Reconnecting…',icon:'loader-icon'};
        case ConnectionState.FAILED: return {text:'Connection failed',icon:'warning-icon'};
        default: return {text:'Not connected',icon:'warning-icon'};
    }
}

export function ServerConnectionStatus({state,endpoint,onReconnect,onDisconnect,error,httpStatus,processId}: ServerConnectionStatusProps) {
    const presentation = connectionPresentation(state);
    const connected = state === ConnectionState.CONNECTED;
    const connecting = state === ConnectionState.CONNECTING || state === ConnectionState.RECONNECTING;
    // Socket connectedness never comes from HTTP health or owned-process liveness.
    return <div className="sdk-server-monitor" aria-label="Server connection monitor">
        <DropdownButton buttonProps={{text:presentation.text,iconClass:presentation.icon,rightSideIcon:'dropdown',textColor:'text-gray',
            className:`connection-status-button-opener full-width${connected?'':' connection-idle-outline'}`}}
            dropdownClassName="connection-status-dropdown sdk-connection-dropdown bg-dark"
            dropdownItems={<div className="connection-container flex flex-col p-1 gap-2 br-1 bg-darkgray border-mid-black">
                <SubactionHeader text="Server connection"/>
                <div className="sdk-connection-status" role="status"><span className={`sdk-connection-dot ${connected?'is-connected':''}`}/>{presentation.text}</div>
                <dl className="sdk-connection-details"><div><dt>Endpoint</dt><dd>{endpoint}</dd></div>
                    <div><dt>WebSocket</dt><dd>{presentation.text}</dd></div>
                    {httpStatus && <div><dt>HTTP</dt><dd>{httpStatus==='checking'?'Checking…':httpStatus==='available'?'Available':'Unavailable'}</dd></div>}
                    {processId!==undefined && <div><dt>Backend process</dt><dd>{processId}</dd></div>}
                </dl>
                {error && <p role="alert" className="sdk-browser-error">{error}</p>}
                <div className="sdk-browser-actions">
                    {onReconnect && <ButtonSm text={connected?'Reconnect':'Connect'} onClick={onReconnect} disabled={connecting}/>}
                    {onDisconnect && <ButtonSm text="Disconnect" onClick={onDisconnect} disabled={!connected&&!connecting}/>}
                </div>
            </div>}/>
    </div>;
}
