/** Avoid rounded encoder PTS boundaries selecting the preceding frame. Zero is exact. */
export function videoFrameSeekTime(frame: number, fps: number): number {
    return frame === 0 ? 0 : (frame + 0.5) / fps;
}

/** Seeked acknowledges decoding, not display; resume only after every video presents the target. */
export async function waitForSharedPresentation(
    times: () => readonly (number | null)[], target: number, fps: number, isCurrent: () => boolean,
    nextFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
    now: () => number = () => performance.now(),
): Promise<boolean> {
    const started = now();
    while (isCurrent()) {
        const values = times();
        if (values.length && values.every(time => time !== null && Math.round(time * fps) === target)) return true;
        if (now() - started > 30000) throw new Error('Videos did not present the requested frame');
        await new Promise<void>(resolve => {nextFrame(() => resolve());});
    }
    return false;
}
