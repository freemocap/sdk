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

class MemoryPersistence {
    data=new Map<string,any>();writes=0;fail=false;
    async read(key:string){return structuredClone(this.data.get(key)??null);}
    async write(key:string,value:any){this.writes++;if(this.fail)throw new Error('database quota');this.data.set(key,structuredClone(value));}
}
async function withStorage(run:(data:Map<string,string>)=>Promise<void>) {
    const data=new Map<string,string>();
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
        getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k),
    }});
    try{await run(data);}finally{delete (globalThis as any).localStorage;}
}
test('full bounded history survives database reload without using localStorage for the snapshot',()=>withStorage(async data=>{
    const persistence=new MemoryPersistence();const store=new LogStore({storageKey:'one',persistence});
    await store.beginSession('backend-one');
    for(let n=0;n<10005;n++)store.add(record(n));
    await store.persistNow();
    assert.equal(persistence.data.get('one').entries.length,10000);
    assert.equal(data.has('one'),false);
    const restored=new LogStore({storageKey:'one',persistence});
    assert.equal(restored.getSnapshot().entries.length,0);
    await restored.beginSession('backend-one');
    assert.deepEqual(restored.getSnapshot().entries,store.getSnapshot().entries);
    const snapshot=restored.getSnapshot().entries;restored.add(record(10004));await restored.beginSession('backend-one');
    assert.equal(restored.getSnapshot().entries,snapshot);
    await restored.beginSession('backend-two');
    assert.equal(restored.getSnapshot().entries.length,0);
    assert.equal(persistence.data.get('one').sessionId,'backend-two');
}));
test('unload journal recovers pending entries and clear before database commit',()=>withStorage(async data=>{
    const persistence=new MemoryPersistence();const store=new LogStore({storageKey:'one',persistence});
    await store.beginSession('backend-one');store.add(record(1));await store.persistNow();
    persistence.fail=true;store.add(record(2));await store.persistNow();
    assert.equal(JSON.parse(data.get('one')!).pending.length,1);
    persistence.fail=false;
    const restored=new LogStore({storageKey:'one',persistence});await restored.beginSession('backend-one');
    assert.deepEqual(restored.getSnapshot().entries.map(r=>r.log_id),['session:1','session:2']);
    persistence.fail=true;restored.clear();await restored.persistNow();
    persistence.fail=false;
    const cleared=new LogStore({storageKey:'one',persistence});await cleared.beginSession('backend-one');
    assert.equal(cleared.getSnapshot().entries.length,0);
}));
test('quota-denied journal does not truncate database history or retry synchronous failures',()=>withStorage(async()=>{
    const persistence=new MemoryPersistence();const store=new LogStore({storageKey:'one',persistence});await store.beginSession('s');
    let writes=0;localStorage.setItem=()=>{writes++;throw new Error('local quota');};
    persistence.fail=true;store.add(record(1));await store.persistNow();await store.persistNow();
    assert.equal(writes,1);assert.equal(store.persistenceError,'database quota');
    persistence.fail=false;await store.persistNow();assert.equal(store.persistenceError,null);
    assert.equal(persistence.data.get('one').entries.length,1);
}));
test('legacy local snapshot migrates only for the matching session',()=>withStorage(async data=>{
    data.set('one',JSON.stringify({sessionId:'s',entries:[record(1)]}));
    const persistence=new MemoryPersistence();const store=new LogStore({storageKey:'one',persistence});await store.beginSession('s');
    assert.equal(store.getSnapshot().entries.length,1);assert.equal(data.has('one'),false);
    assert.throws(()=>store.beginSession(' '),/identity/);
}));

test('a failed database read never overwrites unknown saved history',()=>withStorage(async()=>{
    const persistence=new MemoryPersistence();await persistence.write('one',{sessionId:'s',revision:1,entries:[record(1)]});
    persistence.read=async()=>{throw new Error('read unavailable');};
    const store=new LogStore({storageKey:'one',persistence});await store.beginSession('s');store.add(record(2));await store.persistNow();
    assert.match(store.persistenceError!,/could not be read/);
    assert.equal(persistence.data.get('one').entries[0].log_id,'session:1');
}));
