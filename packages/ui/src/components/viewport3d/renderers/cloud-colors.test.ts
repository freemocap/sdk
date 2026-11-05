import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyCloudColors} from './cloud-colors';
test('photo RGB converts once to linear vertex colors with reusable storage', () => {
    const output = new Float32Array(6), input = new Uint8Array([0, 128, 255]);
    copyCloudColors(output, input);
    assert.equal(output[0], 0); assert.ok(Math.abs(output[1] - .2158605) < 1e-6); assert.equal(output[2], 1);
    copyCloudColors(output, new Uint8Array([255, 0, 128]));
    assert.equal(output[0], 1); assert.equal(output[1], 0); assert.equal(input[1], 128);
});
