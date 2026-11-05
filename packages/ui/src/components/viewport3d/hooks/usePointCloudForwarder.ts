import {useEffect, useState} from 'react';
import {useRecordingSelection} from '../RecordingSelectionContext';
import type {PointCloudPlayback} from '../point-cloud-format';

export function usePointCloudForwarder(target: Worker, source?: PointCloudPlayback, clock?: () => number | null): {status: string; loadedBytes: number; totalBytes: number} | null {
    const [progress, setProgress] = useState<{status: string; loadedBytes: number; totalBytes: number} | null>(null);
    const concurrency = source?.loading?.concurrency, maxResidentBytes = source?.loading?.maxResidentBytes;
    useEffect(() => {
        const receive = (event: MessageEvent) => {if (event.data.type === 'pointCloudStats') setProgress(event.data.data);};
        target.addEventListener('message', receive);
        return () => target.removeEventListener('message', receive);
    }, [target]);
    const selection = useRecordingSelection();
    const url = source?.manifestUrl;
    const reference = selection?.referenceFrame;
    const id = selection?.referenceFrameId;
    useEffect(() => {
        if (!url || !reference || !id || !clock) {target.postMessage({type: 'pointCloudSource', data: null}); return;}
        target.postMessage({type: 'pointCloudSource', data: {url: new URL(url, location.href).href, reference: {id, definition: reference}, loading: {concurrency, maxResidentBytes}}});
        let raf = 0, previous: number | null | undefined;
        const tick = (): void => {
            const time = clock();
            if (time !== previous) {target.postMessage({type: 'pointCloudTime', data: time}); previous = time;}
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => {cancelAnimationFrame(raf); target.postMessage({type: 'pointCloudSource', data: null});};
    }, [target, url, reference, id, clock, concurrency, maxResidentBytes]);
    return source ? progress : null;
}
