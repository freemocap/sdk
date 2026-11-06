export interface CloseupLayout {x:number;y:number;size:number}
export interface CloseupSurface {width:number;height:number;topInset?:number}
export const CLOSEUP_HEADER=28;
export function clampCloseup(value:CloseupLayout,surface:CloseupSurface):CloseupLayout {
    const maximum=Math.max(0,Math.min(surface.width-12,surface.height-CLOSEUP_HEADER-12-(surface.topInset??0)));
    const size=Math.max(Math.min(120,maximum),Math.min(value.size,maximum));
    return {size,x:Math.max(6,Math.min(value.x,surface.width-size-6)),
        y:Math.max(6+(surface.topInset??0),Math.min(value.y,surface.height-size-CLOSEUP_HEADER-6))};
}
export function initialCloseup(surface:CloseupSurface):CloseupLayout {
    const size=Math.min(300,surface.width*.8,surface.height*.55);
    return clampCloseup({size,x:surface.width-size-8,y:surface.height-size-CLOSEUP_HEADER-24},surface);
}
