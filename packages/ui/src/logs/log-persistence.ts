import type {LogRecord} from '@freemocap/client';

export interface SavedLogs {sessionId:string;revision:number;entries:LogRecord[]}
export interface LogPersistence {
    read(key:string):Promise<SavedLogs|null>;
    write(key:string,value:SavedLogs):Promise<void>;
}

/** One bounded snapshot per application, outside the small synchronous Web Storage quota. */
export class IndexedLogPersistence implements LogPersistence {
    private database:Promise<IDBDatabase>|null=null;
    private open():Promise<IDBDatabase> {
        if(!this.database)this.database=new Promise<IDBDatabase>((resolve,reject)=>{
            const request=indexedDB.open('freemocap-session-logs',1);
            request.onupgradeneeded=()=>request.result.createObjectStore('sessions');
            request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.database=null;};resolve(db);};
            request.onerror=()=>reject(request.error??new Error('Log database unavailable'));
            request.onblocked=()=>reject(new Error('Log database upgrade blocked'));
        }).catch(error=>{this.database=null;throw error;});
        return this.database;
    }
    async read(key:string):Promise<SavedLogs|null> {
        const db=await this.open();
        return new Promise((resolve,reject)=>{
            const tx=db.transaction('sessions','readonly');const request=tx.objectStore('sessions').get(key);
            tx.oncomplete=()=>resolve(request.result??null);
            tx.onabort=()=>reject(tx.error??new Error('Log read failed'));
            tx.onerror=()=>reject(tx.error??new Error('Log read failed'));
        });
    }
    async write(key:string,value:SavedLogs):Promise<void> {
        const db=await this.open();
        return new Promise((resolve,reject)=>{
            const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').put(value,key);
            tx.oncomplete=()=>resolve();
            tx.onabort=()=>reject(tx.error??new Error('Log write failed'));
            tx.onerror=()=>reject(tx.error??new Error('Log write failed'));
        });
    }
}
