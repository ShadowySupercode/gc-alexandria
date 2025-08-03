/**
 * D3 Force Simulation Utilities
 * 
 * This module provides utilities for creating and managing D3 force-directed
 * graph simulations for the event network visualization.
 */

import type { NetworkNode, NetworkLink } from "../types";
import * as d3 from "d3";
import { createDebugFunction } from "./common";

// Configuration
const GRAVITY_STRENGTH = 0.05; // Strength of global gravity
const CONNECTED_GRAVITY_STRENGTH = 0.3; // Strength of gravity between connected nodes

// Debug function
const debug = createDebugFunction("ForceSimulation");

/**
 * Type definition for D3 force simulation
 * Provides type safety for simulation operations
 */
export interface Simulation<NodeType, LinkType> {
    nodes(): NodeType[];
    nodes(nodes: NodeType[]): this;
    alpha(): number;
    alpha(alpha: number): this;
    alphaTarget(): number;
    alphaTarget(target: number): this;
    restart(): this;
    stop(): this;
    tick(): this;
    on(type: string, listener: (this: this) => void): this;
    force(name: string): any;
    force(name: string, force: any): this;
}

/**
 * Type definition for D3 drag events
 * Provides type safety for drag operations
 */
export interface D3DragEvent<GElement extends Element, Datum, Subject> {
    active: number;
    sourceEvent: any;
    subject: Subject;
    x: number;
    y: number;
    dx: number;
    dy: number;
    identifier: string | number;
}

/**
 * Updates a node's velocity by applying a force
 * 
 * @param node - The node to update
 * @param deltaVx - Change in x velocity
 * @param deltaVy - Change in y velocity
 */
export function updateNodeVelocity(
    node: NetworkNode,
    deltaVx: number,
    deltaVy: number
) {
    debug("Updating node velocity", { 
        nodeId: node.id, 
        currentVx: node.vx, 
        currentVy: node.vy, 
        deltaVx, 
        deltaVy 
    });
    
    if (typeof node.vx === "number" && typeof node.vy === "number") {
        node.vx = node.vx - deltaVx;
        node.vy = node.vy - deltaVy;
        debug("New velocity", { nodeId: node.id, vx: node.vx, vy: node.vy });
    } else {
        debug("Node velocity not defined", { nodeId: node.id });
    }
}

/**
 * Applies a logarithmic gravity force pulling the node toward the center
 * 
 * The logarithmic scale ensures that nodes far from the center experience
 * stronger gravity, preventing them from drifting too far away.
 * 
 * @param node - The node to apply gravity to
 * @param centerX - X coordinate of the center
 * @param centerY - Y coordinate of the center
 * @param alpha - Current simulation alpha (cooling factor)
 */
export function applyGlobalLogGravity(
    node: NetworkNode,
    centerX: number,
    centerY: number,
    alpha: number,
) {
    // Tag anchors and person anchors should not be affected by gravity
    if (node.isTagAnchor || node.isPersonAnchor) return;
    
    const dx = (node.x ?? 0) - centerX;
    const dy = (node.y ?? 0) - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    const force = Math.log(distance + 1) * GRAVITY_STRENGTH * alpha;
    updateNodeVelocity(node, (dx / distance) * force, (dy / distance) * force);
}

/**
 * Applies gravity between connected nodes
 * 
 * This creates a cohesive force that pulls connected nodes toward their
 * collective center of gravity, creating more meaningful clusters.
 * 
 * @param node - The node to apply connected gravity to
 * @param links - All links in the network
 * @param alpha - Current simulation alpha (cooling factor)
 */
export function applyConnectedGravity(
    node: NetworkNode,
    links: NetworkLink[],
    alpha: number,
) {
    // Tag anchors and person anchors should not be affected by connected gravity
    if (node.isTagAnchor || node.isPersonAnchor) return;
    
    // Find all nodes connected to this node (excluding tag anchors and person anchors)
    const connectedNodes = links
        .filter(link => link.source.id === node.id || link.target.id === node.id)
        .map(link => link.source.id === node.id ? link.target : link.source)
        .filter(n => !n.isTagAnchor && !n.isPersonAnchor);

    if (connectedNodes.length === 0) return;

    // Calculate center of gravity of connected nodes
    const cogX = d3.mean(connectedNodes, (n: NetworkNode) => n.x);
    const cogY = d3.mean(connectedNodes, (n: NetworkNode) => n.y);

    if (cogX === undefined || cogY === undefined) return;

    // Calculate force direction and magnitude
    const dx = (node.x ?? 0) - cogX;
    const dy = (node.y ?? 0) - cogY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    // Apply force proportional to distance
    const force = distance * CONNECTED_GRAVITY_STRENGTH * alpha;
    updateNodeVelocity(node, (dx / distance) * force, (dy / distance) * force);
}

/**
 * Sets up drag behavior for nodes
 * 
 * This enables interactive dragging of nodes in the visualization.
 * 
 * @param simulation - The D3 force simulation
 * @param warmupClickEnergy - Alpha target when dragging starts (0-1)
 * @returns D3 drag behavior configured for the simulation
 */
export function setupDragHandlers(
    simulation: Simulation<NetworkNode, NetworkLink>,
    warmupClickEnergy: number = 0.9
) {
    return d3
        .drag()
        .on("start", (event: D3DragEvent<SVGGElement, NetworkNode, NetworkNode>, d: NetworkNode) => {
            // Tag anchors and person anchors retain their anchor behavior
            if (d.isTagAnchor || d.isPersonAnchor) {
                // Still allow dragging but maintain anchor status
                d.fx = d.x;
                d.fy = d.y;
                return;
            }
            
            // Warm up simulation if it's cooled down
            if (!event.active) {
                simulation.alphaTarget(warmupClickEnergy).restart();
            }
            // Fix node position at current location
            d.fx = d.x;
            d.fy = d.y;
        })
        .on("drag", (event: D3DragEvent<SVGGElement, NetworkNode, NetworkNode>, d: NetworkNode) => {
            // Update position for all nodes including anchors
            
            // Update fixed position to mouse position
            d.fx = event.x;
            d.fy = event.y;
        })
        .on("end", (event: D3DragEvent<SVGGElement, NetworkNode, NetworkNode>, d: NetworkNode) => {
            
            // Cool down simulation when drag ends
            if (!event.active) {
                simulation.alphaTarget(0);
            }
            
            // Keep all nodes fixed after dragging
            // This allows users to manually position any node type
            d.fx = d.x;
            d.fy = d.y;
        });
}

/**
 * Creates a D3 force simulation for the network
 * 
 * @param nodes - Array of network nodes
 * @param links - Array of network links
 * @param nodeRadius - Radius of node circles
 * @param linkDistance - Desired distance between linked nodes
 * @returns Configured D3 force simulation
 */
export function createSimulation(
    nodes: NetworkNode[],
    links: NetworkLink[],
    nodeRadius: number,
    linkDistance: number
): Simulation<NetworkNode, NetworkLink> {
    debug("Creating simulation", { 
        nodeCount: nodes.length, 
        linkCount: links.length,
        nodeRadius,
        linkDistance
    });
    
    try {
        // Create the simulation with nodes
        const simulation = d3
            .forceSimulation(nodes)
            .force(
                "link",
                d3.forceLink(links)
                    .id((d: NetworkNode) => d.id)
                    .distance(linkDistance * 0.1)
            )
            .force("collide", d3.forceCollide().radius(nodeRadius * 4));
        
        debug("Simulation created successfully");
        return simulation;
    } catch (error) {
        console.error("Error creating simulation:", error);
        throw error;
    }
}
