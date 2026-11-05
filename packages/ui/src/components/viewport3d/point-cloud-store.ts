import {PointCloudPlayer} from './point-cloud-player';
import type {CloudFrame} from './point-cloud-format';
let latest: CloudFrame | null = null;
const listeners = new Set<(frame: CloudFrame | null) => void>();
export const pointCloudRenderStats = {geometryId: '', positionAttributeId: -1, colorAttributeId: -1,
    uploads: 0, uploadMs: 0, maxUploadMs: 0, visible: false, renderedFrameIndex: -1,
    renderedSourceFrameIndex: -1, renderedTimestamp: null as number | null};
export const pointCloudStore = {
    getLatest: () => latest,
    subscribe(callback: (frame: CloudFrame | null) => void): () => void {
        listeners.add(callback); callback(latest); return () => {listeners.delete(callback);};
    },
};
export const pointCloudPlayer = new PointCloudPlayer(frame => {
    latest = frame; listeners.forEach(callback => callback(frame));
}, error => {console.error('Point cloud playback:', error); self.postMessage({type: 'pointCloudError', message: error.message});});
