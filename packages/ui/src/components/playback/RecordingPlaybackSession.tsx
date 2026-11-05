import React, {useCallback, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ResizablePanel as Panel, ResizablePanelGroup as PanelGroup, ResizableHandle as PanelResizeHandle} from '@/layout/ResizablePanels';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import {GridSettingsOverlay} from '@/components/ui-components/GridSettingsOverlay';
import {SyncedVideoPlayer} from './SyncedVideoPlayer';
import {PlaybackControls} from './PlaybackControls';
import {usePlaybackController} from './usePlaybackController';
import {ThreeJsCanvas} from '../viewport3d/ThreeJsCanvas';
import {RecordingPlaybackProvider} from '../viewport3d/RecordingPlaybackProvider';
import type {PlaybackManifest} from '@freemocap/client/recording';
import {usePlaybackResources, type CameraSettings, type RecordingSelection, type PlaybackBundle} from '@/playback-resources';
import type {VideoEntry} from '@/services/recording/browser-video';

interface Props {recording: RecordingSelection | null; videos: VideoEntry[];
    showTimingNotice?: boolean;
    availableSources: PlaybackBundle['videos']['sources'] | null; selectedSource: string | null;
    setSelectedSource: (source: string) => void}
const RecordingPlaybackSession: React.FC<Props> = ({recording, videos, availableSources, selectedSource, setSelectedSource, showTimingNotice}) => {
    const {t} = useTranslation();
    const {bundle, reloadManifest} = usePlaybackResources();
    const [settings, setSettings] = useState<CameraSettings>({columns: null, show3dView: true, layoutDirection: 'horizontal'});
    const [resetKey] = useState(0);
    const loadedVideos = videos;
    const videoEntries = videos;
    const activeRecordingName = recording?.id ?? null;
    const activeRecordingBaseDirectory = recording?.parentDirectory;
    const recordingPath = recording ? [recording.parentDirectory, recording.id].filter(Boolean).join('/') : null;
    const recordingName = recording?.displayName ?? recording?.id ?? t('noVideosLoaded');
    const recordingFps = bundle?.recordingFps ?? undefined;
    const folderError = null;
    const totalSize = videos.reduce((sum, video) => sum + video.sizeBytes, 0);
    const handleSettingsChange = useCallback((partial: Partial<CameraSettings>) => setSettings(previous => ({...previous,...partial})), []);
    const [readyManifest, setReadyManifest] = useState<PlaybackManifest | null>(null);
    const onDataReady = useCallback((manifest: PlaybackManifest, ready: boolean) => {
        setReadyManifest(current => ready ? manifest : current === manifest ? null : current);
    }, []);
    const playbackReady = !settings.show3dView || !bundle?.manifest || readyManifest === bundle.manifest;
    const controller = usePlaybackController({playbackReady, bundle, reloadManifest, videos,
        recordingId: activeRecordingName, recordingParentDirectory: activeRecordingBaseDirectory});
    return (
        <div className="playback-mode-main-container flex flex-col flex-1 min-h-0 pos-rel">
            <GridSettingsOverlay
                settings={settings}
                videoCount={videos.length}
                onSettingsChange={handleSettingsChange}
            />

            <div className="flex flex-col flex-1 overflow-hidden">
                <ErrorBoundary>
                    <div className="flex flex-col pos-rel flex-1 min-h-0">
                        <div className="playback-mode-top-mid-bar flex flex-row items-center gap-1 flex-wrap  p-2">
                            <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                                <p className="text md m-0 truncate" title={recordingPath ?? undefined}>{recordingName}</p>
                                {recordingPath && <span className="recording-path-preview recording-path-tail text sm" title={recordingPath}>
                                    <bdi dir="ltr">{recordingPath}</bdi>
                                </span>}
                            </div>


                            <div className="flex-1"/>

                            <span title={t('cameraStreams')} className="tag text sm">
                                {t('cameraCount', {count: loadedVideos.length})}
                            </span>

                            {totalSize > 0 && (
                                <span title={t('totalRecordingSize')} className="tag text sm">
                                    {formatBytes(totalSize)}
                                </span>
                            )}

                            {recordingFps != null && recordingFps > 0 && (
                                <span title={t('recordingCaptureFps')} className="tag text sm">
                                    rec: {recordingFps.toFixed(2)} fps
                                </span>
                            )}
                        </div>

                        {bundle?.errors.length ? <details className="playback-resource-errors">
                            <summary className="text-error">{bundle.errors.length} recording resource{bundle.errors.length === 1 ? '' : 's'} could not load — show details</summary>
                            <div className="playback-resource-error-details">
                                {bundle.errors.map((failure, index) => <section key={index}>
                                    <strong>{failure.resource}: {failure.item}</strong>
                                    <pre>{failure.message}</pre>
                                </section>)}
                            </div>
                        </details> : null}
                        {folderError && <p role="alert" className="text-error">{folderError}</p>}
                        <div className="playback-mode-below-main p-1 flex flex-col flex-1 min-h-0">
                            {settings.show3dView ? (
                                <PanelGroup
                                    key={`main-panels-${resetKey}-${settings.layoutDirection}`}
                                    direction={settings.layoutDirection}
                                >
                                    <Panel defaultSize={60} minSize={20}>
                                        <div className="playback-mode-video-feed-container br-2 flex flex-col h-full">
                                            <SyncedVideoPlayer
                                                videos={videoEntries}
                                                manualColumns={settings.columns}
                                                resetKey={resetKey}
                                                controller={controller}
                                            />
                                        </div>
                                    </Panel>

                                    <PanelResizeHandle aria-label="Resize media and 3D panes"/>

                                    <Panel defaultSize={40} minSize={10}>
                                        <div className="h-full">
                                            <RecordingPlaybackProvider
                                                recordingId={activeRecordingName}
                                                recordingParentDirectory={activeRecordingBaseDirectory}
                                                getRecordingTime={controller.getRecordingTime}
                                                mediaAvailable={videoEntries.length > 0}
                                                manifest={controller.manifest}
                                                reloadManifest={controller.reloadManifest}
                                                onPlaybackRun={controller.setPlaybackRun}
                                                onDataReady={onDataReady}
                                            >
                                                <ThreeJsCanvas calibration={bundle?.calibration ?? null}/>
                                            </RecordingPlaybackProvider>
                                        </div>
                                    </Panel>
                                </PanelGroup>
                            ) : (
                                <SyncedVideoPlayer
                                    videos={videoEntries}
                                    manualColumns={settings.columns}
                                    resetKey={resetKey}
                                    controller={controller}
                                />
                            )}
                        </div>

                        {controller.error && <p role="alert" className="text-error">{controller.error}</p>}
                        <PlaybackControls
                            showTimingNotice={showTimingNotice ?? (recording !== null && videos.length > 0)}
                            playbackReady={playbackReady}
                            isPlaying={controller.isPlaying}
                            currentTime={controller.currentTime}
                            duration={controller.duration}
                            playbackRate={controller.playbackRate}
                            currentFrame={controller.currentFrame}
                            seekFrame={controller.seekFrame}
                            totalFrames={controller.totalFrames}
                            getCachedFrames={controller.getCachedFrames}
                            getDisplayFps={controller.getDisplayFps}
                            fps={controller.fps}
                            recordingFps={recordingFps}
                            settings={controller.settings}
                            onSettingsChange={controller.setSettings}
                            onPlayPause={controller.handlePlayPause}
                            onSeekDrag={controller.handleSeekDrag}
                            onSeekCommit={controller.handleSeekCommit}
                            onFrameStep={controller.handleFrameStep}
                            onPlaybackRateChange={controller.handlePlaybackRateChange}
                            onSeekToStart={controller.handleSeekToStart}
                            onSeekToEnd={controller.handleSeekToEnd}
                            isLooping={controller.isLooping}
                            onToggleLoop={controller.handleToggleLoop}
                            availableSources={availableSources}
                            selectedSource={selectedSource}
                            onSourceChange={setSelectedSource}
                        />
                    </div>
                </ErrorBoundary>
            </div>
        </div>
    );
};

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

export default RecordingPlaybackSession;
