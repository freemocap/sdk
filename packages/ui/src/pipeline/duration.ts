export function formatProcessingDuration(seconds: number): string {
    if (seconds < 1) return `${(seconds * 1000).toLocaleString(undefined, {maximumFractionDigits: 1})} ms`;
    if (seconds < 60) return `${seconds.toLocaleString(undefined, {maximumFractionDigits: 1})} s`;
    const rounded = Math.round(seconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    return `${hours ? `${hours} h ` : ''}${minutes} m ${rounded % 60} s`;
}
