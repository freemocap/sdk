/** Presentation data for the Core-derived recording selector; the application owns IO. */
export interface BrowserEntry {
    id: string;
    name: string;
    path?: string;
    subtitle?: string;
    /** Actual supplied epoch milliseconds; never infer acquisition time from a filename. */
    timestamp?: number;
    sizeBytes?: number;
    cameraCount?: number;
    frameCount?: number;
    durationSeconds?: number;
    status?: {label: string; tone: 'neutral' | 'success' | 'warning' | 'error'};
    details?: Array<{label: string; value: string}>;
}
export type BrowserSortField = 'date' | 'name' | 'size' | 'cameras' | 'frames' | 'duration';
export type BrowserSortDirection = 'asc' | 'desc';

// Adapted from Core RecordingBrowser's formatting/filter/sort helpers.
export function formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}
export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m ${s}s` : `${m}m ${s}s`;
}
function sortValue(entry: BrowserEntry, field: BrowserSortField): string | number | undefined {
    switch (field) {
        case 'name': return entry.name.toLowerCase();
        case 'date': return entry.timestamp;
        case 'size': return entry.sizeBytes;
        case 'cameras': return entry.cameraCount;
        case 'frames': return entry.frameCount;
        case 'duration': return entry.durationSeconds;
    }
}
export function selectBrowserEntries(entries: readonly BrowserEntry[], query: string, field: BrowserSortField, direction: BrowserSortDirection): BrowserEntry[] {
    const q = query.trim().toLowerCase();
    return entries.filter(entry => !q || [entry.name, entry.subtitle, entry.path].some(value => value?.toLowerCase().includes(q)))
        .sort((a, b) => {
            const left = sortValue(a, field), right = sortValue(b, field);
            // Unknown metadata stays last, without pretending it is a measured zero.
            if (left === undefined) return right === undefined ? a.name.localeCompare(b.name) : 1;
            if (right === undefined) return -1;
            const comparison = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right) : Number(left) - Number(right);
            return (direction === 'desc' ? -comparison : comparison) || a.id.localeCompare(b.id);
        });
}
