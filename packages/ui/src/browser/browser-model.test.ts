import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectBrowserEntries,formatBytes,formatDuration,type BrowserEntry} from './browser-model';

const entries: BrowserEntry[] = [
    {id:'b',name:'Second',timestamp:200,path:'/root/two',cameraCount:2},
    {id:'a',name:'First',timestamp:100,subtitle:'Stereo capture',cameraCount:1},
    {id:'unknown',name:'2026-01-01_unverified'},
];
test('date sort uses supplied metadata, keeps unknown last, never mutates catalog',()=>{
    assert.deepEqual(selectBrowserEntries(entries,'','date','desc').map(x=>x.id),['b','a','unknown']);
    assert.deepEqual(selectBrowserEntries(entries,'','date','asc').map(x=>x.id),['a','b','unknown']);
    assert.deepEqual(entries.map(x=>x.id),['b','a','unknown']);
});
test('search covers actual name, subtitle and path and preserves entry identity',()=>{
    assert.deepEqual(selectBrowserEntries(entries,'STEREO','name','asc'),[entries[1]]);
    assert.deepEqual(selectBrowserEntries(entries,'/root/two','name','asc'),[entries[0]]);
    assert.deepEqual(selectBrowserEntries(entries,'not present','name','asc'),[]);
});
test('metadata formatting retains Core readable size and duration conventions',()=>{
    assert.equal(formatBytes(1024),'1 KB');
    assert.equal(formatBytes(0),'0 B');
    assert.equal(formatDuration(3661),'1h 1m 1s');
});
