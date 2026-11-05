import {useEffect} from 'react';
import {useRecordingSelection} from '../RecordingSelectionContext';
import type {PointCloudPlayback} from '../point-cloud-format';

export function usePointCloudForwarder(target: Worker, source?: PointCloudPlayback, clock?: () => number | null): void {
    const selection = useRecordingSelection();
    const url = source?.manifestUrl;
    const reference = selection?.referenceFrame;
    const id = selection?.referenceFrameId;
    useEffect(() => {
        if (!url || !reference || !id || !clock) {target.postMessage({type: 'pointCloudSource', data: null}); return;}
        target.postMessage({type: 'pointCloudSource', data: {url: new URL(url, location.href).href, reference: {id, definition: reference}}});
        let raf = 0, previous: number | null | undefined;
        const tick = (): void => {
            const time = clock();
            if (time !== previous) {target.postMessage({type: 'pointCloudTime', data: time}); previous = time;}
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => {cancelAnimationFrame(raf); target.postMessage({type: 'pointCloudSource', data: null});};
    }, [target, url, reference, id, clock]);
}
