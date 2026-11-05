import type {ReactNode} from 'react';
import type {ProcessingPlan, TaskOperation} from '@freemocap/client';

/** Same typed ports/edges as the existing Core compiler; a workflow may include manual gates. */
export interface PipelineGraph {definition: ProcessingPlan['graph']; topological_order: string[]}
export interface PipelineStagePresentation {
    label: string;
    description: string;
    kind: 'source' | 'computation' | 'review' | 'publication';
    availability: 'available' | 'reusable' | 'manual' | 'unavailable' | 'unimplemented';
    reason: string;
    configuration?: ReactNode;
    summary?: ReactNode;
    artifacts?: string[];
}
export interface PipelinePanelProps {
    graph: PipelineGraph;
    nodePresentation: Readonly<Record<string, PipelineStagePresentation>>;
    view: 'graph' | 'list';
    onViewChange(view: 'graph' | 'list'): void;
    locked?: boolean;
    notice?: ReactNode;
    actions?: ReactNode;
    operations?: TaskOperation[];
    onOpenArtifact?(path: string): void;
}
export type NodeId = string;
export type DataKey = string;
export type NodeState = string;
export interface PortData {name: string; detail: string; description: string; colour: string}
export interface GraphNode {
    id: string; state: string; inputs: string[]; outputs: string[];
    presentation: PipelineStagePresentation; operation?: TaskOperation;
}
export interface ProcessingSection {id: string; number: number; title: string; content: ReactNode; presentation: PipelineStagePresentation}
export interface StageGraph {
    nodes: GraphNode[];
    data: Record<string, PortData>;
    wires: {id: string; source: string; target: string; sourcePort: string; targetPort: string; data: string; active: boolean}[];
}
const portKey = (node: string, direction: string, name: string) => JSON.stringify([node, direction, name]);
const palette = ['#86c2c5', '#c9a8e6', '#e7ba7b', '#a4c995', '#a3baf4'];
export function buildStageGraph(graph: PipelineGraph, metadata: PipelinePanelProps['nodePresentation'], operations: TaskOperation[] = []): StageGraph {
    const byId = new Map(graph.definition.nodes.map(node => [node.id, node]));
    if (!byId.size || byId.size !== graph.definition.nodes.length) throw new Error('Workflow requires unique stage IDs');
    const order = new Map(graph.topological_order.map((id, index) => [id, index]));
    if (order.size !== byId.size || order.size !== graph.topological_order.length || [...order.keys()].some(id => !byId.has(id))) throw new Error('Workflow order must contain every stage exactly once');
    const data: StageGraph['data'] = {};
    const colours = new Map<string, string>();
    const nodes = graph.topological_order.map(id => {
        const node = byId.get(id)!;
        const presentation = metadata[id];
        if (!presentation) throw new Error(`Missing presentation for stage ${id}`);
        const ports = (direction: 'in' | 'out') => {
            const list = direction === 'in' ? node.inputs : node.outputs;
            if (new Set(list.map(port => port.name)).size !== list.length) throw new Error(`Duplicate ports in ${id}`);
            return list.map(port => {
                const key = portKey(id, direction, port.name);
                const semantic = JSON.stringify(port.contract);
                if (!colours.has(semantic)) colours.set(semantic, palette[colours.size % palette.length]);
                data[key] = {name: port.name.replaceAll('_', ' '), detail: port.contract.units ?? '', colour: colours.get(semantic)!,
                    description: [port.contract.kind, port.contract.data_granularity, port.contract.namespace, port.contract.reference_frame, port.contract.units].filter(Boolean).join(' · ')};
                return key;
            });
        };
        const operation = operations.find(item => item.operation_id === id);
        return {id, inputs: ports('in'), outputs: ports('out'), presentation, operation, state: operation?.status ?? presentation.availability};
    });
    const boundInputs = new Set<string>();
    const wires = graph.definition.edges.map((edge, index) => {
        const sourcePort = portKey(edge.source.node, 'out', edge.source.port);
        const targetPort = portKey(edge.target.node, 'in', edge.target.port);
        if (!data[sourcePort] || !data[targetPort]) throw new Error('Workflow edge references an unknown port');
        if (order.get(edge.source.node)! >= order.get(edge.target.node)!) throw new Error('Workflow order violates a dependency');
        if (boundInputs.has(targetPort)) throw new Error('Workflow input has multiple bindings');
        boundInputs.add(targetPort);
        return {id: String(index), source: edge.source.node, target: edge.target.node, sourcePort, targetPort, data: sourcePort, active: true};
    });
    if (nodes.some(node => node.inputs.some(input => !boundInputs.has(input)))) throw new Error('Workflow has an unbound input');
    return {nodes, wires, data};
}
