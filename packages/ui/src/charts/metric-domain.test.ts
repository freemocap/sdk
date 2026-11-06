import {test} from 'node:test';
import assert from 'node:assert/strict';
import {metricDomain} from './metric-domain';

test('charts preserve scalar units and support first observations, constants, and negative values',()=>{
    assert.equal(metricDomain([]),null);
    const single=metricDomain([{step:1,value:.0001}])!;
    assert.ok(single.x[0]<single.x[1]&&single.y[0]<.0001&&single.y[1]>.0001);
    const negative=metricDomain([{step:2,value:-10},{step:4,value:-5}])!;
    assert.deepEqual(negative.x,[2,4]);
    assert.ok(negative.y[0]<-10&&negative.y[1]>-5&&negative.y[1]<0);
    assert.throws(()=>metricDomain([{step:1,value:NaN}]),/finite/);
});
