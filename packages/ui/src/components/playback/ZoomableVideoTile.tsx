import type {PlaybackPresentationProps} from '../../playback-presentation';
import {TargetCloseup} from './TargetCloseup';
import React, {useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {useZoomTransform} from '@/hooks/useZoomTransform';
import type {PlaybackController} from './usePlaybackController';

interface ZoomableVideoTileProps extends Pick<PlaybackPresentationProps,'renderImageControls'> {
    active?:boolean;
    pause:PlaybackController['pause'];
    getPresentedImage:PlaybackController['getPresentedImage'];
    videoId: string;
    streamUrl: string;
    filename: string;
    showOverlays: boolean;
    hasError: boolean;
    setVideoRef: PlaybackController['setVideoRef'];
    setPresentationRef: PlaybackController['setPresentationRef'];
    showTargetCrop:boolean;
    setCropRef:PlaybackController['setCropRef'];
    setFrameOverlayRef: PlaybackController['setFrameOverlayRef'];
}

export const ZoomableVideoTile: React.FC<ZoomableVideoTileProps> = ({
    videoId,
    streamUrl,
    filename,
    showOverlays,
    hasError,
    setVideoRef,
    setPresentationRef,
    setFrameOverlayRef, showTargetCrop, setCropRef, renderImageControls, active, pause, getPresentedImage,
}) => {
    const surfaceRef=useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const registerVideo = useCallback((element: HTMLVideoElement | null): void => {
        setVideoRef(videoId, element);
    }, [videoId, setVideoRef]);
    const registerPresentation = useCallback((canvas: HTMLCanvasElement | null): void => setPresentationRef(videoId, canvas), [videoId, setPresentationRef]);
    const registerCrop=useCallback((canvas:HTMLCanvasElement|null)=>setCropRef(videoId,canvas),[videoId,setCropRef]);
    const { zoomWrapperStyle, cursor, containerHandlers } = useZoomTransform(containerRef);
    const { t } = useTranslation();

    return (
        <div ref={surfaceRef}
            className="w-full h-full overflow-hidden pos-rel"
            style={{
                backgroundColor: '#000',
                cursor, outline:active?'3px solid var(--color-info, #4ec5cf)':undefined,outlineOffset:-3,
            }}
        >
            <div ref={containerRef} {...containerHandlers} style={{position:'absolute',inset:0,overflow:'hidden'}}>
            <div style={{...zoomWrapperStyle, position: 'relative'}}>
                <video playsInline muted
                    ref={registerVideo}
                    className="w-full h-full block"
                    style={{ objectFit: 'contain', opacity: 0.001 }}
                />
                <canvas ref={registerPresentation} data-video-id={videoId} className="playback-presented-image w-full h-full block"
                    style={{position: 'absolute', inset: 0, objectFit: 'contain', background: '#000'}} />
            </div>

            </div>
            {showTargetCrop && <TargetCloseup topInset={renderImageControls?44:0} surfaceRef={surfaceRef} videoId={videoId} registerCanvas={registerCrop}/>}
            {renderImageControls && <div className="playback-image-controls"
                onPointerDown={event=>event.stopPropagation()} onMouseDown={event=>event.stopPropagation()}
                onTouchStart={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()}>
                {renderImageControls({videoId,filename,pause,getPresentedFrame:()=>getPresentedImage(videoId)})}
            </div>}
            {hasError && (
                <div className="pos-abs inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center z-5" style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    color: 'var(--color-danger-text)',
                }}>
                    <span className="text sm" style={{fontWeight: 600}}>{t("videoPlaybackError")}</span>
                    <span className="text xs" style={{color: '#aaa', wordBreak: 'break-all'}}>{filename}</span>
                </div>
            )}

            {showOverlays && (
                <>
                    <canvas width={210} height={18}
                        ref={(el) => setFrameOverlayRef(videoId, el)}
                        className="pos-abs top-6 right-6 z-10"
                        style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.75)',
                            borderRadius: '3px',
                            userSelect: 'none', pointerEvents: 'none',
                        }}
                    />

                    <div title={filename} className="pos-abs bottom-6 left-6 z-10" style={{
                        maxWidth: showTargetCrop ? 'calc(58% - 18px)' : 'calc(100% - 12px)', boxSizing: 'border-box',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        backgroundColor: 'rgba(0, 0, 0, 0.75)',
                        color: '#ccc', padding: '2px 8px', borderRadius: '3px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        userSelect: 'none',
                    }}>
                        {filename}
                    </div>

                </>
            )}
        </div>
    );
};

ZoomableVideoTile.displayName = 'ZoomableVideoTile';
