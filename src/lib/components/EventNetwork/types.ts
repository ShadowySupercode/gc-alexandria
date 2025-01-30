import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type * as d3 from "d3";

export interface NetworkNode extends d3.SimulationNodeDatum {
    id: string;
    event?: NDKEvent;
    level: number;
    kind: number;
    title: string;
    content: string;
    author: string;
    type: "Index" | "Content";
    naddr?: string;
    nevent?: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
    isContainer?: boolean;
}

export interface NetworkLink extends d3.SimulationLinkDatum<NetworkNode> {
    source: NetworkNode;
    target: NetworkNode;
    isSequential: boolean;
}

export interface GraphData {
    nodes: NetworkNode[];
    links: NetworkLink[];
}

export interface GraphState {
    nodeMap: Map<string, NetworkNode>;
    links: NetworkLink[];
    eventMap: Map<string, NDKEvent>;
    referencedIds: Set<string>;
}