import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildLayout, tilingFromColumns} from './gridTiling';

test('subdivided rows preserve tiling bounds and allow smaller camera heights', () => {
    const tiling = tilingFromColumns(4, 2);
    const layout = buildLayout(['left', 'right', 'third', 'fourth'], tiling, 12, 12);
    assert.deepEqual(layout.map(({x,y,w,h})=>[x,y,w,h]), [[0,0,6,12],[6,0,6,12],[0,12,6,12],[6,12,6,12]]);
    assert.ok(layout.every(item=>item.minH!<item.h && item.y+item.h<=24));
    // At 600px and 2px margins, the subdivided tiles still fill two equal rows.
    const rowHeight=(600-23*2)/24;
    assert.equal(layout[0].h*rowHeight+(layout[0].h-1)*2,299);
});
