import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CloudManifestSchema, decodeCloudChunk, type CloudFrame} from './point-cloud-format';
import {PointCloudPlayer} from './point-cloud-player';

const reference = {id: 'scene', definition: {name: 'scene', basis: 'blender_x_right_y_forward_z_up' as const, units: 'mm' as const}};
function fixture(count = 8) {
    const buffers = Array.from({length: count}, (_, index) => {
        const header = new TextEncoder().encode(JSON.stringify({schema_version: 1, revision: 'r1', reference_frame: reference,
            frames: [{frame_index: index, source_frame_index: 90 + index, timestamp_s: index, timestamp_ns: String(1000000000 + index),
                point_count: 1, positions_offset: 0, colors_offset: 12}]}));
        const payload = Math.ceil((4 + header.length) / 4) * 4;
        const buffer = new ArrayBuffer(payload + 15);
        new DataView(buffer).setUint32(0, header.length, true); new Uint8Array(buffer, 4, header.length).set(header);
        new Float32Array(buffer, payload, 3).set([index, 20, 30]); new Uint8Array(buffer, payload + 12).set([255, 128, 0]);
        return buffer;
    });
    const manifest = CloudManifestSchema.parse({schema_version: 1, revision: 'r1', reference_frame: reference, max_points: 25000,
        frames: buffers.map((_, i) => ({frame_index: i, source_frame_index: 90 + i, timestamp_s: i, timestamp_ns: String(1000000000 + i), chunk_index: i})),
        chunks: buffers.map((buffer, i) => ({url: `${i}.bin`, byte_length: buffer.byteLength}))});
    return {buffers, manifest};
}
test('cloud binary retains source identities and typed storage; rejects mismatched reference and malformed lengths', () => {
    const {manifest, buffers} = fixture();
    const frame = decodeCloudChunk(buffers[0], manifest, 0).get(0)!;
    assert.equal(frame.sourceFrameIndex, 90); assert.equal(frame.positions.buffer, buffers[0]);
    assert.deepEqual([...frame.colors], [255, 128, 0]);
    assert.throws(() => decodeCloudChunk(buffers[1], manifest, 0));
    assert.throws(() => decodeCloudChunk(buffers[0].slice(0, -1), manifest, 0));
    assert.throws(() => decodeCloudChunk(buffers[0], {...manifest, reference_frame: {...reference, id: 'different'}}, 0));
    new DataView(buffers[0]).setUint32(0, 999999, true);
    assert.throws(() => decodeCloudChunk(buffers[0], manifest, 0));
});
const flush = async () => {for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));};
test('default fetch retains the worker global receiver required by browser WebIDL', async () => {
    const {manifest, buffers} = fixture();
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async function(this: unknown, input: string | URL | Request) {
        assert.equal(this, globalThis); calls++;
        return String(input).endsWith('manifest.json') ? new Response(JSON.stringify(manifest)) : new Response(buffers[Number(new URL(String(input)).pathname.slice(1).split('.')[0])]);
    };
    const errors: Error[] = [];
    const player = new PointCloudPlayer(() => {}, error => errors.push(error));
    try {await player.open('http://local/manifest.json', reference); await flush(); assert.equal(calls, 9); assert.deepEqual(errors, []);}
    finally {player.close(); globalThis.fetch = original;}
});
test('cloud cache is bounded across seeks and never emits a stale asynchronous frame', async () => {
    const {manifest, buffers} = fixture();
    let shown: CloudFrame | null = null;
    const errors: Error[] = [];
    const pending = new Map<number, (value: Response) => void>();
    const fetcher = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
        const index = Number(new URL(url).pathname.slice(1).split('.')[0]);
        return new Promise<Response>(resolve => pending.set(index, resolve));
    }) as typeof fetch;
    const player = new PointCloudPlayer(value => {shown = value;}, error => errors.push(error), fetcher);
    await player.open('http://local/manifest.json', reference, {concurrency: 2, maxResidentBytes: 3 * Math.max(...buffers.map(buffer => buffer.byteLength))});
    player.update(0); player.update(4);
    pending.get(0)!(new Response(buffers[0])); await flush();
    assert.equal(shown, null);
    pending.get(4)!(new Response(buffers[4])); pending.get(5)!(new Response(buffers[5])); await flush();
    assert.equal((shown as CloudFrame | null)?.frameIndex, 4);
    player.update(6); pending.get(6)!(new Response(buffers[6])); pending.get(7)!(new Response(buffers[7])); await flush();
    assert.equal((shown as CloudFrame | null)?.frameIndex, 6);
    assert.ok(player.stats.cacheBytes <= 3 * Math.max(...buffers.map(buffer => buffer.byteLength)));
    player.update(null); assert.equal(shown, null);
    player.close(); assert.equal(player.stats.cacheBytes, 0); assert.deepEqual(errors, []);
});


