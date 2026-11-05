import type {KeypointsFrame} from './KeypointsSourceContext';
import {keypointSources} from './keypoint-storage';

/** Scan only for an explicit/initial framing command, never on the playback frame path. */
export function withCloudBounds(frame: KeypointsFrame | null, positions?: Float32Array): KeypointsFrame | null {
    if (!positions?.length) return frame;
    const bounds = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    for (let i = 0; i < positions.length; i += 3) for (let axis = 0; axis < 3; axis++) {
        bounds[axis] = Math.min(bounds[axis], positions[i + axis]);
        bounds[axis + 3] = Math.max(bounds[axis + 3], positions[i + axis]);
    }
    const names = ['cloud bounds minimum', 'cloud bounds maximum'];
    const pointSources = [...(frame ? keypointSources(frame) : []), {names, data: bounds}];
    return {pointNames: pointSources.flatMap(source => [...source.names]), pointSources};
}
