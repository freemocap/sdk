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
    get diagnostics() {return {...this.stats, residentChunks: this.cache.size, inFlight: this.requests.size, status: this.status, mode: this.preload ? 'clip' : 'window', totalBytes: this.totalBytes, loadedBytes: this.stats.cacheBytes, totalChunks: this.manifest?.chunks.length ?? 0, readyMs: this.readyMs, hiddenReason: this.hiddenReason, concurrency: this.options.concurrency, maxResidentBytes: this.options.maxResidentBytes, reservedBytes: this.stats.cacheBytes + [...this.requests.keys()].reduce((sum, index) => sum + (this.manifest?.chunks[index].byte_length ?? 0), 0)};}
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
            for (const [key, request] of this.requests) if (!this.wanted.includes(key)) {request.abort(); this.requests.delete(key);}
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
        const result: number[] = []; let bytes = 0;
        for (let count = 0; count < chunks.length; count++) {
            const index = (start + count) % chunks.length;
            if (bytes + chunks[index].byte_length > this.options.maxResidentBytes) break;
            bytes += chunks[index].byte_length; result.push(index);
        }
        return result;
    }
    private pump(): void {
        for (const index of this.wanted) {
            if (this.requests.size >= this.options.concurrency) break;
            if (!this.cache.has(index) && !this.requests.has(index) && !this.failed.has(index)) this.load(index);
        }
    }
    private load(index: number): void {
        const manifest = this.manifest!;
        if (this.requests.size >= this.options.concurrency) return;
        const request = new AbortController(), generation = this.generation;
        this.requests.set(index, request); this.stats.requests++;
        const start = performance.now();
        void (async () => {
            const spec = manifest.chunks[index];
            const response = await this.fetcher(new URL(spec.url, this.baseUrl), {signal: request.signal});
            if (!response.ok || !response.body) throw new Error(`Cloud chunk request failed: ${response.status}`);
            if (request.signal.aborted || generation !== this.generation) {await response.body.cancel(); return;}
            // Stream into exactly the declared allocation; reject excess bytes before buffering them.
            const bytes = new Uint8Array(spec.byte_length), reader = response.body.getReader();
            let offset = 0;
            try {
                for (;;) {const result = await reader.read(); if (result.done) break;
                    if (offset + result.value.length > bytes.length) throw new Error('Cloud response exceeds declared length');
                    bytes.set(result.value, offset); offset += result.value.length;}
            } finally {await reader.cancel(); reader.releaseLock();}
            if (request.signal.aborted || generation !== this.generation) return;
            if (offset !== bytes.length) throw new Error('Truncated cloud response');
            const frames = decodeCloudChunk(bytes.buffer, manifest, index);
            this.cache.set(index, {frames, bytes: bytes.length}); this.stats.cacheBytes += bytes.length;
            this.stats.fetchMs += performance.now() - start;
            if (this.preload && this.cache.size === manifest.chunks.length) {this.status = 'ready'; this.readyMs = performance.now() - this.started;}
            else if (!this.preload && !this.failed.size) this.status = 'ready';
        })().catch(error => {if (!request.signal.aborted && generation === this.generation) {this.failed.add(index); this.status = 'error'; this.error(error as Error);}})
            .finally(() => {if (this.requests.get(index) === request) this.requests.delete(index);
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
