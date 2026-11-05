import {z} from 'zod';
import {SpatialReferenceSchema} from '@freemocap/client/recording';
import {snapshotEqual} from '@freemocap/client';

export interface CloudLoadingOptions {concurrency?: number; maxResidentBytes?: number}
export interface PointCloudPlayback {manifestUrl: string; loading?: CloudLoadingOptions}
export const CloudReferenceSchema = z.object({id: z.string().min(1), definition: SpatialReferenceSchema});
export type CloudReference = z.infer<typeof CloudReferenceSchema>;
const FrameIdentity = z.object({frame_index: z.number().int().nonnegative(), source_frame_index: z.number().int().nonnegative(),
    timestamp_s: z.number().finite(), timestamp_ns: z.string().regex(/^\d+$/)});
export const CloudManifestSchema = z.object({schema_version: z.literal(1), revision: z.string().min(1),
    reference_frame: CloudReferenceSchema, max_points: z.number().int().positive().max(60000),
    frames: z.array(FrameIdentity.extend({chunk_index: z.number().int().nonnegative()})).min(1).max(100000),
    chunks: z.array(z.object({url: z.string().min(1), byte_length: z.number().int().positive().max(16 * 1024 * 1024)})).min(1),
}).superRefine((value, context) => {
    value.frames.forEach((frame, index) => {
        if (frame.frame_index !== index || frame.chunk_index >= value.chunks.length || (index > 0 &&
            (frame.timestamp_s <= value.frames[index - 1].timestamp_s || frame.source_frame_index <= value.frames[index - 1].source_frame_index)))
            context.addIssue({code: 'custom', message: 'Cloud timeline must be ordered with valid chunk indices'});
    });
});
export type CloudManifest = z.infer<typeof CloudManifestSchema>;
const ChunkSchema = z.object({schema_version: z.literal(1), revision: z.string(), reference_frame: CloudReferenceSchema,
    frames: z.array(FrameIdentity.extend({point_count: z.number().int().nonnegative().max(60000),
        positions_offset: z.number().int().nonnegative(), colors_offset: z.number().int().nonnegative()})).min(1).max(60)});
export interface CloudFrame {frameIndex: number; sourceFrameIndex: number; timestamp: number; positions: Float32Array; colors: Uint8Array}
export function decodeCloudChunk(buffer: ArrayBuffer, manifest: CloudManifest, chunkIndex: number): Map<number, CloudFrame> {
    if (buffer.byteLength !== manifest.chunks[chunkIndex].byte_length || buffer.byteLength < 4) throw new Error('Cloud chunk size mismatch');
    const length = new DataView(buffer).getUint32(0, true);
    if (length > 128 * 1024 || length + 4 > buffer.byteLength) throw new Error('Invalid cloud header length');
    const header = ChunkSchema.parse(JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length))));
    const payload = Math.ceil((length + 4) / 4) * 4;
    if (header.revision !== manifest.revision || !snapshotEqual(header.reference_frame, manifest.reference_frame)) throw new Error('Cloud chunk reference/revision mismatch');
    const frames = new Map<number, CloudFrame>();
    for (const frame of header.frames) {
        const expected = manifest.frames[frame.frame_index];
        if (!expected || expected.chunk_index !== chunkIndex || expected.source_frame_index !== frame.source_frame_index ||
            expected.timestamp_s !== frame.timestamp_s || expected.timestamp_ns !== frame.timestamp_ns || frames.has(frame.frame_index))
            throw new Error('Cloud chunk frame identity mismatch');
        const count = frame.point_count * 3;
        if (frame.point_count > manifest.max_points || frame.positions_offset % 4 !== 0 ||
            payload + frame.positions_offset + count * 4 > buffer.byteLength || payload + frame.colors_offset + count > buffer.byteLength)
            throw new Error('Cloud frame exceeds declared storage');
        const positions = new Float32Array(buffer, payload + frame.positions_offset, count);
        for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i])) throw new Error('Cloud positions must be finite');
        frames.set(frame.frame_index, {frameIndex: frame.frame_index, sourceFrameIndex: frame.source_frame_index,
            timestamp: frame.timestamp_s, positions, colors: new Uint8Array(buffer, payload + frame.colors_offset, count)});
    }
    if (frames.size !== manifest.frames.filter(frame => frame.chunk_index === chunkIndex).length) throw new Error('Cloud chunk missing frames');
    return frames;
}
