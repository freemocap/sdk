import {useEffect, useMemo, useRef} from 'react';
import {useFrame, useThree} from '@react-three/fiber';
import {BufferAttribute, BufferGeometry, DynamicDrawUsage, PointsMaterial} from 'three';
import {pointCloudStore, pointCloudRenderStats} from '../point-cloud-store';
import type {CloudFrame} from '../point-cloud-format';
import {useReferenceTransform} from '../scene/ReferenceFrame';

/** Fixed storage; each frame updates existing attributes and draw count [@threeBufferAttribute2026; @threeBufferGeometry2026]. */
export function PointCloudRenderer() {
    const invalidate = useThree(state => state.invalidate);
    const transform = useReferenceTransform();
    const frame = useRef<CloudFrame | null>(null), dirty = useRef(true);
    const geometry = useMemo(() => {
        const result = new BufferGeometry();
        result.setAttribute('position', new BufferAttribute(new Float32Array(60000 * 3), 3).setUsage(DynamicDrawUsage));
        result.setAttribute('color', new BufferAttribute(new Uint8Array(60000 * 3), 3, true).setUsage(DynamicDrawUsage));
        result.setDrawRange(0, 0); return result;
    }, []);
    const material = useMemo(() => new PointsMaterial({size: 2, sizeAttenuation: false, vertexColors: true, toneMapped: false}), []);
    useEffect(() => pointCloudStore.subscribe(value => {frame.current = value; dirty.current = true; invalidate();}), [invalidate]);
    useEffect(() => () => {geometry.dispose(); material.dispose();}, [geometry, material]);
    useFrame(() => {
        if (!dirty.current) return;
        const started = performance.now();
        const value = frame.current;
        if (value) {
            const positions = geometry.getAttribute('position') as BufferAttribute;
            const colors = geometry.getAttribute('color') as BufferAttribute;
            (positions.array as Float32Array).set(value.positions); (colors.array as Uint8Array).set(value.colors);
            positions.clearUpdateRanges(); colors.clearUpdateRanges();
            if (value.positions.length) {
                positions.addUpdateRange(0, value.positions.length); colors.addUpdateRange(0, value.colors.length);
                positions.needsUpdate = true; colors.needsUpdate = true;
            }
            geometry.setDrawRange(0, value.positions.length / 3);
            pointCloudRenderStats.uploads++;
        } else geometry.setDrawRange(0, 0);
        Object.assign(pointCloudRenderStats, {geometryId: geometry.uuid,
            positionAttributeId: (geometry.getAttribute('position') as BufferAttribute).id,
            colorAttributeId: (geometry.getAttribute('color') as BufferAttribute).id,
            visible: !!value?.positions.length, renderedFrameIndex: value?.frameIndex ?? -1,
            renderedSourceFrameIndex: value?.sourceFrameIndex ?? -1, renderedTimestamp: value?.timestamp ?? null});
        const elapsed = performance.now() - started;
        pointCloudRenderStats.uploadMs += elapsed;
        pointCloudRenderStats.maxUploadMs = Math.max(pointCloudRenderStats.maxUploadMs, elapsed);
        dirty.current = false;
    });
    return <group matrix={transform ?? undefined} matrixAutoUpdate={!transform}>
        <points geometry={geometry} material={material} frustumCulled={false}/>
    </group>;
}
