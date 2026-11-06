// src/components/framerate-viewer/d3ChartUtils.ts
import * as d3 from "d3"

export type ChartTheme = {
    dividerColor: string
    textSecondaryColor: string
    textDisabledColor: string
    backgroundPaperColor: string
}

export const darkChartTheme: ChartTheme = {
    dividerColor: "rgba(255,255,255,0.12)",
    textSecondaryColor: "rgba(255,255,255,0.6)",
    textDisabledColor: "rgba(255,255,255,0.3)",
    backgroundPaperColor: "#1e1e2e",
}

export function applyAxisStyles(
    svg: d3.Selection<SVGGElement, unknown, null, undefined>,
    theme: ChartTheme = darkChartTheme
): void {
    svg.selectAll(".tick line")
        .attr("stroke", theme.dividerColor)
        .attr("stroke-dasharray", "2,2")

    svg.selectAll(".tick text")
        .style("font-family", "var(--font-mono)")
        .style("font-size", "10px")
        .style("color", theme.textSecondaryColor)
}
