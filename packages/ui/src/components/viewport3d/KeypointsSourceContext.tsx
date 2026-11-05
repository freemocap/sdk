import React, {createContext, useContext, useEffect, useRef, useState} from "react";

import type { PointsFrame, ResolvedModelFrame } from '@freemocap/client';
import type { ModelDefinition } from '@freemocap/client';

/** Explicit scene-data source shared by the playback provider and viewport worker. */

/** Packed XYZ presentation, produced at the viewport transfer boundary. */
export interface PackedKeypointsFrame {
    pointNames: readonly string[];
    interleaved: Float32Array;
    sampleStatus?: Uint8Array;
    statusGroups?: readonly {startIndex: number; count: number; labels: readonly string[]}[];
}

/** Borrowed channel arrays retain all components until presentation needs XYZ. */
export interface SourceKeypointsFrame {
    pointNames: readonly string[];
    pointSources: readonly PointsFrame[];
}

export type KeypointsFrame = PackedKeypointsFrame | SourceKeypointsFrame;

export type KeypointsCallback = (frame: KeypointsFrame) => void;
export type ModelFramesCallback = (models: ResolvedModelFrame[]) => void;
export type ModelsCallback = (models: ModelDefinition[]) => void;

/**
 * A source of scene data.
 *
 * `keypoints` are triangulated predictions, possibly smoothed or gap-recovered.
 * `modelFrames` are the RECONSTRUCTIONS: one entry per tracked thing this frame, each
 * carrying its own model definition alongside its own origins / landmarks / rotations /
 * lengths / derived points. A tracked person and a tracked charuco board are two entries,
 * so every renderer iterates rather than reading "the" skeleton — which is the whole
 * reason these five channels travel together instead of separately.
 */
export interface KeypointsSource {
    isLive: boolean;
    subscribeToKeypoints: (cb: KeypointsCallback) => () => void;
    getLatestKeypoints: () => KeypointsFrame | null;
    /** The STATIC model definitions — segments, landmarks, connections, groups. Emitted only
     *  when the model set actually changes, never per frame: they are large, and cloning
     *  them to the viewport worker every frame is what turns 30fps into single digits. */
    subscribeToModels: (cb: ModelsCallback) => () => void;
    getModels: () => ModelDefinition[] | null;
    /** The per-frame numbers, one entry per tracked model. Join to a definition by `modelId`. */
    subscribeToModelFrames: (cb: ModelFramesCallback) => () => void;
    getLatestModelFrames: () => ResolvedModelFrame[] | null;
}

/** Index the current model definitions by id, for the per-frame join.
 *
 *  Kept in a ref and rebuilt only on a model change, so the hot path is a Map lookup rather
 *  than anything that allocates. */
export function useModelDefinitionsById(): React.RefObject<Map<string, ModelDefinition>> {
    const source = useKeypointsSource();
    const byId = useRef<Map<string, ModelDefinition>>(new Map());
    const [, setRevision] = useState(0);

    useEffect(() => {
        const apply = (models: ModelDefinition[]): void => {
            byId.current = new Map(models.map((m) => [m.model_id, m]));
            setRevision((r) => r + 1);
        };
        const existing = source.getModels();
        if (existing) apply(existing);
        return source.subscribeToModels(apply);
    }, [source]);

    return byId;
}

const KeypointsSourceContext = createContext<KeypointsSource | null>(null);

export const KeypointsSourceProvider: React.FC<{
    source: KeypointsSource;
    children: React.ReactNode;
}> = ({source, children}) => (
    <KeypointsSourceContext.Provider value={source}>
        {children}
    </KeypointsSourceContext.Provider>
);

/**
 * Returns true when a KeypointsSourceProvider is mounted above the consumer
 * (i.e. during playback mode), false when keypoints come from the live server.
 */
export function useHasKeypointsSourceProvider(): boolean {
    return useContext(KeypointsSourceContext) !== null;
}

/**
 * Returns the explicitly provided keypoints source; an absent provider is an error.

 */
export function useKeypointsSource(): KeypointsSource {
    const source = useContext(KeypointsSourceContext);
    if (!source) throw new Error("Mount KeypointsSourceProvider before rendering a viewport");
    return source;
}
