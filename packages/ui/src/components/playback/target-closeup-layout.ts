export interface CloseupLayout {x:number;y:number;size:number}
export interface CloseupSurface {width:number;height:number;topInset?:number;aspect?:number}
export type CloseupEdge='n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw';
export function clampCloseup(value:CloseupLayout,surface:CloseupSurface):CloseupLayout {
    const aspect=surface.aspect??1;
    const maximum=Math.max(0,Math.min(surface.width-12,(surface.height-12-(surface.topInset??0))*aspect));
    const size=Math.max(Math.min(120,surface.height*.45*aspect,maximum),Math.min(value.size,maximum));
    return {size,x:Math.max(6,Math.min(value.x,surface.width-size-6)),
        y:Math.max(6+(surface.topInset??0),Math.min(value.y,surface.height-size/aspect-6))};
}
export function initialCloseup(surface:CloseupSurface):CloseupLayout {
    const aspect=surface.aspect??1;
    const size=Math.min(300,surface.width*.9,surface.height*.45*aspect);
    return clampCloseup({size,x:(surface.width-size)/2,y:surface.height-size/aspect-8},surface);
}
/** Resize about the opposite edge/corner; single edges preserve the orthogonal center. */
export function resizeCloseup(old:CloseupLayout,edge:CloseupEdge,dx:number,dy:number,surface:CloseupSurface):CloseupLayout {
    const aspect=surface.aspect??1,height=old.size/aspect;
    const horizontal=edge.includes('w')?-1:edge.includes('e')?1:0;
    const vertical=edge.includes('n')?-1:edge.includes('s')?1:0;
    const delta=horizontal&&vertical?(Math.abs(dx)>Math.abs(dy)?dx*horizontal:dy*vertical*aspect):horizontal?dx*horizontal:dy*vertical*aspect;
    const cx=old.x+old.size/2,cy=old.y+height/2,top=6+(surface.topInset??0);
    const maxWidth=horizontal>0?surface.width-old.x-6:horizontal<0?old.x+old.size-6:2*Math.min(cx-6,surface.width-6-cx);
    const maxHeight=vertical>0?surface.height-old.y-6:vertical<0?old.y+height-top:2*Math.min(cy-top,surface.height-6-cy);
    const maximum=Math.max(0,Math.min(maxWidth,maxHeight*aspect));
    const size=Math.max(Math.min(120,surface.height*.45*aspect,maximum),Math.min(old.size+delta,maximum));
    return clampCloseup({size,x:horizontal<0?old.x+old.size-size:horizontal>0?old.x:cx-size/2,
        y:vertical<0?old.y+height-size/aspect:vertical>0?old.y:cy-size/aspect/2},surface);
}
