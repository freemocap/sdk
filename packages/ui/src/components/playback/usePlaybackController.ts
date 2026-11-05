import {VideoPresentation} from '@/services/recording/video-presentation';
import {BrowserVideo, type VideoEntry} from '@/services/recording/browser-video';
import {videoFrameSeekTime, waitForSharedPresentation} from '@/services/recording/presentation-barrier';
import {useCallback, useEffect, useRef, useState} from 'react';
import type {PlaybackSettings} from './SyncedVideoPlayer';
import {PlaybackLabel} from '@/services/recording/playback-label';
import type {PlaybackRun, PlaybackMedia} from '@/services/recording/playback-data';
import type {PlaybackBundle} from '@/playback-resources';

interface UsePlaybackControllerArgs {
    videos: VideoEntry[]; recordingId: string | null; recordingParentDirectory: string | null | undefined;
    bundle: Pick<PlaybackBundle, 'manifest' | 'media' | 'videos'> | null;
    reloadManifest: () => void;
    onFrameChange?: (frame: number) => void;
    playbackReady?: boolean;
}

export function usePlaybackController({videos, recordingId, recordingParentDirectory, bundle, reloadManifest, onFrameChange, playbackReady = true}: UsePlaybackControllerArgs) {
    const [media, setMedia] = useState<PlaybackMedia[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [requestedFrame, setRequestedFrame] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isLooping, setIsLooping] = useState(false);
    const [videosReady, setVideosReady] = useState(0);
    const [erroredVideos, setErroredVideos] = useState(new Set<string>());
    const [settings, setSettings] = useState<PlaybackSettings>({showOverlays: true, timestampFormat: 'seconds'});
    const settingsRef = useRef(settings); settingsRef.current = settings;
    const presentation = useRef<VideoPresentation | null>(null);
    const displayCanvases = useRef(new Map<string, HTMLCanvasElement>());
    const elements = useRef(new Map<string, HTMLVideoElement>());
    const [elementRevision, setElementRevision] = useState(0);
    const players = useRef<BrowserVideo[]>([]);
    const frameLabels = useRef(new Map<string, PlaybackLabel>());
    const currentFrameRef = useRef(0);
    const measuredFps = useRef<number | null>(null);
    const seekGeneration = useRef(0);
    const seeking = useRef(false);
    const pendingPresentation = useRef<number | null>(null);
    const onFrameChangeRef = useRef(onFrameChange); onFrameChangeRef.current = onFrameChange;
    const videosRef = useRef(videos); videosRef.current = videos;
    const source = Object.entries(bundle?.videos.sources ?? {}).find(([, value]) => value.videos.some(video => video.streamUrl === videos[0]?.streamUrl));
    const leader = media.find(item => item.video_source === source?.[0] && item.video_filename === videos[0]?.filename);
    const totalFrames = leader?.timeline.frame_numbers.length ?? 0;
    const fps = leader?.nominal_fps ?? 30;
    const duration = totalFrames / fps;
    const videoKey = JSON.stringify(videos);
    const fail = useCallback((failure: Error): void => {setError(failure.message); setIsPlaying(false);}, []);
    useEffect(() => {if (!playbackReady) setIsPlaying(false);}, [playbackReady]);
    useEffect(() => {setMedia(bundle?.media ?? []);}, [bundle]);
    useEffect(() => {
        currentFrameRef.current = 0; setCurrentFrame(0); setRequestedFrame(0); setIsPlaying(false);
    }, [recordingId, recordingParentDirectory]);

    useEffect(() => {
        setIsPlaying(false); setVideosReady(0); setError(null); setErroredVideos(new Set());
        seeking.current = false; ++seekGeneration.current;
        pendingPresentation.current = currentFrameRef.current;
        setRequestedFrame(currentFrameRef.current);
        if (!totalFrames || !videosRef.current.length) return;
        if (source && !source[1].valid) {fail(new Error('Video group has incompatible frame counts. See recording resource errors.')); return;}
        if (videosRef.current.some(video => !elements.current.has(video.videoId) || !displayCanvases.current.has(video.videoId))) return;
        let active = true;
        const presented = new VideoPresentation(new Map(videosRef.current.map(video => [video.videoId, displayCanvases.current.get(video.videoId)!])), fps);
        presentation.current = presented;
        const opened = videosRef.current.map(video => {
            const element = elements.current.get(video.videoId);
            if (!element) throw new Error(`Missing video element: ${video.filename}`);
            return new BrowserVideo(element, video.streamUrl, duration, fail, (time, videoElement) => presented.capture(video.videoId, videoElement, time));
        });
        players.current = opened;
        const start = videoFrameSeekTime(currentFrameRef.current, fps);
        void Promise.allSettled(opened.map(player => player.open(start))).then(results => {
            if (!active) return;
            const failed = new Set<string>();
            const failures: string[] = [];
            players.current = opened.filter((player, index) => {
                const result = results[index];
                if (result.status === 'fulfilled') return true;
                failed.add(videosRef.current[index].videoId);
                failures.push(`${videosRef.current[index].filename}: ${String(result.reason)}`);
                player.close(); return false;
            });
            setErroredVideos(failed); setVideosReady(players.current.length);
            if (failures.length) setError(failures.join('\n'));
        });
        return () => {active = false; opened.forEach(player => player.close()); players.current = []; presented.close(); if (presentation.current === presented) presentation.current = null;};
    }, [videoKey, totalFrames, duration, fps, recordingId, recordingParentDirectory, elementRevision, fail]);

    const seek = useCallback(async (frame: number): Promise<boolean> => {
        const generation = ++seekGeneration.current;
        seeking.current = true;
        presentation.current?.reset();
        setIsPlaying(false);
        const target = Math.max(0, Math.min(Math.round(frame), totalFrames - 1));
        pendingPresentation.current = target;
        setRequestedFrame(target);
        const current = players.current;
        current.forEach(player => player.element.pause());
        const isCurrent = (): boolean => players.current === current && generation === seekGeneration.current;
        try {
            if (!current.length || current.length !== videosRef.current.length) return false;
            await Promise.all(current.map(player => player.seek(videoFrameSeekTime(target, fps))));
            if (!await waitForSharedPresentation(() => current.map(player => player.presentedTime), target, fps, isCurrent)) return false;
            if (!presentation.current?.commit(target)) throw new Error('Matching decoded images were not available after seek');
            // Publish the browser-confirmed shared target before any caller resumes media.
            pendingPresentation.current = null;
            currentFrameRef.current = target;
            setCurrentFrame(target);
            onFrameChangeRef.current?.(target);
            return true;
        } catch (failure) {
            if (isCurrent()) fail(failure instanceof Error ? failure : new Error(String(failure)));
            return false;
        } finally {if (isCurrent()) seeking.current = false;}
    }, [fps, totalFrames, fail]);

    useEffect(() => {
        const current = players.current;
        current.forEach(player => {player.element.playbackRate = playbackRate;});
        if (isPlaying && playbackReady) {
            measuredFps.current = null;
            void Promise.all(current.map(player => player.element.play())).catch(failure => {if (players.current === current) fail(failure);});
        } else current.forEach(player => player.element.pause());
    }, [isPlaying, playbackRate, videosReady, fail, playbackReady]);

    useEffect(() => {
        const leaderElement = players.current[0]?.element;
        if (!leaderElement || !videosReady) return;
        let handle = 0;
        let lastUi = 0;
        let startTime = performance.now();
        let count = 0;
        let lastPresentedFrame = -1;
        const tick = (now: number): void => {
            const shown = presentation.current;
            if (!seeking.current) shown?.commit(pendingPresentation.current ?? undefined);
            const time = shown?.time;
            const frame = shown?.index;
            if (time === null || time === undefined || frame === null || frame === undefined || seeking.current ||
                (pendingPresentation.current !== null && pendingPresentation.current !== frame)) {
                handle = requestAnimationFrame(tick);
                return;
            }
            pendingPresentation.current = null;
            if (frame === lastPresentedFrame) {handle = requestAnimationFrame(tick); return;}
            lastPresentedFrame = frame;
            currentFrameRef.current = frame;
            onFrameChangeRef.current?.(frame);
            const seconds = Math.floor(time);
            const timecode = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60,
                Math.floor((time - seconds) * fps)].map(value => String(value).padStart(2, '0')).join(':');
            const timestamp = settingsRef.current.timestampFormat === 'timecode' ? timecode : `${time.toFixed(3)} s`;
            frameLabels.current.forEach(label => label.draw(`F${leader?.timeline.frame_numbers[frame] ?? frame} | ${timestamp}`));
            if (isPlaying) {
                count++;
                if (now - startTime >= 500) {measuredFps.current = count * 1000 / (now - startTime); count = 0; startTime = now;}
            }
            if (!isPlaying || now - lastUi >= 100) {setCurrentFrame(frame); lastUi = now;}
            handle = requestAnimationFrame(tick);
        };
        const ended = (): void => {void seek(isLooping ? 0 : totalFrames - 1).then(ready => {if (ready && isLooping) setIsPlaying(true);});};
        leaderElement.addEventListener('ended', ended);
        handle = requestAnimationFrame(tick);
        return () => {cancelAnimationFrame(handle); leaderElement.removeEventListener('ended', ended);};
    }, [videosReady, isPlaying, isLooping, fps, totalFrames, seek, leader]);

    const setVideoRef = useCallback((id: string, element: HTMLVideoElement | null): void => {
        if ((elements.current.get(id) ?? null) === element) return;
        if (element) elements.current.set(id, element); else elements.current.delete(id);
        setElementRevision(revision => revision + 1);
    }, []);
    const setPresentationRef = useCallback((id: string, canvas: HTMLCanvasElement | null): void => {
        if ((displayCanvases.current.get(id) ?? null) === canvas) return;
        if (canvas) displayCanvases.current.set(id, canvas); else displayCanvases.current.delete(id);
        setElementRevision(revision => revision + 1);
    }, []);
    const setFrameOverlayRef = useCallback((id: string, element: HTMLCanvasElement | null): void => {
        if (element) frameLabels.current.set(id, new PlaybackLabel(element)); else frameLabels.current.delete(id);
    }, []);
    const getDisplayFps = useCallback(() => measuredFps.current, []);
    const getRecordingTime = useCallback(() => {
        const index = presentation.current?.index;
        if (seeking.current || index === null || index === undefined || pendingPresentation.current !== null) return null;
        return leader?.timeline.timestamps_s[index] ?? null;
    }, [leader, fps, totalFrames]);
    const setPlaybackRun = useCallback((run: PlaybackRun): void => {
        const saved = new Map(run.media.map(item => [JSON.stringify([item.video_source, item.video_filename]), item]));
        setMedia((bundle?.media ?? []).map(item => saved.get(JSON.stringify([item.video_source, item.video_filename])) ?? item));
    }, [bundle]);
    const getCachedFrames = useCallback((): number[] => {
        const ranges = players.current[0]?.element.buffered;
        if (!ranges) return [];
        const frames: number[] = [];
        for (let i = 0; i < ranges.length; i++) for (let n = Math.ceil(ranges.start(i) * fps); n < Math.min(totalFrames, ranges.end(i) * fps); n++) frames.push(n);
        return frames;
    }, [fps, totalFrames]);
    const handlePlayPause = useCallback((): void => {
        if (!playbackReady) return;
        if (isPlaying) setRequestedFrame(currentFrameRef.current);
        else if (currentFrameRef.current >= totalFrames - 1 || seeking.current || pendingPresentation.current !== null) {
            const target = currentFrameRef.current >= totalFrames - 1 ? 0 : pendingPresentation.current ?? currentFrameRef.current;
            void seek(target).then(ready => {if (ready) setIsPlaying(true);}); return;
        }
        setIsPlaying(value => !value);
    }, [isPlaying, totalFrames, seek, playbackReady]);
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.target instanceof HTMLElement && (event.target.isContentEditable ||
                event.target.closest('[role="separator"]') || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName))) return;
            switch (event.key) {
                case ' ': event.preventDefault(); handlePlayPause(); break;
                case 'ArrowLeft': event.preventDefault(); seek(currentFrameRef.current - 1); break;
                case 'ArrowRight': event.preventDefault(); seek(currentFrameRef.current + 1); break;
                case 'Home': event.preventDefault(); seek(0); break;
                case 'End': event.preventDefault(); seek(totalFrames - 1); break;
            }
        };
        window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
    }, [handlePlayPause, seek]);
    return {
        manifest: bundle?.manifest ?? null, setPlaybackRun, reloadManifest, error, getRecordingTime, getCachedFrames, getDisplayFps,
        seekFrame: isPlaying ? currentFrame : requestedFrame,
        isPlaying, currentFrame, totalFrames, duration, playbackRate, fps, currentTime: currentFrame / fps, settings,
        isLooping, videosReady, allReady: videosReady > 0 && videosReady + erroredVideos.size === videos.length,
        erroredVideos, setSettings, handlePlayPause, isSeeking: false,
        handleSeekDrag: seek, handleSeekCommit: seek,
        handleFrameStep: (delta: number): void => {void seek(currentFrameRef.current + delta);},
        handlePlaybackRateChange: setPlaybackRate,
        handleSeekToStart: (): void => {void seek(0);}, handleSeekToEnd: (): void => {void seek(totalFrames - 1);},
        handleToggleLoop: (): void => setIsLooping(value => !value),
        setVideoRef, setPresentationRef, setFrameOverlayRef, currentFrameRef,
    };
}
export type PlaybackController = ReturnType<typeof usePlaybackController>;
