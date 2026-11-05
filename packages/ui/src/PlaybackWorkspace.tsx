import {useEffect, useState} from 'react';
import {I18nextProvider} from 'react-i18next';
import RecordingPlaybackSession from './components/playback/RecordingPlaybackSession';
import {PlaybackResources, useRecordingBundle, type RecordingSelection} from './playback-resources';

import translations from './i18n/i18n';

export interface PlaybackWorkspaceProps {baseUrl: string; recording: RecordingSelection | null; showTimingNotice?: boolean}

/** Core's playback presentation, with explicit endpoint and selection inputs. */
export function PlaybackWorkspace({baseUrl, recording, showTimingNotice}: PlaybackWorkspaceProps) {
    const resources = useRecordingBundle(baseUrl, recording);
    const {bundle} = resources;
    const [selectedSource, setSelectedSource] = useState<string | null>(null);
    useEffect(() => setSelectedSource(bundle?.videos.preferredSource ?? null), [bundle]);
    const availableSources = bundle?.videos.sources ?? null;
    const source = selectedSource ?? bundle?.videos.preferredSource;
    const videos = source ? bundle?.videos.sources[source]?.videos ?? [] : [];
    return <I18nextProvider i18n={translations}>
        <PlaybackResources.Provider value={resources}>
            <div className="freemocap-playback-workspace flex flex-col flex-1 min-h-0" style={{height: '100%', minHeight: 320}}>
                {resources.loading && <p role="status">Loading recording…</p>}
                {resources.error && <p role="alert">{resources.error}</p>}
                <RecordingPlaybackSession recording={recording} videos={videos} showTimingNotice={showTimingNotice}
                    availableSources={availableSources} selectedSource={selectedSource} setSelectedSource={setSelectedSource}/>
            </div>
        </PlaybackResources.Provider>
    </I18nextProvider>;
}
