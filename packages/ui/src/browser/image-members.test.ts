import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ImageCatalog,type ImageCatalogItem} from './ImageCatalog';

test('dataset browser renders authoritative members with removal actions and no separate selection state',()=>{
    const items:ImageCatalogItem[]=[
        {id:'left',groupId:'frame90',groupLabel:'Frame 90',camera:'Left',label:'Left camera',thumbnailUrl:'/left.png',included:true,sourceFrameNumber:90},
        {id:'right',groupId:'frame90',groupLabel:'Frame 90',camera:'Right',label:'Right camera',thumbnailUrl:'/right.png',included:false,sourceFrameNumber:90},
    ];
    const before=structuredClone(items);
    // The application supplies the authoritative dataset membership, not a candidate list.
    const members=items.slice(0,1).map(({included,...item})=>item);
    const html=renderToStaticMarkup(createElement(ImageCatalog,{mode:'members',items:members,onNavigate:()=>{},onRemove:()=>{}}));
    assert.match(html,/data-image-id="left"/);
    assert.doesNotMatch(html,/data-image-id="right"/);
    assert.match(html,/Remove Left camera from training set/);
    assert.match(html,/Frame 90/);
    assert.doesNotMatch(html,/Image inclusion filter|Include all|aria-pressed|Included frames/);
    assert.deepEqual(items,before);
    const removed=renderToStaticMarkup(createElement(ImageCatalog,{mode:'members',items:[],onNavigate:()=>{},onRemove:()=>{}}));
    assert.doesNotMatch(removed,/data-image-id=/);
    assert.match(removed,/No images in the training set/);
    const candidates=renderToStaticMarkup(createElement(ImageCatalog,{items,onNavigate:()=>{},onToggle:()=>{}}));
    assert.match(candidates,/data-image-id="right"/);
    assert.match(candidates,/Image inclusion filter/);
});
