import {snapshotEqual} from '@freemocap/client';
import {CloudManifestSchema, decodeCloudChunk, type CloudFrame, type CloudManifest, type CloudReference, type CloudLoadingOptions} from './point-cloud-format';

/** Worker-owned clip preload or byte-budgeted rolling cache. A changed clock never displays an older cloud. */
export class PointCloudPlayer {
    private manifest: CloudManifest | null = null;
    private baseUrl = '';
    private generation = 0;
    private clock: number | null = null;
    private displayed = -1;
    private lastMissing = -1;
    private lifetime = new AbortController();
    private cache = new Map<number, {frames: Map<number, CloudFrame>; bytes: number}>();
    private requests = new Map<number, AbortController>();
    private failed = new Set<number>();
    private options = {concurrency: 16, maxResidentBytes: 512 * 1024 * 1024};
    private preload = false;
    private wanted: number[] = [];
    private started = 0;
    private status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
    private totalBytes = 0;
    private readyMs = 0;
    private hiddenReason = 'no-source';
    readonly stats = {requests: 0, cacheBytes: 0, displayedFrames: 0, missingFrames: 0, fetchMs: 0,
        frameIndex: -1, sourceFrameIndex: -1, pointCount: 0, timestamp: null as number | null};
    get diagnostics() {return {...this.stats, residentChunks: this.cache.size, inFlight: this.requests.size, status: this.status, mode: this.preload ? 'clip' : 'window', totalBytes: this.totalBytes, loadedBytes: this.stats.cacheBytes, totalChunks: this.manifest?.chunks.length ?? 0, readyMs: this.readyMs, hiddenReason: this.hiddenReason, concurrency: this.options.concurrency, maxResidentBytes: this.options.maxResidentBytes, reservedBytes: this.stats.cacheBytes + [...this.requests.keys()].reduce((sum, index) => sum + (this.cache.has(index) ? 0 : this.manifest?.chunks[index].byte_length ?? 0), 0)};}
    private publish(frame: CloudFrame | null, capacity: number): void {
        Object.assign(this.stats, {frameIndex: frame?.frameIndex ?? -1, sourceFrameIndex: frame?.sourceFrameIndex ?? -1,
            pointCount: (frame?.positions.length ?? 0) / 3, timestamp: frame?.timestamp ?? null});
        this.emit(frame, capacity);
    }
    constructor(private readonly emit: (frame: CloudFrame | null, capacity: number) => void,
        private readonly error: (error: Error) => void,
        private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args)) {}
    async open(url: string, reference: CloudReference, options: CloudLoadingOptions = {}): Promise<void> {
        this.close();
        const generation = this.generation;
        this.started = performance.now(); this.status = 'loading';
        try {
            this.options = {concurrency: options.concurrency ?? 16, maxResidentBytes: options.maxResidentBytes ?? 512 * 1024 * 1024};
            if (!Number.isInteger(this.options.concurrency) || this.options.concurrency < 1 || this.options.concurrency > 64 || !Number.isSafeInteger(this.options.maxResidentBytes) || this.options.maxResidentBytes < 1) throw new Error('Invalid cloud loading budget');
            const response = await this.fetcher(url, {signal: this.lifetime.signal});
            if (!response.ok) throw new Error(`Cloud manifest request failed: ${response.status}`);
            const text = await response.text();
            if (text.length > 16 * 1024 * 1024) throw new Error('Cloud manifest exceeds size limit');
            const manifest = CloudManifestSchema.parse(JSON.parse(text));
            if (!snapshotEqual(manifest.reference_frame, reference)) throw new Error('Cloud and scene reference frames disagree');
            if (generation !== this.generation) return;
            this.totalBytes = manifest.chunks.reduce((sum, chunk) => sum + chunk.byte_length, 0);
            if (manifest.chunks.some(chunk => chunk.byte_length > this.options.maxResidentBytes)) throw new Error('Cloud chunk exceeds resident byte budget');
            this.preload = this.totalBytes <= this.options.maxResidentBytes;
            this.manifest = manifest; this.baseUrl = url;
            this.wanted = this.preload ? manifest.chunks.map((_, index) => index) : this.window(0);
            this.update(this.clock); this.pump();
        } catch (error) {if (generation === this.generation && !this.lifetime.signal.aborted) {this.status = 'error'; this.error(error as Error);}}
    }
    update(time: number | null): void {
        this.clock = time;
        const manifest = this.manifest;
        if (!manifest || time === null || !Number.isFinite(time)) {this.hiddenReason = manifest ? 'presentation-clock-unavailable' : 'no-source'; this.displayed = -1; this.publish(null, manifest?.max_points ?? 0); return;}
        let lo = 0, hi = manifest.frames.length;
        while (lo < hi) {const mid = (lo + hi) >>> 1; if (manifest.frames[mid].timestamp_s <= time + 1e-7) lo = mid + 1; else hi = mid;}
        const index = lo - 1;
        if (index < 0 || Math.abs(manifest.frames[index].timestamp_s - time) > 1e-6) {
            this.hiddenReason = 'timestamp-not-found'; this.displayed = -1; this.publish(null, manifest.max_points); return;
        }
        const chunk = manifest.frames[index].chunk_index;
        if (!this.preload) {
            this.wanted = this.window(chunk);
            const wanted = new Set(this.wanted);
            const retained = new Set([...this.requests].filter(([index]) => wanted.has(index)).map(([, request]) => request));
            for (const [index, request] of this.requests) {
                if (!retained.has(request)) {request.abort(); this.requests.delete(index);}
            }
            for (const [key, cached] of this.cache) if (!this.wanted.includes(key)) {this.cache.delete(key); this.stats.cacheBytes -= cached.bytes;}
        }
        const cached = this.cache.get(chunk);
        if (cached && (!this.preload || this.status === 'ready')) {
            this.hiddenReason = 'visible';
            this.lastMissing = -1;
            this.cache.delete(chunk); this.cache.set(chunk, cached);
            if (this.displayed !== index) {this.publish(cached.frames.get(index)!, manifest.max_points); this.displayed = index; this.stats.displayedFrames++;}
        } else {
            this.hiddenReason = this.preload && this.status !== 'ready' ? 'clip-loading' : 'cache-miss';
            if (this.lastMissing !== index) {this.stats.missingFrames++; this.lastMissing = index;}
            this.displayed = -1; this.publish(null, manifest.max_points);
        }
        this.pump();
    }
    private window(start: number): number[] {
        const chunks = this.manifest!.chunks;
        // Advance the read-ahead window by a batch so sequential playback can replenish it in bulk.
        if (this.manifest!.batch_url) {
            const aligned = start - start % Math.min(16, this.options.concurrency);
            const required = chunks.slice(aligned, start + 1).reduce((sum, chunk) => sum + chunk.byte_length, 0);
            if (required <= this.options.maxResidentBytes) start = aligned;
        }
        const result: number[] = []; let bytes = 0;
        for (let count = 0; count < chunks.length; count++) {
            const index = (start + count) % chunks.length;
            if (bytes + chunks[index].byte_length > this.options.maxResidentBytes) break;
            bytes += chunks[index].byte_length; result.push(index);
        }
        return result;
    }
    private pump(): void {
        const manifest = this.manifest;
        if (!manifest) return;
        const pending = this.wanted.filter(index => !this.cache.has(index) && !this.requests.has(index) && !this.failed.has(index));
        for (let offset = 0; offset < pending.length && this.requests.size < this.options.concurrency;) {
            const group = [pending[offset++]];
            const limit = manifest.batch_url ? Math.min(16, this.options.concurrency - this.requests.size) : 1;
            while (group.length < limit && pending[offset] === group[group.length - 1] + 1) group.push(pending[offset++]);
            this.load(group);
        }
    }
    private load(indices: number[]): void {
        const manifest = this.manifest!;
        const request = new AbortController(), generation = this.generation;
        for (const index of indices) this.requests.set(index, request);
        this.stats.requests++;
        const start = performance.now();
        void (async () => {
            const url = new URL(manifest.batch_url ?? manifest.chunks[indices[0]].url, this.baseUrl);
            if (manifest.batch_url) {
                url.searchParams.set('first', String(indices[0]));
                url.searchParams.set('count', String(indices.length));
            }
            const response = await this.fetcher(url, {signal: request.signal});
            if (!response.ok || !response.body) throw new Error(`Cloud chunk request failed: ${response.status}`);
            if (request.signal.aborted || generation !== this.generation) {await response.body.cancel(); return;}
            const reader = response.body.getReader();
            let remaining: Uint8Array = new Uint8Array(0);
            try {
                for (const index of indices) {
                    const bytes = new Uint8Array(manifest.chunks[index].byte_length);
                    let offset = 0;
                    while (offset < bytes.length) {
                        if (!remaining.length) {
                            const result = await reader.read();
                            if (result.done) throw new Error('Truncated cloud response');
                            remaining = result.value;
                        }
                        const length = Math.min(remaining.length, bytes.length - offset);
                        bytes.set(remaining.subarray(0, length), offset);
                        offset += length;
                        remaining = remaining.subarray(length);
                    }
                    if (request.signal.aborted || generation !== this.generation) return;
                    const frames = decodeCloudChunk(bytes.buffer, manifest, index);
                    if (this.preload || this.wanted.includes(index)) {
                        this.cache.set(index, {frames, bytes: bytes.length});
                        this.stats.cacheBytes += bytes.length;
                    }
                }
                if (remaining.length || !(await reader.read()).done) throw new Error('Cloud response exceeds declared length');
            } finally {await reader.cancel(); reader.releaseLock();}
            if (request.signal.aborted || generation !== this.generation) return;
            this.stats.fetchMs += performance.now() - start;
            if (this.preload && this.cache.size === manifest.chunks.length) {this.status = 'ready'; this.readyMs = performance.now() - this.started;}
            else if (!this.preload && !this.failed.size) this.status = 'ready';
        })().catch(error => {if (!request.signal.aborted && generation === this.generation) {for (const index of indices) this.failed.add(index); this.status = 'error'; this.error(error as Error);}})
            .finally(() => {for (const index of indices) if (this.requests.get(index) === request) this.requests.delete(index);
                if (!request.signal.aborted && generation === this.generation) {this.update(this.clock); this.pump();}});
    }
    close(): void {
        this.generation++; this.lifetime.abort(); this.lifetime = new AbortController();
        for (const request of this.requests.values()) request.abort();
        this.requests.clear(); this.cache.clear(); this.failed.clear(); this.manifest = null; this.clock = null; this.displayed = -1; this.lastMissing = -1;
        Object.assign(this.stats, {requests: 0, cacheBytes: 0, displayedFrames: 0, missingFrames: 0, fetchMs: 0});
        this.preload = false; this.status = 'idle'; this.totalBytes = 0; this.readyMs = 0; this.wanted = []; this.hiddenReason = 'no-source';
        this.publish(null, 0);
    }
}
