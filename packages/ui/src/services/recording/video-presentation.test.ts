import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VideoPresentation,clampCrop} from './video-presentation';

class Bitmap {
    width = 2; height = 2; closed = false;
    constructor(readonly pixels: number) {}
    close() {assert.equal(this.closed, false); this.closed = true;}
}
class Canvas {
    width = 2; height = 2; dataset: Record<string, string> = {}; pixels = -1;
    getContext() {return {drawImage: (image: {pixels: number; closed?: boolean}) => {assert.notEqual(image.closed, true); this.pixels = image.pixels;}, clearRect: () => {this.pixels = -1;}};}
    transferToImageBitmap() {return new Bitmap(this.pixels);}
}
const capture = (group: VideoPresentation, id: string, index: number) => group.capture(id, {videoWidth: 2, videoHeight: 2, pixels: index} as unknown as HTMLVideoElement, index / 30);

test('out-of-order decoded images commit matching pixels together; reset never bridges seek epochs', () => {
    const original = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = Canvas as unknown as typeof OffscreenCanvas;
    try {
        const left = new Canvas(), right = new Canvas();
        const group = new VideoPresentation(new Map([['left', left], ['right', right]]) as unknown as Map<string, HTMLCanvasElement>, 30);
        capture(group, 'left', 0); capture(group, 'left', 1);
        assert.equal(group.commit(), false); assert.equal(left.pixels, -1);
        capture(group, 'right', 0); assert.equal(group.commit(), true);
        assert.deepEqual([left.pixels, right.pixels, group.index], [0, 0, 0]);
        capture(group, 'right', 1); capture(group, 'right', 2); assert.equal(group.commit(), true);
        assert.deepEqual([left.pixels, right.pixels, group.index], [1, 1, 1]);
        assert.equal(left.dataset.presentationEpoch, right.dataset.presentationEpoch);
        const epoch = left.dataset.presentationEpoch;
        group.reset(); capture(group, 'left', 2); assert.equal(group.commit(), false);
        assert.deepEqual([left.pixels, right.pixels, group.index], [-1, -1, null]);
        capture(group, 'right', 2); assert.equal(group.commit(2), true);
        assert.notEqual(left.dataset.presentationEpoch, epoch);
        assert.deepEqual([left.pixels, right.pixels], [2, 2]);
        group.close(); capture(group, 'right', 3); assert.equal(group.commit(), false);
    } finally {globalThis.OffscreenCanvas = original;}
});

test('bounded decoded ownership drops old unmatched images and keeps displayed pair intact', () => {
    const original = globalThis.OffscreenCanvas;
    const snapshots: Bitmap[] = [];
    class TrackedCanvas extends Canvas {override transferToImageBitmap() {const image = super.transferToImageBitmap(); snapshots.push(image); return image;}}
    globalThis.OffscreenCanvas = TrackedCanvas as unknown as typeof OffscreenCanvas;
    try {
        const left = new Canvas(), right = new Canvas();
        const group = new VideoPresentation(new Map([['left', left], ['right', right]]) as unknown as Map<string, HTMLCanvasElement>, 30, 4);
        for (let index = 0; index < 20; index++) capture(group, 'left', index);
        assert.equal(snapshots.filter(image => !image.closed).length, 4);
        capture(group, 'right', 18); assert.equal(group.commit(), true);
        assert.deepEqual([left.pixels, right.pixels], [18, 18]);
        assert.equal(group.commit(), false); assert.deepEqual([left.pixels, right.pixels], [18, 18]);
        group.close(); assert.equal(snapshots.filter(image => !image.closed).length, 0);
    } finally {globalThis.OffscreenCanvas = original;}
});


test('crop bounds reject invalid/outside geometry and clamp only visible intersections',()=>{
    assert.deepEqual(clampCrop({x:-2,y:1,width:6,height:5},8,4),{x:0,y:1,width:4,height:3});
    for(const bounds of [null,{x:9,y:0,width:2,height:2},{x:0,y:0,width:0,height:2},{x:NaN,y:0,width:2,height:2}])assert.equal(clampCrop(bounds,8,4),null);
});

test('close-ups use the same committed bitmap/frame and clear across seek, missing bounds, and source close',()=>{
    const original=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=Canvas as unknown as typeof OffscreenCanvas;
    try {
        const left=new Canvas(),right=new Canvas(),leftCrop=new Canvas(),rightCrop=new Canvas();
        let available=true;
        const requests:Array<[string,number,string]>=[];
        const group=new VideoPresentation(new Map([['left',left],['right',right]]) as unknown as Map<string,HTMLCanvasElement>,30,4,{
            canvases:new Map([['left',leftCrop],['right',rightCrop]]) as unknown as Map<string,HTMLCanvasElement>,
            bounds:(id,index,_w,_h,epoch)=>{requests.push([id,index,epoch]);return available?{x:0,y:0,width:1,height:1}:null;},
        });
        capture(group,'left',30);assert.equal(group.commit(),false);assert.equal(leftCrop.pixels,-1);
        capture(group,'right',30);assert.equal(group.commit(),true);
        assert.deepEqual([left.pixels,right.pixels,leftCrop.pixels,rightCrop.pixels],[30,30,30,30]);
        assert.equal(left.dataset.presentedFrame,leftCrop.dataset.presentedFrame);
        assert.equal(left.dataset.presentationEpoch,rightCrop.dataset.presentationEpoch);
        assert.deepEqual(requests.map(x=>x.slice(0,2)),[['left',30],['right',30]]);
        available=false;group.refreshCrops();assert.equal(leftCrop.pixels,-1);assert.equal(rightCrop.dataset.cropStatus,'unavailable');
        available=true;group.refreshCrops();assert.equal(leftCrop.pixels,30);
        const epoch=leftCrop.dataset.presentationEpoch;group.reset();assert.equal(leftCrop.pixels,-1);assert.equal(leftCrop.dataset.presentedFrame,undefined);
        capture(group,'left',0);capture(group,'right',0);group.commit(0);
        assert.equal(rightCrop.pixels,0);assert.notEqual(rightCrop.dataset.presentationEpoch,epoch);
        group.close();assert.equal(rightCrop.pixels,-1);
    } finally {globalThis.OffscreenCanvas=original;}
});
