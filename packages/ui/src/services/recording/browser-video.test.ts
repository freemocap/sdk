import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserVideo} from './browser-video';

class Video extends EventTarget {
    currentTime = 0;
    src = '';
    preload = '';
    muted = false;
    error = null;
    buffered = {length: 0};
    callbacks = new Map<number, VideoFrameRequestCallback>();
    serial = 0;
    requestVideoFrameCallback(callback: VideoFrameRequestCallback) {const id = ++this.serial; this.callbacks.set(id, callback); return id;}
    cancelVideoFrameCallback(id: number) {this.callbacks.delete(id);}
    load() {if (this.src) queueMicrotask(() => this.dispatchEvent(new Event('loadeddata')));}
    pause() {}
    removeAttribute() {this.src = '';}
    present(time: number) {
        const pending = [...this.callbacks]; this.callbacks.clear();
        for (const [, callback] of pending) callback(0, {mediaTime: time} as VideoFrameCallbackMetadata);
    }
}

test('seek completion is not evidence of presentation; close cancels presentation callbacks', async () => {
    const element = new Video();
    const video = new BrowserVideo(element as unknown as HTMLVideoElement, 'http://example.test/clip.mp4', 2, error => {throw error;});
    await video.open(0);
    assert.equal(video.presentedTime, null);
    element.present(0);
    assert.equal(video.presentedTime, 0);
    const seeking = video.seek(0.8);
    assert.equal(video.presentedTime, null);
    element.dispatchEvent(new Event('seeked'));
    await seeking;
    assert.equal(video.presentedTime, null);
    element.present(0.8);
    assert.equal(video.presentedTime, 0.8);
    video.close();
    assert.equal(element.callbacks.size, 0);
    assert.equal(video.presentedTime, null);
});
