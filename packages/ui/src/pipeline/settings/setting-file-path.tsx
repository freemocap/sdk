// Adapted from Core CalibrationTomlPicker: the host owns native file selection.
import IconButton from '../../components/ui-components/IconButton';
import './settings-layout.css';

export interface SettingFilePathProps {
    label:string;
    path:string|null;
    onBrowse:()=>void;
    onClear?:()=>void;
    disabled?:boolean;
}

/** Full, selectable file path plus a host-provided native browse action. */
export function SettingFilePath({label,path,onBrowse,onClear,disabled=false}:SettingFilePathProps) {
    return <div className="sdk-setting-file-path flex flex-row items-center gap-1 p-1 br-1 border-1 border-mid-black" role="group" aria-label={label}>
        <span className={`icon icon-size-20 ${path?'upToDate-icon':'warning-icon'}`} aria-hidden="true"/>
        <span className="sdk-setting-file-path-value text sm" aria-label={`${label} path`}>{path??'No file selected'}</span>
        {path && onClear && <IconButton icon="rotate-icon" onClick={onClear} disabled={disabled} title={`Clear ${label}`}/>}
        <button type="button" className="button sm secondary br-1 flex flex-row items-center gap-1" aria-label={`Browse ${label}`} onClick={onBrowse} disabled={disabled}>
            <span className="icon load-icon icon-size-20" aria-hidden="true"/><span className="text sm text-white">Browse</span>
        </button>
    </div>;
}
