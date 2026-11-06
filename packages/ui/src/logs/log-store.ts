import {LogRecordSchema, type LogRecord} from '@freemocap/client';
export {LogRecordSchema, type LogRecord} from '@freemocap/client';

const MAX_ENTRIES = 10_000;
// Periodic writes run at idle time; record serialization is cached incrementally.
const AUTO_SAVE_INTERVAL_MS = 20_000;

export type LogSnapshot = {
    entries: LogRecord[];
    hasErrors: boolean;
    countsByLevel: Record<string, number>;
    version: number;
};

/**
 * Mutable store for streaming log records from the backend.
 * Lives in a ref — no Redux, no immutable copies, no re-renders on every message.
 * Components poll via getSnapshot() on their own schedule (typically ~500ms).
 *
 * Uses a version counter to avoid copying the entries array when nothing has
 * changed since the last snapshot. The snapshot's entries array is only
 * reallocated when new logs have arrived.
 *
 * The application establishes a backend session before connecting its log stream.
 * Persistence retains the complete bounded history for that session across page
 * reloads. A new backend session never restores an old session's records.
 */
export class LogStore {
    private entries: LogRecord[] = [];
    private countsByLevel: Record<string, number> = {};
    private hasErrors: boolean = false;

    /** Incremented on every mutation (add / clear). */
    private version: number = 0;

    /** Version at which the last snapshot was taken. */
    private lastSnapshotVersion: number = -1;

    /** Cached snapshot entries — reused when version hasn't changed. */
    private cachedEntries: LogRecord[] = [];
    private cachedCountsByLevel: Record<string, number> = {};

    /** Set when entries change since the last persist. */
    private dirty: boolean = false;

    /** Periodic save timer handle. */
    private saveInterval: ReturnType<typeof setInterval> | null = null;

    /** Pending idle-callback handle for a deferred persist (so we don't double-schedule). */
    private idlePersistHandle: number | null = null;

    private readonly storageKey: string | null;
    private readonly recordIds = new Set<string>();
    private sessionId: string | null = null;
    private readonly serializedRecords = new WeakMap<LogRecord, string>();
    /** Browser storage may be unavailable or full; the live buffer still works. */
    persistenceError: string | null = null;
    constructor({storageKey = null}: {storageKey?: string | null} = {}) {
        this.storageKey = storageKey;

    }

    /** Call with the backend lifetime identity before subscribing to log records. */
    beginSession(sessionId: string): void {
        if (!sessionId.trim()) throw new Error('Log session identity must not be empty');
        if (this.sessionId === sessionId) return;
        // Read before clearing; constructor deliberately does not expose an old tail.
        let saved: unknown = null;
        if (this.storageKey) {
            try { saved = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null'); }
            catch { /* Missing, inaccessible or invalid storage starts empty. */ }
        }
        this.clear();
        this.sessionId = sessionId;
        if (saved && typeof saved === 'object' && 'sessionId' in saved && saved.sessionId === sessionId
            && 'entries' in saved && Array.isArray(saved.entries)) {
            for (const item of saved.entries.slice(-MAX_ENTRIES)) {
                const result = LogRecordSchema.safeParse(item);
                if (result.success) this.add(result.data);
            }
        }
        this.dirty = true;
        this.persistNow();
    }

    start(): void {
        if (this.saveInterval === null) {
            this.saveInterval = setInterval(() => this.persistIfDirty(), AUTO_SAVE_INTERVAL_MS);
        }
    }

    /** Stop the auto-save timer and flush one last time. Call on teardown. */
    dispose(): void {
        if (this.saveInterval !== null) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }
        if (this.idlePersistHandle !== null) {
            const cic = (globalThis as typeof globalThis & {
                cancelIdleCallback?: (handle: number) => void;
            }).cancelIdleCallback;
            if (cic) cic(this.idlePersistHandle);
            else clearTimeout(this.idlePersistHandle);
            this.idlePersistHandle = null;
        }
        // Final flush is synchronous — idle callbacks won't run during unload.
        this.persistToLocalStorage();
    }

