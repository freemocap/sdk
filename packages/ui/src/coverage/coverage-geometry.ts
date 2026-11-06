import {BufferGeometry,Float32BufferAttribute,Color,type Matrix4} from 'three';

/** Cells are indexed zBand * azimuthBins + azimuth; z is the unit sphere's height. */
export function coverageGeometry(azimuthBins:number,zBins:number):BufferGeometry {
    if(!Number.isInteger(azimuthBins)||azimuthBins<1||!Number.isInteger(zBins)||zBins<1||azimuthBins*zBins>8192)
        throw new Error('Coverage grid must contain 1–8192 cells');
    const positions:number[]=[];
    const point=(phi:number,z:number)=>{const r=Math.sqrt(Math.max(0,1-z*z));return [r*Math.cos(phi),r*Math.sin(phi),z];};
    const subdivisions=4;
    for(let zi=0;zi<zBins;zi++)for(let ai=0;ai<azimuthBins;ai++) {
        for(let j=0;j<subdivisions;j++)for(let i=0;i<subdivisions;i++) {
            const p0=2*Math.PI*(ai+i/subdivisions)/azimuthBins,p1=2*Math.PI*(ai+(i+1)/subdivisions)/azimuthBins;
            const z0=-1+2*(zi+j/subdivisions)/zBins,z1=-1+2*(zi+(j+1)/subdivisions)/zBins;
            const a=point(p0,z0),b=point(p1,z0),c=point(p1,z1),d=point(p0,z1);
            positions.push(...a,...b,...c,...a,...c,...d);
        }
    }
    const geometry=new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new Float32BufferAttribute(new Float32Array(positions.length),3));
    return geometry;
}

export function colorCoverage(geometry:BufferGeometry,counts:readonly number[]):number {
    const colors=geometry.getAttribute('color');
    if(counts.length*96!==colors.count||counts.some(n=>!Number.isFinite(n)||n<0||!Number.isInteger(n)))
        throw new Error('Coverage counts must be nonnegative integers, one per cell');
    const max=Math.max(0,...counts),empty=new Color('#40505b'),low=new Color('#167e91'),high=new Color('#f3c85e');
    const color=new Color();
    for(let cell=0;cell<counts.length;cell++) {
        if(!counts[cell])color.copy(empty);else color.copy(low).lerp(high,max===1?1:(counts[cell]-1)/(max-1));
        for(let vertex=cell*96;vertex<(cell+1)*96;vertex++)colors.setXYZ(vertex,color.r,color.g,color.b);
    }
    colors.needsUpdate=true;return max;
}

/** Three matrices store columns; consumers receive row-major object/world-to-view rotation. */
export function viewRotation(matrix:Matrix4):number[] {
    const e=matrix.elements;return [e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]];
}

/** Thin surface strips keep empty/equal-count cell boundaries visible; back faces are culled. */
export function coverageGridGeometry(azimuthBins:number,zBins:number):BufferGeometry {
    const positions:number[]=[];
    const point=(phi:number,z:number)=>{const r=Math.sqrt(Math.max(0,1-z*z));return [r*Math.cos(phi),r*Math.sin(phi),z];};
    const quad=(p0:number,p1:number,z0:number,z1:number)=>{
        const a=point(p0,z0),b=point(p1,z0),c=point(p1,z1),d=point(p0,z1);
        positions.push(...a,...b,...c,...a,...c,...d);
    };
    const dp=2*Math.PI/azimuthBins*.007,dz=2/zBins*.007;
    for(let a=0;a<azimuthBins;a++)for(let z=0;z<zBins*4;z++) {
        const phi=2*Math.PI*a/azimuthBins;quad(phi-dp,phi+dp,-1+2*z/(zBins*4),-1+2*(z+1)/(zBins*4));
    }
    for(let z=1;z<zBins;z++)for(let a=0;a<azimuthBins*4;a++) {
        const height=-1+2*z/zBins;quad(2*Math.PI*a/(azimuthBins*4),2*Math.PI*(a+1)/(azimuthBins*4),height-dz,height+dz);
    }
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));return geometry;
}
