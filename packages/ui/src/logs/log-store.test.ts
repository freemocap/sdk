import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LogStore, LogRecordSchema} from './log-store';

const record = (id: number, level = 'INFO') => LogRecordSchema.parse({
    log_id: `session:${id}`, name:'test', msg:'message', args:[], levelname:level, levelno:20,
    pathname:'test.py',filename:'test.py',module:'test',lineno:1,funcName:'operation',created:id,
    msecs:0,relativeCreated:0,thread:1,threadName:'main',processName:'app',process:1,
    delta_t:'0',message:`message ${id}`,asctime:'now',formatted_message:'',type:'log_record',source:'server',
});

test('reconnect history deduplicates while snapshot arrays stay stable', () => {
    const store = new LogStore();
    store.add(record(1));
    const first = store.getSnapshot();
    store.add(record(1));
    assert.equal(store.getSnapshot().entries, first.entries);
    store.add(record(2, 'ERROR'));
    assert.equal(store.getSnapshot().hasErrors, true);
    assert.equal(store.getSnapshot().entries.length, 2);
});

test('bounded buffer keeps counts accurate and clear resets history', () => {
    const store = new LogStore();
    store.add(record(0, 'ERROR'));
    for (let n=1; n<=10_000; n++) store.add(record(n));
    assert.equal(store.getSnapshot().entries.length, 10_000);
    assert.equal(store.getSnapshot().hasErrors, false);
    assert.equal(store.getSnapshot().countsByLevel.INFO, 10_000);
    store.clear(); store.add(record(10_000));
    assert.equal(store.getSnapshot().entries.length, 1);
});

function withStorage(run: (data: Map<string,string>) => void) {
    const data = new Map<string,string>();
    Object.defineProperty(globalThis, 'localStorage', {configurable:true,value:{
        getItem:(k:string)=>data.get(k)??null, setItem:(k:string,v:string)=>data.set(k,v), removeItem:(k:string)=>data.delete(k),
    }});
    try {run(data);} finally {delete (globalThis as any).localStorage;}
}

test('reload retains the full bounded session history and deduplicates server replay', () => withStorage(data => {
    const store = new LogStore({storageKey:'one'});
    store.beginSession('backend-one');
    for (let n=0;n<10_005;n++) store.add(record(n));
    // The application calls persistNow on beforeunload, not panel close.
    store.persistNow();
    assert.equal(JSON.parse(data.get('one')!).entries.length,10_000);
    const restored = new LogStore({storageKey:'one'});
    assert.equal(restored.getSnapshot().entries.length,0,'no old-session flash before handshake');
    restored.beginSession('backend-one');
    assert.deepEqual(restored.getSnapshot().entries,store.getSnapshot().entries);
    restored.add(record(10_004));
    assert.equal(restored.getSnapshot().entries.length,10_000);
    const sameSnapshot=restored.getSnapshot().entries;
    restored.beginSession('backend-one');
    assert.equal(restored.getSnapshot().entries,sameSnapshot,'same-session reconnect does not clear');
    const other = new LogStore({storageKey:'two'});other.beginSession('backend-one');
    assert.equal(other.getSnapshot().entries.length,0);
}));

test('panel visibility has no store lifecycle and a new backend starts clean', () => withStorage(data => {
    const store = new LogStore({storageKey:'one'});store.beginSession('backend-one');
    store.add(record(1));
    const visible = store.getSnapshot();
    // While there is no consumer polling (panel hidden), collection continues.
    store.add(record(2,'ERROR'));
    assert.equal(visible.entries.length,1);
    assert.equal(store.getSnapshot().entries.length,2);
    store.dispose();
    const reopened = new LogStore({storageKey:'one'});reopened.beginSession('backend-two');
    assert.deepEqual(reopened.getSnapshot().entries,[]);
    assert.deepEqual(reopened.getSnapshot().countsByLevel,{});
    assert.equal(reopened.getSnapshot().hasErrors,false);
    reopened.add({...record(3),log_id:'backend-two:1'});reopened.persistNow();
    assert.deepEqual(JSON.parse(data.get('one')!).entries.map((r:any)=>r.log_id),['backend-two:1']);
}));

test('obsolete or corrupted storage is discarded and persistence failures are observable', () => withStorage(data => {
    data.set('one',JSON.stringify([record(1)]));
    const store=new LogStore({storageKey:'one'});store.beginSession('new');
    assert.equal(store.getSnapshot().entries.length,0);
    assert.throws(()=>store.beginSession(' '),/identity/);
    store.add(record(2));
    const setItem=localStorage.setItem;
    localStorage.setItem=()=>{throw new Error('quota exceeded');};
    store.persistNow();
    assert.equal(store.persistenceError,'quota exceeded');
    assert.equal(store.getSnapshot().entries.length,1);
    localStorage.setItem=setItem;store.persistNow();
    assert.equal(store.persistenceError,null);
    store.clear();store.add(record(2));
    assert.equal(store.getSnapshot().entries.length,1,'clear also resets deduplication');
}));