    add(record: LogRecord): void {
        if (record.log_id && this.recordIds.has(record.log_id)) return;
        if (record.log_id) this.recordIds.add(record.log_id);
        this.entries.push(record);
        // Serialize once per received record rather than all 10k on every flush.
        if (this.storageKey) this.serializedRecords.set(record, JSON.stringify(record));
        this.version++;

        // Update counts
        const level = record.levelname;
        this.countsByLevel[level] = (this.countsByLevel[level] || 0) + 1;

        // Track error state
        if (level === 'ERROR' || level === 'CRITICAL') {
            this.hasErrors = true;
        }

        // Trim to capacity
        if (this.entries.length > MAX_ENTRIES) {
            const removed = this.entries.splice(0, this.entries.length - MAX_ENTRIES);
            for (const r of removed) {
                if (r.log_id) this.recordIds.delete(r.log_id);
                this.countsByLevel[r.levelname]--;
                if (this.countsByLevel[r.levelname] <= 0) {
                    delete this.countsByLevel[r.levelname];
                }
            }
            this.hasErrors = (this.countsByLevel['ERROR'] ?? 0) > 0
                || (this.countsByLevel['CRITICAL'] ?? 0) > 0;
        }

        this.dirty = true;
    }

    /**
     * Returns a snapshot for React components to read during render.
     * Only copies the entries array when new logs have arrived since the
     * last call, avoiding the per-poll GC pressure of unconditional .slice().
     */
    getSnapshot(): LogSnapshot {
        if (this.version !== this.lastSnapshotVersion) {
            this.cachedEntries = this.entries.slice();
            this.cachedCountsByLevel = { ...this.countsByLevel };
            this.lastSnapshotVersion = this.version;
        }

        return {
            entries: this.cachedEntries,
            hasErrors: this.hasErrors,
            countsByLevel: this.cachedCountsByLevel,
            version: this.version,
        };
    }

    clear(): void {
        this.recordIds.clear();
        this.entries = [];
        this.countsByLevel = {};
        this.hasErrors = false;
        this.dirty = false;
        this.version++;
        this.cachedEntries = [];
        this.cachedCountsByLevel = {};
        this.lastSnapshotVersion = this.version;
        this.clearLocalStorage();
    }

    /** Force an immediate persist (used for beforeunload). */
    persistNow(): void {
        this.persistToLocalStorage();
    }

    // ── private persistence helpers ──────────────────────────────────────

    private persistIfDirty(): void {
        if (!this.dirty || this.idlePersistHandle !== null) return;
        // Defer the serialize + write to idle time so it can't land inside a
        // streaming render frame. Falls back to a macrotask where rIC is absent.
        const ric = (globalThis as typeof globalThis & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }).requestIdleCallback;
        const run = (): void => {
            this.idlePersistHandle = null;
            this.persistToLocalStorage();
        };
        this.idlePersistHandle = ric
            ? ric(run, { timeout: AUTO_SAVE_INTERVAL_MS })
            : (setTimeout(run, 0) as unknown as number);
    }

    private persistToLocalStorage(): void {
        if (!this.storageKey || !this.sessionId || !this.dirty) return;
        try {
            const records = this.entries.map(record => this.serializedRecords.get(record)!);
            localStorage.setItem(this.storageKey,
                `{"sessionId":${JSON.stringify(this.sessionId)},"entries":[${records.join(',')}]}`);
            this.dirty = false;
            this.persistenceError = null;
        } catch (error) {
            this.persistenceError = error instanceof Error ? error.message : String(error);
        }
    }

    private clearLocalStorage(): void {
        if (!this.storageKey) return;
        try {
            localStorage.removeItem(this.storageKey);
            this.persistenceError = null;
        } catch (error) {
            this.persistenceError = error instanceof Error ? error.message : String(error);
        }
    }
}
