/** Core RecordingBrowser presentation extracted from Redux, Electron and pipeline status. */
import {memo, useId, useMemo, useState} from 'react';
import clsx from 'clsx';
import ButtonSm from '../components/ui-components/ButtonSm';
import IconButton from '../components/ui-components/IconButton';
import SubactionHeader from '../components/ui-components/SubactionHeader';
import {formatBytes, formatDuration, selectBrowserEntries, type BrowserEntry, type BrowserSortDirection, type BrowserSortField} from './browser-model';

export type {BrowserEntry} from './browser-model';
export interface RecordingBrowserProps {
    title?: string; entries: readonly BrowserEntry[]; selectedId?: string | null;
    onSelect: (id: string) => void;
    loading?: boolean; busyId?: string | null; error?: string | null;
    onBrowse?: () => void; onCreate?: () => void; onRefresh?: () => void;
    browseLabel?: string; createLabel?: string; location?: string; emptyMessage?: string;
}
const SORT_OPTIONS: Array<{value: BrowserSortField; label: string}> = [
    {value:'date',label:'Date'}, {value:'name',label:'Name'}, {value:'size',label:'Size'},
    {value:'cameras',label:'Cameras'}, {value:'frames',label:'Frames'}, {value:'duration',label:'Duration'},
];

export function RecordingBrowser({title='Recordings',entries,selectedId,onSelect,loading=false,busyId=null,error,
    onBrowse,onCreate,onRefresh,browseLabel='Open',createLabel='New',location,emptyMessage='No recordings yet.'}: RecordingBrowserProps) {
    const [filterText,setFilterText] = useState('');
    const [showFilter,setShowFilter] = useState(false);
    const [sortField,setSortField] = useState<BrowserSortField>('date');
    const [sortDir,setSortDir] = useState<BrowserSortDirection>('desc');
    const sorted = useMemo(()=>selectBrowserEntries(entries,filterText,sortField,sortDir),[entries,filterText,sortField,sortDir]);
    const filterId = useId();
    return <section className="sdk-recording-browser recording-browser-sidebar-panel" aria-label={title}>
        <SubactionHeader text={`${title} · ${entries.length}`}/>
        <div className="folder-directory-tool-bar sdk-browser-actions">
            {onBrowse && <ButtonSm text={browseLabel} iconClass="subfolder-icon" onClick={onBrowse} disabled={loading || !!busyId}/>}
            {onCreate && <ButtonSm text={createLabel} onClick={onCreate} disabled={loading || !!busyId}/>}
            {onRefresh && <IconButton title={`Refresh ${title.toLowerCase()}`} ariaLabel={`Refresh ${title.toLowerCase()}`} icon="rotate-icon" onClick={onRefresh} disabled={loading || !!busyId}/>}
        </div>
        {location && <p className="sdk-browser-location" title={location}>{location}</p>}
        <div className="sdk-browser-sort">
            <IconButton title={showFilter?'Hide filter':'Filter'} ariaLabel={`Filter ${title.toLowerCase()}`} icon={showFilter?'filter-active-icon':'filter-icon'} onClick={()=>{setShowFilter(!showFilter); if(showFilter)setFilterText('');}}/>
            <select className="sort-select" aria-label={`Sort ${title.toLowerCase()}`} value={sortField} onChange={event=>setSortField(event.target.value as BrowserSortField)}>
                {SORT_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
            <IconButton title={sortDir==='desc'?'Sort ascending':'Sort descending'} ariaLabel={`Sort ${sortDir==='desc'?'ascending':'descending'}`} icon={sortDir==='desc'?'sort-icon':'sortup-icon'} onClick={()=>setSortDir(sortDir==='desc'?'asc':'desc')}/>
        </div>
        {showFilter && <div className="input-with-string"><input id={filterId} className="input-field" aria-label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}…`} value={filterText} onChange={event=>setFilterText(event.target.value)} autoFocus/></div>}
        {error && <p className="sdk-browser-error" role="alert">{error}</p>}
        {loading ? <p className="sdk-browser-empty" role="status">Loading {title.toLowerCase()}…</p> : sorted.length === 0 ?
            <p className="sdk-browser-empty">{entries.length ? 'No matches for this filter.' : emptyMessage}</p> :
            <div className="recording-list sdk-browser-list">{sorted.map(entry=><RecordingRow key={entry.id} entry={entry}
                active={entry.id===selectedId} busy={entry.id===busyId} disabled={!!busyId} onSelect={onSelect}/>)}</div>}
    </section>;
}

const RecordingRow = memo(function RecordingRow({entry,active,busy,disabled,onSelect}: {
    entry: BrowserEntry; active:boolean; busy:boolean; disabled:boolean; onSelect:(id:string)=>void;
}) {
    const [expanded,setExpanded] = useState(false);
    const detailsId = useId();
    const hasDetails = !!entry.path || !!entry.details?.length;
    return <div className={clsx('sdk-browser-row br-1 button quaternary flex text-white flex-col',active&&'is-active',disabled&&!busy&&'recording-row-disabled')}>
        <div className="sdk-browser-row-heading">
            <button type="button" className="sdk-browser-select" aria-pressed={active} disabled={disabled} onClick={()=>onSelect(entry.id)}>
                <span className="sdk-browser-name recording-name" title={entry.name}>{entry.name}</span>
                {entry.subtitle && <span className="sdk-browser-subtitle" title={entry.subtitle}>{entry.subtitle}</span>}
                <span className="sdk-browser-metadata">
                    {entry.cameraCount!==undefined && <span className="tag" title="Camera streams">{entry.cameraCount} cam{entry.cameraCount===1?'':'s'}</span>}
                    {entry.sizeBytes!==undefined && <span className="tag" title="Size">{formatBytes(entry.sizeBytes)}</span>}
                    {entry.durationSeconds!==undefined && <span className="tag" title="Duration">{formatDuration(entry.durationSeconds)}</span>}
                    {entry.frameCount!==undefined && <span className="tag" title="Frames">{entry.frameCount.toLocaleString()} frames</span>}
                </span>
                {entry.status && <span className={`sdk-browser-status ${entry.status.tone}`}>{entry.status.label}</span>}
                {entry.timestamp!==undefined && <time dateTime={new Date(entry.timestamp).toISOString()} title={new Date(entry.timestamp).toLocaleString()}>{new Date(entry.timestamp).toLocaleDateString()}</time>}
                {busy && <span role="status">Opening…</span>}
            </button>
            {hasDetails && <button type="button" className="sdk-browser-expand" aria-label={`${expanded?'Hide':'Show'} details for ${entry.name}`} aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(!expanded)}>
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" style={{transform:expanded?'rotate(180deg)':undefined}}><path d="M3 6L8 11L13 6" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
            </button>}
        </div>
        {expanded && <dl id={detailsId} className="sdk-browser-details">
            {entry.path && <div><dt>Location</dt><dd>{entry.path}</dd></div>}
            {entry.details?.map((detail,index)=><div key={`${detail.label}:${index}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
        </dl>}
    </div>;
});
