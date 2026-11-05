import {useEffect} from 'react';
import type {CalibrationScene, LoadedCalibration} from '@/calibration';
import {useRecordingSelection} from '../RecordingSelectionContext';
interface ReferenceFrameTarget {
    postMessage(message: {type: 'calibrationScene'; data: CalibrationScene}): void;
}
export function useReferenceFrameForwarder(
    target: ReferenceFrameTarget, isLive: boolean, calibration: LoadedCalibration | null,
): void {
    const selection = useRecordingSelection();
    useEffect(() => {
        target.postMessage({
            type: 'calibrationScene',
            data: {calibration: !isLive && selection ? {cameras: selection.cameras ?? []} : calibration,
                referenceTransform: null},
        });
    }, [target, isLive, calibration, selection]);
}
