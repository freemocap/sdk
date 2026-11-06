import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialCloseup,clampCloseup,CLOSEUP_HEADER} from './target-closeup-layout';

test('larger close-ups stay inside their camera after movement, scaling, and parent resize',()=>{
    const original={width:302,height:495};
    const initial=initialCloseup(original);assert.ok(initial.size>230);
    let layout=clampCloseup({...initial,x:-400,y:1000,size:900},original);
    for(const surface of [original,{width:180,height:220},{width:600,height:800},{width:150,height:100}]) {
        layout=clampCloseup(layout,surface);
        assert.ok(layout.x>=0 && layout.y>=0);
        assert.ok(layout.x+layout.size<=surface.width);
        assert.ok(layout.y+layout.size+CLOSEUP_HEADER<=surface.height);
        assert.deepEqual(clampCloseup(layout,surface),layout);
    }
});

test('dragging cannot cover the always-visible image inclusion controls',()=>{
    const surface={width:300,height:500,topInset:44};
    const layout=clampCloseup({x:0,y:0,size:400},surface);
    assert.equal(layout.y,50);assert.ok(layout.y+layout.size+CLOSEUP_HEADER<=surface.height);
});
