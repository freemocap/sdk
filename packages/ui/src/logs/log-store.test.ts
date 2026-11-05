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

test('application storage keys isolate persisted bounded tails', () => {
    const data = new Map<string,string>();
    Object.defineProperty(globalThis, 'localStorage', {configurable:true,value:{
        getItem:(k:string)=>data.get(k)??null, setItem:(k:string,v:string)=>data.set(k,v), removeItem:(k:string)=>data.delete(k),
    }});
    const store = new LogStore({storageKey:'one'});
    for (let n=0;n<400;n++) store.add(record(n));
    store.dispose();
    assert.equal(JSON.parse(data.get('one')!).length,300);
    const restored = new LogStore({storageKey:'one'});
    assert.equal(restored.getSnapshot().entries.length,301);
    restored.add(record(399));
    assert.equal(restored.getSnapshot().entries.length,301);
    assert.equal(new LogStore({storageKey:'two'}).getSnapshot().entries.length,0);
    delete (globalThis as any).localStorage;
});
