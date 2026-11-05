import {snapshotEqual} from '@freemocap/client';
import {CloudManifestSchema, decodeCloudChunk, type CloudFrame, type CloudManifest, type CloudReference} from './point-cloud-format';

/** Worker-owned bounded cache. A changed clock never displays an older cloud. */
export class PointCloudPlayer {
    private manifest: CloudManifest | null = null;
    private baseUrl = '';
    private generation = 0;
    private clock: number | null = null;
    private displayed = -1;
    private lifetime = new AbortController();
    private cache = new Map<number, {frames: Map<number, CloudFrame>; bytes: number}>();
    private requests = new Map<number, AbortController>();
    private failed = new Set<number>();
    readonly stats = {requests: 0, cacheBytes: 0, displayedFrames: 0, missingFrames: 0, fetchMs: 0,
        frameIndex: -1, sourceFrameIndex: -1, pointCount: 0, timestamp: null as number | null};
    get diagnostics() {return {...this.stats, residentChunks: this.cache.size, inFlight: this.requests.size};}
    private publish(frame: CloudFrame | null, capacity: number): void {
        Object.assign(this.stats, {frameIndex: frame?.frameIndex ?? -1, sourceFrameIndex: frame?.sourceFrameIndex ?? -1,
            pointCount: (frame?.positions.length ?? 0) / 3, timestamp: frame?.timestamp ?? null});
        this.emit(frame, capacity);
    }
    constructor(private readonly emit: (frame: CloudFrame | null, capacity: number) => void,
        private readonly error: (error: Error) => void, private readonly fetcher: typeof fetch = fetch) {}
    async open(url: string, reference: CloudReference): Promise<void> {
        this.close();
        const generation = this.generation;
        try {
            const response = await this.fetcher(url, {signal: this.lifetime.signal});
            if (!response.ok) throw new Error(`Cloud manifest request failed: ${response.status}`);
            const text = await response.text();
            if (text.length > 16 * 1024 * 1024) throw new Error('Cloud manifest exceeds size limit');
            const manifest = CloudManifestSchema.parse(JSON.parse(text));
            if (!snapshotEqual(manifest.reference_frame, reference)) throw new Error('Cloud and scene reference frames disagree');
            if (generation !== this.generation) return;
            this.manifest = manifest; this.baseUrl = url; this.update(this.clock);
        } catch (error) {if (generation === this.generation && !this.lifetime.signal.aborted) this.error(error as Error);}
    }
    update(time: number | null): void {
        this.clock = time;
        const manifest = this.manifest;
        if (!manifest || time === null || !Number.isFinite(time)) {this.displayed = -1; this.publish(null, manifest?.max_points ?? 0); return;}
        let lo = 0, hi = manifest.frames.length;
        while (lo < hi) {const mid = (lo + hi) >>> 1; if (manifest.frames[mid].timestamp_s <= time + 1e-7) lo = mid + 1; else hi = mid;}
        const index = lo - 1;
        if (index < 0 || Math.abs(manifest.frames[index].timestamp_s - time) > 1e-6) {
            this.displayed = -1; this.publish(null, manifest.max_points); return;
        }
        const chunk = manifest.frames[index].chunk_index;
        const wanted = new Set([chunk, Math.min(chunk + 1, manifest.chunks.length - 1)]);
        for (const [key, request] of this.requests) if (!wanted.has(key)) {request.abort(); this.requests.delete(key);}
        const cached = this.cache.get(chunk);
        if (cached) {
            this.cache.delete(chunk); this.cache.set(chunk, cached);
            if (this.displayed !== index) {this.publish(cached.frames.get(index)!, manifest.max_points); this.displayed = index; this.stats.displayedFrames++;}
        } else {
            if (this.displayed !== -1) this.stats.missingFrames++;
            this.displayed = -1; this.publish(null, manifest.max_points);
        }
        for (const key of wanted) if (!this.cache.has(key) && !this.requests.has(key) && !this.failed.has(key)) this.load(key);
    }
    private load(index: number): void {
        const manifest = this.manifest!;
        if (this.requests.size >= 2) return;
        const request = new AbortController(), generation = this.generation;
        this.requests.set(index, request); this.stats.requests++;
        const start = performance.now();
        void (async () => {
            const spec = manifest.chunks[index];
            const response = await this.fetcher(new URL(spec.url, this.baseUrl), {signal: request.signal});
            if (!response.ok || !response.body) throw new Error(`Cloud chunk request failed: ${response.status}`);
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
            while (this.cache.size >= 3) {const oldest = this.cache.keys().next().value!; this.stats.cacheBytes -= this.cache.get(oldest)!.bytes; this.cache.delete(oldest);}
            this.cache.set(index, {frames, bytes: bytes.length}); this.stats.cacheBytes += bytes.length;
            this.stats.fetchMs += performance.now() - start;
        })().catch(error => {if (!request.signal.aborted && generation === this.generation) {this.failed.add(index); this.error(error as Error);}})
            .finally(() => {if (this.requests.get(index) === request) this.requests.delete(index);
                if (!request.signal.aborted && generation === this.generation) this.update(this.clock);});
    }
    close(): void {
        this.generation++; this.lifetime.abort(); this.lifetime = new AbortController();
        for (const request of this.requests.values()) request.abort();
        this.requests.clear(); this.cache.clear(); this.failed.clear(); this.manifest = null; this.clock = null; this.displayed = -1;
        Object.assign(this.stats, {requests: 0, cacheBytes: 0, displayedFrames: 0, missingFrames: 0, fetchMs: 0});
        this.publish(null, 0);
    }
}
