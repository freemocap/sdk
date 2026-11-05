import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withCloudBounds} from './cloud-framing';
import {keypointSources} from './keypoint-storage';
test('scene framing includes actual dense cloud extents without allocating named points for the cloud', () => {
    const model = {pointNames: ['object'], interleaved: new Float32Array([10, 20, 30])};
    const result = withCloudBounds(model, new Float32Array([-1000, 50, 20, 300, -50, 2000]))!;
    assert.equal(result.pointNames.length, 3);
    assert.equal(keypointSources(result)[0].data, model.interleaved);
    assert.deepEqual([...keypointSources(result)[1].data], [-1000, -50, 20, 300, 50, 2000]);
    assert.equal(withCloudBounds(model), model);
});
