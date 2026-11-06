import type {MetricPoint} from '@freemocap/client';

/** Preserve real units, including negative metrics and a single first observation. */
export function metricDomain(points:readonly MetricPoint[]):{x:[number,number];y:[number,number]}|null {
    if(!points.length)return null;
    let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity;
    for(const {step,value} of points){
        if(!Number.isFinite(step)||!Number.isFinite(value))throw new Error('Metrics must be finite');
        xMin=Math.min(xMin,step);xMax=Math.max(xMax,step);
        yMin=Math.min(yMin,value);yMax=Math.max(yMax,value);
    }
    if(xMin===xMax){xMin=Math.max(0,xMin-1);xMax=Math.max(xMin+1,xMax);}
    const padding=yMax===yMin?Math.max(Math.abs(yMax)*.05,1e-6):(yMax-yMin)*.1;
    return {x:[xMin,xMax],y:[yMin-padding,yMax+padding]};
}
