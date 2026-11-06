import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialCloseup,clampCloseup,resizeCloseup,type CloseupEdge} from './target-closeup-layout';

test('larger close-ups stay inside their camera after movement, scaling, and parent resize',()=>{
    const original={width:302,height:495};
    const initial=initialCloseup(original);assert.ok(initial.size>220);
    let layout=clampCloseup({...initial,x:-400,y:1000,size:900},original);
    for(const surface of [original,{width:180,height:220},{width:600,height:800},{width:150,height:100}]) {
        layout=clampCloseup(layout,surface);
        assert.ok(layout.x>=0 && layout.y>=0);
        assert.ok(layout.x+layout.size<=surface.width);
        assert.ok(layout.y+layout.size<=surface.height);
        assert.deepEqual(clampCloseup(layout,surface),layout);
    }
});

test('dragging cannot cover the always-visible image inclusion controls',()=>{
    const surface={width:300,height:500,topInset:44};
    const layout=clampCloseup({x:0,y:0,size:400},surface);
    assert.equal(layout.y,50);assert.ok(layout.y+layout.size<=surface.height);
});

test('all eight resize directions preserve square geometry and stay inside the camera',()=>{
    const surface={width:700,height:600,topInset:44},old={x:200,y:180,size:180};
    for(const edge of ['n','ne','e','se','s','sw','w','nw'] as CloseupEdge[]) {
        const next=resizeCloseup(old,edge,edge.includes('w')?-35:35,edge.includes('n')?-35:35,surface);
        assert.ok(next.size>old.size,edge);assert.ok(next.x>=6&&next.y>=50);
        assert.ok(next.x+next.size<=694&&next.y+next.size<=594);
        const extreme=resizeCloseup(old,edge,-9000,9000,surface);
        assert.ok(extreme.x>=6&&extreme.y>=50);assert.ok(extreme.x+extreme.size<=694&&extreme.y+extreme.size<=594);
    }
});

test('tight nonsquare crops remain bottom-aligned by default and resize without losing their aspect',()=>{
    for(const aspect of [.6,1.4,2.1]) {
        const surface={width:330,height:700,topInset:44,aspect};
        const initial=initialCloseup(surface);
        assert.ok(initial.size/aspect<=surface.height*.45);
        assert.ok(initial.y>=surface.height*.5);
        assert.ok(Math.abs(initial.y+initial.size/aspect-(surface.height-8))<.001);
        for(const edge of ['n','ne','e','se','s','sw','w','nw'] as CloseupEdge[]) {
            const next=resizeCloseup(initial,edge,-22,-18,surface);
            assert.ok(next.x>=6&&next.y>=50);
            assert.ok(next.x+next.size<=surface.width-6+.001);
            assert.ok(next.y+next.size/aspect<=surface.height-6+.001);
        }
    }
});

test('short camera panes never let the minimum crop size cover the upper full-image region',()=>{
    for(const aspect of [.6,1,1.4]) {
        const surface={width:300,height:200,topInset:44,aspect};
        const value=initialCloseup(surface);
        assert.ok(value.size/aspect<=90+.001);
        assert.ok(value.y>=100);
        assert.deepEqual(clampCloseup(value,surface),value);
    }
});
