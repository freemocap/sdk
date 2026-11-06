import {LogRecordSchema, type LogRecord} from '@freemocap/client';
import {IndexedLogPersistence,type LogPersistence,type SavedLogs} from './log-persistence';
export {LogRecordSchema, type LogRecord} from '@freemocap/client';
const MAX_ENTRIES=10_000;
const SAVE_DELAY_MS=500;
const RETRY_DELAY_MS=60_000;
const MAX_JOURNAL_CHARS=250_000;
type PendingRecord={revision:number;record:LogRecord};
type Journal={sessionId:string;revision:number;resetAt:number;pending:PendingRecord[]};
export type LogSnapshot={entries:LogRecord[];hasErrors:boolean;countsByLevel:Record<string,number>;version:number};

/** Application-owned bounded history; panel visibility never changes its lifetime. */
export class LogStore {
    private entries:LogRecord[]=[];
    private countsByLevel:Record<string,number>={};
    private hasErrors=false;
    private version=0;
    private lastSnapshotVersion=-1;
    private cachedEntries:LogRecord[]=[];
    private cachedCountsByLevel:Record<string,number>={};
    private recordIds=new Set<string>();
    private serializedRecords=new WeakMap<LogRecord,string>();
    private sessionId:string|null=null;
    private revision=0;
    private resetAt=0;
    private pending:PendingRecord[]=[];
    private dirty=false;
    private started=false;
    private timer:ReturnType<typeof setTimeout>|null=null;
    private inFlight:Promise<void>|null=null;
    private initialization:Promise<void>|null=null;
    private epoch=0;
    private retryAfter=0;
    private journalFailed=false;
    private readFailed=false;
    persistenceError:string|null=null;
    private readonly storageKey:string|null;
    private readonly persistence:LogPersistence;
    constructor({storageKey=null,persistence=new IndexedLogPersistence()}:{storageKey?:string|null;persistence?:LogPersistence}={}) {
        this.storageKey=storageKey;this.persistence=persistence;
    }
    /** Await the backend lifetime handshake before subscribing/connecting the log stream. */
    beginSession(sessionId:string):Promise<void> {
        if(!sessionId.trim())throw new Error('Log session identity must not be empty');
        if(this.sessionId===sessionId)return this.initialization??Promise.resolve();
        this.sessionId=sessionId;const epoch=++this.epoch;
        this.resetMemory();this.revision=0;this.resetAt=0;this.pending=[];this.dirty=false;
        this.retryAfter=0;this.journalFailed=false;this.readFailed=false;
        this.initialization=this.restore(sessionId,epoch);
        return this.initialization;
    }
    private async restore(sessionId:string,epoch:number):Promise<void> {
        if(!this.storageKey)return;
        await this.inFlight;
        let saved:SavedLogs|null=null;
        try{saved=await this.persistence.read(this.storageKey);}catch(error){if(epoch===this.epoch){this.readFailed=true;this.fail(new Error('Log history could not be read; reload to retry: '+String(error)));}}
        if(epoch!==this.epoch)return;
        let local:any=null;
        try{local=JSON.parse(localStorage.getItem(this.storageKey)??'null');}catch{/* Storage unavailable/corrupted. */}
        // Migrate the former full localStorage snapshot once, only for this session.
        if(!saved&&local?.sessionId===sessionId&&Array.isArray(local.entries))saved={sessionId,revision:0,entries:local.entries};
        if(saved?.sessionId===sessionId&&Array.isArray(saved.entries)) {
            this.revision=Number.isSafeInteger(saved.revision)?saved.revision:0;
            for(const raw of saved.entries.slice(-MAX_ENTRIES)){const parsed=LogRecordSchema.safeParse(raw);if(parsed.success)this.append(parsed.data);}
        }
        if(local?.sessionId===sessionId&&Array.isArray(local.pending)) {
            if(Number.isSafeInteger(local.resetAt)&&local.resetAt>this.revision){this.resetMemory();this.revision=local.resetAt;}
            for(const item of local.pending){
                if(!Number.isSafeInteger(item.revision)||item.revision<=this.revision)continue;
                const parsed=LogRecordSchema.safeParse(item.record);if(parsed.success){this.append(parsed.data);this.revision=item.revision;}
            }
        }
        this.dirty=true;
        // Replace previous-session storage even if this backend has not emitted yet.
        await this.flush(true);
    }
    start():void{this.started=true;this.schedule();}
    dispose():Promise<void>{this.started=false;if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}return this.persistNow();}
    private resetMemory():void {
        this.entries=[];this.recordIds.clear();this.countsByLevel={};this.hasErrors=false;this.version++;
    }
    private append(record:LogRecord):boolean {
        if(record.log_id&&this.recordIds.has(record.log_id))return false;
        if(record.log_id)this.recordIds.add(record.log_id);
        this.entries.push(record);this.version++;
        if(this.storageKey)this.serializedRecords.set(record,JSON.stringify(record));
        this.countsByLevel[record.levelname]=(this.countsByLevel[record.levelname]??0)+1;
        if(this.entries.length>MAX_ENTRIES){
            const removed=this.entries.splice(0,this.entries.length-MAX_ENTRIES);
            for(const item of removed){if(item.log_id)this.recordIds.delete(item.log_id);if(--this.countsByLevel[item.levelname]<=0)delete this.countsByLevel[item.levelname];}
        }
        this.hasErrors=(this.countsByLevel.ERROR??0)>0||(this.countsByLevel.CRITICAL??0)>0;
        return true;
    }
    add(record:LogRecord):void {
        if(!this.append(record))return;
        this.revision++;this.pending.push({revision:this.revision,record});
        if(this.pending.length>MAX_ENTRIES)this.pending.splice(0,this.pending.length-MAX_ENTRIES);
        this.dirty=true;this.schedule();
    }
    getSnapshot():LogSnapshot {
        if(this.lastSnapshotVersion!==this.version){this.cachedEntries=this.entries.slice();this.cachedCountsByLevel={...this.countsByLevel};this.lastSnapshotVersion=this.version;}
        return {entries:this.cachedEntries,countsByLevel:this.cachedCountsByLevel,hasErrors:this.hasErrors,version:this.version};
    }
    clear():void {
        this.resetMemory();this.pending=[];this.resetAt=++this.revision;this.dirty=true;
        void this.persistNow();
    }
    /** The small pending journal is synchronous for beforeunload; await for a durable full flush. */
    persistNow():Promise<void>{this.writeJournal();return this.flush(true);}
    private schedule():void {
        if(!this.started||!this.storageKey||!this.sessionId||!this.dirty||this.timer!==null||this.inFlight)return;
        this.timer=setTimeout(()=>{this.timer=null;void this.flush(false);},Math.max(SAVE_DELAY_MS,this.retryAfter-Date.now()));
    }
    private fail(error:unknown):void {
        this.persistenceError=error instanceof Error?error.message:String(error);this.retryAfter=Date.now()+RETRY_DELAY_MS;
    }
    private writeJournal():void {
        if(!this.storageKey||!this.sessionId||!this.dirty||this.journalFailed)return;
        try {
            let size=0;const rows:string[]=[];
            for(const item of this.pending){
                const raw=this.serializedRecords.get(item.record)!;size+=raw.length+64;
                if(size>MAX_JOURNAL_CHARS)throw new Error('Log reload journal is full; awaiting database flush');
                rows.push(`{"revision":${item.revision},"record":${raw}}`);
            }
            localStorage.setItem(this.storageKey,`{"sessionId":${JSON.stringify(this.sessionId)},"revision":${this.revision},"resetAt":${this.resetAt},"pending":[${rows.join(',')}]}`);
        } catch(error){this.journalFailed=true;this.fail(error);}
    }
    private flush(force:boolean):Promise<void> {
        // Never overwrite unknown saved history after a failed read.
        if(this.readFailed)return Promise.resolve();
        if(this.inFlight)return this.inFlight.then(()=>this.dirty&&!this.persistenceError?this.flush(force):undefined);
        if(!this.storageKey||!this.sessionId||!this.dirty||(!force&&Date.now()<this.retryAfter)){this.schedule();return Promise.resolve();}
        const epoch=this.epoch;const revision=this.revision;
        const value:SavedLogs={sessionId:this.sessionId,revision,entries:this.entries.slice()};
        const key=this.storageKey;
        this.inFlight=this.persistence.write(key,value).then(()=>{
            if(epoch!==this.epoch)return;
            this.pending=this.pending.filter(item=>item.revision>revision);
            this.dirty=this.revision!==revision;
            this.persistenceError=null;this.retryAfter=0;this.journalFailed=false;
            try {
                const journal=JSON.parse(localStorage.getItem(key)??'null') as Journal|null;
                if(journal?.sessionId!==value.sessionId||journal.revision<=revision)localStorage.removeItem(key);
                // Successful migration also frees the old oversized synchronous snapshot.
                else if(journal?.sessionId===value.sessionId&&'entries' in journal)localStorage.removeItem(key);
            }catch{/* Database history is already durable. */}
        }).catch(error=>this.fail(error)).finally(()=>{this.inFlight=null;this.schedule();});
        return this.inFlight;
    }
}
