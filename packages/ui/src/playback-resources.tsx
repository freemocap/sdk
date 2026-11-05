import {createContext, useContext, useEffect, useMemo, useState, useCallback} from 'react';
import {createHttpClient} from '@freemocap/client';
import {PlaybackManifestSchema, LoadedCalibrationSchema, type PlaybackManifest, type PlaybackMedia, type LoadedCalibration} from '@freemocap/client/recording';

export type LayoutDirection = 'horizontal' | 'vertical';
export interface CameraSettings {columns: number | null; show3dView: boolean; layoutDirection: LayoutDirection}
export interface RecordingSelection {id: string; parentDirectory?: string; displayName?: string}
export interface PlaybackBundle {
    manifest: PlaybackManifest | null; media: PlaybackMedia[];
    errors: Array<{resource: string; item: string; message: string}>;
    recordingId: string; recordingFps: number | null;
    videos: {preferredSource: string; sources: Record<string, {available: boolean; valid: boolean; videoCount: number;
        videos: Array<{videoId: string; filename: string; sizeBytes: number; streamUrl: string}>}>};
    calibration: LoadedCalibration | null;
}
interface Resources {bundle: PlaybackBundle | null; resourceUrl: string | null; reloadManifest: () => void}
export const PlaybackResources = createContext<Resources | null>(null);
export function usePlaybackResources(): Resources {
    const value = useContext(PlaybackResources);
    if (!value) throw new Error('Mount PlaybackWorkspace before using playback resources');
    return value;
}

export function useRecordingBundle(baseUrl: string, recording: RecordingSelection | null) {
    const client = useMemo(() => createHttpClient({baseUrl}), [baseUrl]);
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState<{key: string; bundle: PlaybackBundle | null; error: string | null; loading: boolean} | null>(null);
    const id = recording?.id;
    const directory = recording?.parentDirectory;
    const key = JSON.stringify([baseUrl, id, directory]);
    const reloadManifest = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        if (!id) return;
        const abort = new AbortController();
        setState({key, bundle: null, error: null, loading: true});
        void (async () => {
            try {
                const response = await client.responses.recordings_get_recording_bundle({path: {recording_id: id},
                    query: {recording_parent_directory: directory}, signal: abort.signal});
                if (!response.ok) throw new Error(`Bundle fetch failed: ${response.status}`);
                const data = await response.json();
                const sources: PlaybackBundle['videos']['sources'] = {};
                for (const [name, source] of Object.entries(data.videos.sources) as [string, any][]) {
                    sources[name] = {available: source.available, valid: source.valid, videoCount: source.video_count,
                        videos: source.videos.map((video: any) => ({videoId: video.video_id, filename: video.filename,
                            sizeBytes: video.size_bytes, streamUrl: new URL(video.stream_url, baseUrl).href}))};
                }
                const bundle: PlaybackBundle = {recordingId: data.recording_id,
                    manifest: PlaybackManifestSchema.nullable().parse(data.manifest), media: data.media,
                    errors: data.errors, recordingFps: data.recording_fps ?? null,
                    videos: {preferredSource: data.videos.preferred_source, sources},
                    calibration: LoadedCalibrationSchema.nullable().parse(data.calibration ?? null)};
                if (!abort.signal.aborted) setState({key, bundle, error: null, loading: false});
            } catch (error) {
                if (!abort.signal.aborted) setState({key, bundle: null, error: String(error), loading: false});
            }
        })();
        return () => abort.abort();
    }, [client, baseUrl, id, directory, key, revision]);
    const current = state?.key === key ? state : null;
    return {bundle: current?.bundle ?? null, error: current?.error ?? null,
        loading: !!id && (current?.loading ?? true), reloadManifest,
        resourceUrl: id ? `${baseUrl.replace(/\/$/, '')}/freemocap/recordings/${encodeURIComponent(id)}` : null};
}
