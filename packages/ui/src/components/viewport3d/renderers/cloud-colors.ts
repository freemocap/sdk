import {Color, SRGBColorSpace} from 'three';

// Photo RGB bytes are sRGB; vertex attributes are linear [@threeColorManagement2026].
const linear = new Float32Array(256);
const color = new Color();
for (let i = 0; i < linear.length; i++) linear[i] = color.setRGB(i / 255, 0, 0, SRGBColorSpace).r;
export function copyCloudColors(destination: Float32Array, source: Uint8Array): void {
    if (source.length > destination.length) throw new Error('Cloud color capacity exceeded');
    for (let i = 0; i < source.length; i++) destination[i] = linear[source[i]];
}