test('clip preloads without a clock and retains all frames across seeks and loops without network', async () => {
    const {manifest, buffers} = fixture();
    let requests = 0; let shown: CloudFrame | null = null;
    const errors: Error[] = [];
    const player = new PointCloudPlayer(frame => {shown = frame;}, error => errors.push(error), (async input => {
        requests++;
        const url = String(input);
        return url.endsWith('manifest.json') ? new Response(JSON.stringify(manifest)) : new Response(buffers[Number(new URL(url).pathname.slice(1).split('.')[0])]);
    }) as typeof fetch);
    await player.open('http://local/manifest.json', reference, {concurrency: 4}); await flush();
    assert.equal(player.diagnostics.status, 'ready'); assert.equal(player.diagnostics.residentChunks, 8);
    assert.equal(player.diagnostics.cacheBytes, buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0));
    const loadedRequests = requests;
    for (const index of [0, 7, 1, 6, 0, 7, 0]) {player.update(index); assert.equal((shown as CloudFrame | null)?.sourceFrameIndex, 90 + index);}
    assert.equal(requests, loadedRequests);
    player.update(null); assert.equal(shown, null);
    assert.equal(player.diagnostics.hiddenReason, 'presentation-clock-unavailable'); assert.equal(player.diagnostics.status, 'ready');
    player.close(); assert.deepEqual(errors, []);
});

test('closing preload rejects late responses and releases retained storage', async () => {
    const {manifest, buffers} = fixture();
    const pending: ((response: Response) => void)[] = []; let shown: CloudFrame | null = null;
    const player = new PointCloudPlayer(frame => {shown = frame;}, error => {throw error;}, (async input => {
        if (String(input).endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
        return new Promise<Response>(resolve => pending.push(resolve));
    }) as typeof fetch);
    await player.open('http://local/manifest.json', reference, {concurrency: 4}); assert.equal(pending.length, 4);
    player.update(0); player.close(); pending.forEach((resolve, index) => resolve(new Response(buffers[index]))); await flush();
    assert.equal(shown, null); assert.equal(player.diagnostics.cacheBytes, 0);
    assert.equal(player.diagnostics.status, 'idle'); assert.equal(player.diagnostics.inFlight, 0);
});

test('95 published chunks load in six batches and later seeks use resident frames', async () => {
    const {manifest, buffers} = fixture(95);
    const ranges: number[] = [];
    const errors: Error[] = [];
    let shown: CloudFrame | null = null;
    const player = new PointCloudPlayer(frame => {shown = frame;}, error => errors.push(error), async input => {
        const url = new URL(String(input));
        if (url.pathname === '/manifest.json') return Response.json({...manifest, batch_url: 'batch'});
        assert.equal(url.pathname, '/batch');
        const first = Number(url.searchParams.get('first')), count = Number(url.searchParams.get('count'));
        ranges.push(count);
        return new Response(new Blob(buffers.slice(first, first + count)));
    });
    await player.open('http://local/manifest.json', reference);
    for (let i = 0; i < 100 && player.diagnostics.status === 'loading'; i++) await flush();
    assert.deepEqual(errors, []);
    assert.equal(player.diagnostics.status, 'ready');
    for (const index of [94, 0, 30]) {
        player.update(index);
        assert.equal((shown as CloudFrame | null)?.frameIndex, index);
    }
    assert.deepEqual(ranges, [16, 16, 16, 16, 16, 15]);
    player.close();
});
