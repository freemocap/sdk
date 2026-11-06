import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,PerspectiveCamera} from 'three';
import {coverageGeometry,colorCoverage,viewRotation} from './coverage-geometry';

test('coverage cells cover the unit sphere in supplied z-major azimuth order',()=>{
    const az=12,zBands=6,g=coverageGeometry(az,zBands),p=g.getAttribute('position');
    assert.equal(p.count,az*zBands*96);
    for(let cell=0;cell<az*zBands;cell++){
        const zi=Math.floor(cell/az),ai=cell%az;
        for(let i=cell*96;i<(cell+1)*96;i++){
            const v=new Vector3().fromBufferAttribute(p,i);assert.ok(Math.abs(v.length()-1)<1e-6);
            assert.ok(v.z>=-1+2*zi/zBands-1e-6&&v.z<=-1+2*(zi+1)/zBands+1e-6);
            if(Math.hypot(v.x,v.y)>1e-6){let phi=Math.atan2(v.y,v.x);if(phi<0)phi+=2*Math.PI;
                if(ai===11&&phi<1e-6)phi=2*Math.PI;
                assert.ok(phi>=2*Math.PI*ai/az-1e-6&&phi<=2*Math.PI*(ai+1)/az+1e-6);
            }
        }
    }
    g.dispose();
});
test('count updates reuse geometry and color buffers and reject misleading values',()=>{
    const g=coverageGeometry(12,6),position=g.getAttribute('position'),color=g.getAttribute('color');
    const counts=Array(72).fill(0);counts[0]=10;assert.equal(colorCoverage(g,counts),10);
    assert.notDeepEqual(Array.from(color.array.slice(0,3)),Array.from(color.array.slice(96*3,96*3+3)));
    counts[1]=5;colorCoverage(g,counts);assert.equal(g.getAttribute('position'),position);assert.equal(g.getAttribute('color'),color);
    assert.throws(()=>colorCoverage(g,[1]));counts[3]=NaN;assert.throws(()=>colorCoverage(g,counts));
    assert.throws(()=>coverageGeometry(0,6));g.dispose();
});
test('view rotation is row-major, ignores camera translation and preserves directions',()=>{
    const camera=new PerspectiveCamera();camera.up.set(0,0,1);camera.position.set(3,4,2);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const r=viewRotation(camera.matrixWorldInverse),v=new Vector3(.2,.3,.4).normalize();
    const actual=new Vector3(r[0]*v.x+r[1]*v.y+r[2]*v.z,r[3]*v.x+r[4]*v.y+r[5]*v.z,r[6]*v.x+r[7]*v.y+r[8]*v.z);
    const expected=v.clone().transformDirection(camera.matrixWorldInverse);assert.ok(actual.distanceTo(expected)<1e-12);
    const translated=new Matrix4().copy(camera.matrixWorldInverse);translated.elements[12]+=33;
    assert.deepEqual(viewRotation(translated),r);assert.ok(Math.abs(actual.length()-1)<1e-12);
});
