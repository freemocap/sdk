import {useCallback,useRef} from 'react';
import * as d3 from 'd3';
import type {MetricPoint,MetricSeries} from '@freemocap/client';
import BaseD3ChartView,{type ChartScaffolding} from './BaseD3ChartView';
import {applyAxisStyles,darkChartTheme} from './d3ChartUtils';
import {metricDomain} from './metric-domain';

const MARGIN={top:12,right:18,bottom:44,left:64};
export interface MetricSeriesChartProps {series:MetricSeries;color?:string;height?:number;}

/** Core's persistent D3 chart, with application-supplied scalar units and step identity. */
export function MetricSeriesChart({series,color='var(--color-info)',height=180}:MetricSeriesChartProps){
    const current=useRef({series,color});current.current={series,color};
    const initChart=useCallback(({svg,chartArea}:ChartScaffolding)=>{
        chartArea.append('path').attr('class','metric-line').attr('fill','none').attr('stroke-width',2);
        chartArea.append('circle').attr('class','metric-latest').attr('r',3);
        svg.append('text').attr('class','metric-x-label').attr('text-anchor','middle');
        svg.append('text').attr('class','metric-y-label').attr('text-anchor','middle').attr('transform','rotate(-90)');
    },[]);
    const updateChart=useCallback(({svg,chartArea,xAxisG,yAxisG,width,height}:ChartScaffolding)=>{
        const {series:latest,color:stroke}=current.current;
        const domain=metricDomain(latest.points);
        const path=chartArea.select<SVGPathElement>('.metric-line');
        const dot=chartArea.select<SVGCircleElement>('.metric-latest');
        if(!domain){path.attr('d',null);dot.style('display','none');return;}
        const x=d3.scaleLinear().domain(domain.x).range([0,width]);
        const y=d3.scaleLinear().domain(domain.y).range([height,0]);
        xAxisG.call(d3.axisBottom(x).ticks(Math.max(2,Math.floor(width/90))).tickSize(-height));
        yAxisG.call(d3.axisLeft(y).ticks(Math.max(2,Math.floor(height/45))).tickSize(-width));
        applyAxisStyles(svg,darkChartTheme);
        path.attr('stroke',stroke).attr('d',d3.line<MetricPoint>().x(p=>x(p.step)).y(p=>y(p.value))(latest.points));
        const point=latest.points.at(-1)!;
        dot.style('display',null).attr('fill',stroke).attr('cx',x(point.step)).attr('cy',y(point.value));
        svg.select('.metric-x-label').attr('x',width/2).attr('y',height+36).text(latest.step_label);
        svg.select('.metric-y-label').attr('x',-height/2).attr('y',-52).text(latest.unit);
        svg.selectAll('.metric-x-label,.metric-y-label').style('fill',darkChartTheme.textSecondaryColor)
            .style('font-family','var(--font-mono)').style('font-size','11px');
    },[]);
    const last=series.points.at(-1);
    const latestValue=last?`${d3.format('.5~g')(last.value)} ${series.unit}`:'Waiting for data';
    return <section className="sdk-metric-card" aria-label={series.label}>
        <header className="sdk-metric-heading"><strong title={series.label}>{series.label}</strong><span title={latestValue}>{latestValue}</span></header>
        <div className="sdk-metric-plot" style={{height}}><BaseD3ChartView ariaLabel={`${series.label} by ${series.step_label}, ${series.unit}`} initChart={initChart} updateChart={updateChart} margin={MARGIN}/></div>
        <footer>{last?`${series.step_label} ${last.step}`:'No observations yet'}
            {series.omitted_points>0&&<span>Showing latest {series.points.length} observations · {series.omitted_points} earlier</span>}
        </footer>
    </section>;
}
