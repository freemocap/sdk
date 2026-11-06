import {useState} from 'react';
import {I18nextProvider} from 'react-i18next';
import RecordingPlaybackSession from './components/playback/RecordingPlaybackSession';
import {PlaybackResources, useRecordingBundle, type RecordingSelection} from './playback-resources';

import translations from './i18n/i18n';
import type {PlaybackPresentationProps} from './playback-presentation';

export interface PlaybackWorkspaceProps extends PlaybackPresentationProps {baseUrl: string; recording: RecordingSelection | null; showTimingNotice?: boolean;
    pointCloud?: import('./components/viewport3d/point-cloud-format').PointCloudPlayback}

/** Core's playback presentation, with explicit endpoint and selection inputs. */
export function PlaybackWorkspace({baseUrl, recording, showTimingNotice, pointCloud, controlsRef, onPresentedFrame, getTargetCrop, renderImageControls, activeVideoId, navigationGroups}: PlaybackWorkspaceProps) {
    const resources = useRecordingBundle(baseUrl, recording);
    const {bundle} = resources;
    const recordingKey = JSON.stringify([baseUrl, recording?.id, recording?.parentDirectory]);
    const [choice, setChoice] = useState<{key:string;source:string}|null>(null);
    if(choice && choice.key!==recordingKey)setChoice(null);
    const sources = bundle?.videos.sources ?? {};
    const defaultSource = ['annotated',bundle?.videos.preferredSource,'synchronized',...Object.keys(sources)]
        .find(name=>name && sources[name]?.available && sources[name].valid && sources[name].videos.length) ?? null;
    const selectedSource = choice?.key === recordingKey ? choice.source : defaultSource;
    const setSelectedSource = (source:string) => setChoice({key:recordingKey,source});
    const availableSources = bundle?.videos.sources ?? null;
    const source = selectedSource ?? bundle?.videos.preferredSource;
    const videos = source ? bundle?.videos.sources[source]?.videos ?? [] : [];
    return <I18nextProvider i18n={translations}>
        <PlaybackResources.Provider value={resources}>
            <div className="freemocap-playback-workspace flex flex-col flex-1 min-h-0" style={{height: '100%', minHeight: 320}}>
                {resources.loading && <p role="status">Loading recording…</p>}
                {resources.error && <p role="alert">{resources.error}</p>}
                <RecordingPlaybackSession recording={recording} videos={videos} showTimingNotice={showTimingNotice}
                    pointCloud={pointCloud} getTargetCrop={getTargetCrop} renderImageControls={renderImageControls} activeVideoId={activeVideoId} navigationGroups={navigationGroups} controlsRef={controlsRef} onPresentedFrame={onPresentedFrame}
                    availableSources={availableSources} selectedSource={selectedSource} setSelectedSource={setSelectedSource}/>
            </div>
        </PlaybackResources.Provider>
    </I18nextProvider>;
}
