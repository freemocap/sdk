import {test} from 'node:test';
import assert from 'node:assert/strict';
import {videoFrameSeekTime, waitForSharedPresentation} from './presentation-barrier';

test('seek selects the requested frame despite microsecond-rounded encoder timestamps', () => {
    const fps = 30;
    const pts = Array.from({length: 751}, (_, index) => Math.round(index / fps * 1e6) / 1e6);
    const displayed = (time: number) => pts.findLastIndex(value => value <= time);
    assert.equal(displayed(749 / fps), 748); // observed native failure
    for (const index of [0, 1, 375, 749, 750]) assert.equal(displayed(videoFrameSeekTime(index, fps)), index);
    assert.ok(videoFrameSeekTime(750, fps) < 751 / fps);
});

test('replay waits for both presented zero frames after seeked, including repeated loops', async () => {
    for (let loop = 0; loop < 3; loop++) {
        let times: (number | null)[] = [1, 1], resumed = false;
        let tick: FrameRequestCallback = () => {};
        const result = waitForSharedPresentation(() => times, 0, 30, () => true, callback => {tick = callback; return 1;})
            .then(ready => {resumed = ready;});
        await Promise.resolve(); assert.equal(resumed, false);
        times = [0, null]; tick(1); await Promise.resolve(); assert.equal(resumed, false);
        times = [0, 0]; tick(2); await result; assert.equal(resumed, true);
    }
});
test('a superseding seek cancels the old resume even if its requested frame never arrives', async () => {
    let current = true, tick: FrameRequestCallback = () => {};
    const result = waitForSharedPresentation(() => [null, null], 0, 30, () => current, callback => {tick = callback; return 1;});
    current = false; tick(0); assert.equal(await result, false);
});
test('stalled presentation fails instead of resuming with a fabricated frame', async () => {
    let time = 0;
    await assert.rejects(waitForSharedPresentation(() => [null], 0, 30, () => true,
        callback => {time = 30001; callback(time); return 1;}, () => time), /did not present/);
});
