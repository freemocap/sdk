/** Own bounded decoded snapshots, then draw a matching group in one browser task.
 * Capture uses rVFC mediaTime and drawImage without CPU pixel readback.
 * Bitmap lifetime follows [@mdnOffscreenBitmap2026]; callback timing [@mdnVideoFrameCallback2026].
 */
export class VideoPresentation {
    readonly epoch = crypto.randomUUID();
    private generation = 0;
    private frames = new Map<string, Map<number, {image: ImageBitmap; time: number}>>();
    private scratch = new Map<string, OffscreenCanvas>();
    private closed = false;
    index: number | null = null;
    time: number | null = null;
    constructor(private readonly canvases: ReadonlyMap<string, HTMLCanvasElement>, private readonly fps: number,
        private readonly capacity = 4) {
        for (const id of canvases.keys()) this.frames.set(id, new Map());
    }
    capture(id: string, video: HTMLVideoElement, time: number): void {
        if (this.closed || !video.videoWidth || !video.videoHeight) return;
        const frames = this.frames.get(id);
        if (!frames) return;
        const index = Math.round(time * this.fps);
        if (this.index !== null && index <= this.index) return;
        let canvas = this.scratch.get(id);
        if (!canvas) {canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight); this.scratch.set(id, canvas);}
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const context = canvas.getContext('2d', {alpha: false});
        if (!context) throw new Error('Video snapshot canvas is unavailable');
        context.drawImage(video, 0, 0);
        const image = canvas.transferToImageBitmap();
        frames.get(index)?.image.close(); frames.set(index, {image, time});
        while (frames.size > this.capacity) {const oldest = Math.min(...frames.keys()); frames.get(oldest)!.image.close(); frames.delete(oldest);}
    }
    commit(target?: number): boolean {
        if (this.closed || !this.frames.size) return false;
        const groups = [...this.frames.values()];
        const candidates = [...groups[0].keys()].filter(index => (target === undefined || index === target) && groups.every(group => group.has(index)));
        if (!candidates.length) return false;
        const index = Math.max(...candidates);
        const destinations = [...this.canvases].map(([id, canvas]) => ({canvas, frame: this.frames.get(id)!.get(index)!, context: canvas.getContext('2d', {alpha: false})}));
        if (destinations.some(item => !item.context)) throw new Error('Video presentation canvas is unavailable');
        for (const {canvas, context, frame} of destinations) {
            if (canvas.width !== frame.image.width) canvas.width = frame.image.width;
            if (canvas.height !== frame.image.height) canvas.height = frame.image.height;
            context!.drawImage(frame.image, 0, 0);
            canvas.dataset.presentedFrame = String(index);
            canvas.dataset.presentationEpoch = `${this.epoch}:${this.generation}`;
            canvas.dataset.presentedMediaTime = String(frame.time);
        }
        this.index = index; this.time = destinations[0].frame.time;
        for (const group of groups) for (const [key, frame] of group) if (key <= index) {frame.image.close(); group.delete(key);}
        return true;
    }
    reset(): void {
        this.generation++; this.index = null; this.time = null;
        for (const group of this.frames.values()) {for (const frame of group.values()) frame.image.close(); group.clear();}
        for (const canvas of this.canvases.values()) {
            canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
            delete canvas.dataset.presentedFrame; delete canvas.dataset.presentedMediaTime;
            canvas.dataset.presentationEpoch = `${this.epoch}:${this.generation}`;
        }
    }
    close(): void {this.reset(); this.closed = true; this.scratch.clear();}
}
