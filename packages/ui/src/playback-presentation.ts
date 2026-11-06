import type {Ref} from 'react';
import type {RecordingSelection} from './playback-resources';

/** Identity of an actually committed synchronized image group, not a seek request. */
export interface PresentedFrame {
    readonly recording: RecordingSelection;
    readonly mediaSource: string;
    readonly localFrameIndex: number;
    readonly sourceFrameNumber: number;
    readonly timestampSeconds: number;
    readonly presentationEpoch: string;
}
export interface PlaybackWorkspaceHandle {
    pause(): void;
    getPresentedFrame(): PresentedFrame | null;
    seekFrame(localFrameIndex:number): Promise<PresentedFrame | null>;
}
export interface PlaybackPresentationProps {
    getTargetCrop?: TargetCropProvider;
    controlsRef?: Ref<PlaybackWorkspaceHandle>;
    onPresentedFrame?: (frame:PresentedFrame|null)=>void;
}

/** Source-image pixel bounds. The application owns projection, identity, and padding. */
export interface TargetCropBounds {readonly x:number; readonly y:number; readonly width:number; readonly height:number}
export interface TargetCropRequest extends PresentedFrame {
    readonly videoId:string;
    readonly filename:string;
    readonly imageWidth:number;
    readonly imageHeight:number;
}
/** Synchronous lookup of preloaded bounds for this exact camera/frame; null means unavailable. */
export type TargetCropProvider = (request:TargetCropRequest)=>TargetCropBounds|null;
