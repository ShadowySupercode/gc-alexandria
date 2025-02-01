import * as d3 from "d3";
import type { NetworkNode, NetworkLink } from "./types";
import { updateNodeVelocity } from "./nodeUtils";

export function applyGlobalLogGravity(
    node: NetworkNode,
    centerX: number,
    centerY: number,
    alpha: number,
) {
    const dx = (node.x ?? 0) - centerX;
    const dy = (node.y ?? 0) - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    const force = Math.log(distance + 1) * 0.05 * alpha;
    updateNodeVelocity(node, (dx / distance) * force, (dy / distance) * force);
}

export function applyConnectedGravity(
    node: NetworkNode,
    links: NetworkLink[],
    alpha: number,
) {
    const connectedNodes = links
        .filter(
            (link) => link.source.id === node.id || link.target.id === node.id,
        )
        .map((link) => (link.source.id === node.id ? link.target : link.source));

    if (connectedNodes.length === 0) return;

    const cogX = d3.mean(connectedNodes, (n) => n.x);
    const cogY = d3.mean(connectedNodes, (n) => n.y);

    if (cogX === undefined || cogY === undefined) return;

    const dx = (node.x ?? 0) - cogX;
    const dy = (node.y ?? 0) - cogY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    const force = distance * 0.3 * alpha;
    updateNodeVelocity(node, (dx / distance) * force, (dy / distance) * force);
}

export function setupDragHandlers(
    simulation: d3.Simulation<NetworkNode, NetworkLink>,
    warmupClickEnergy: number,
) {
    return d3
        .drag<SVGGElement, NetworkNode>()
        .on(
            "start",
            (
                event: d3.D3DragEvent<SVGGElement, NetworkNode, NetworkNode>,
                d: NetworkNode,
            ) => {
                if (!event.active)
                    simulation.alphaTarget(warmupClickEnergy).restart();
                d.fx = d.x;
                d.fy = d.y;
            },
        )
        .on(
            "drag",
            (
                event: d3.D3DragEvent<SVGGElement, NetworkNode, NetworkNode>,
                d: NetworkNode,
            ) => {
                d.fx = event.x;
                d.fy = event.y;
            },
        )
        .on(
            "end",
            (
                event: d3.D3DragEvent<SVGGElement, NetworkNode, NetworkNode>,
                d: NetworkNode,
            ) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            },
        );
}