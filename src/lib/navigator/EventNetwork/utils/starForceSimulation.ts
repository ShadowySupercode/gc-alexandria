/**
 * Star Network Force Simulation
 * 
 * Custom force simulation optimized for star network layouts.
 * Provides stronger connections between star centers and their content nodes,
 * with specialized forces to maintain hierarchical structure.
 */

import * as d3 from "d3";
import type { NetworkNode, NetworkLink } from "../types";
import type { Simulation } from "./forceSimulation";
import { createTagGravityForce } from "./tagNetworkBuilder";

// Configuration for star network forces
const STAR_CENTER_CHARGE = -300;      // Stronger repulsion between star centers
const CONTENT_NODE_CHARGE = -50;      // Weaker repulsion for content nodes
const STAR_LINK_STRENGTH = 0.5;       // Moderate connection to star center
const INTER_STAR_LINK_STRENGTH = 0.2; // Weaker connection between stars
const STAR_LINK_DISTANCE = 80;        // Fixed distance from center to content
const INTER_STAR_DISTANCE = 200;      // Distance between star centers
const CENTER_GRAVITY = 0.02;          // Gentle pull toward canvas center
const STAR_CENTER_WEIGHT = 10;        // Weight multiplier for star centers

/**
 * Creates a custom force simulation for star networks
 */
export function createStarSimulation(
  nodes: NetworkNode[],
  links: NetworkLink[],
  width: number,
  height: number
): Simulation<NetworkNode, NetworkLink> {
  // Create the simulation
  const simulation = d3.forceSimulation(nodes) as any
  simulation
    .force("center", d3.forceCenter(width / 2, height / 2).strength(CENTER_GRAVITY))
    .velocityDecay(0.2) // Lower decay for more responsive simulation
    .alphaDecay(0.0001)  // Much slower alpha decay to prevent freezing
    .alphaMin(0.001);    // Keep minimum energy to prevent complete freeze

  // Custom charge force that varies by node type
  const chargeForce = d3.forceManyBody()
    .strength((d: NetworkNode) => {
      // Tag anchors don't repel
      if (d.isTagAnchor) {
        return 0;
      }
      // Star centers repel each other strongly
      if (d.isContainer && d.kind === 30040) {
        return STAR_CENTER_CHARGE;
      }
      // Content nodes have minimal repulsion
      return CONTENT_NODE_CHARGE;
    })
    .distanceMax(300); // Limit charge force range

  // Custom link force with variable strength and distance
  const linkForce = d3.forceLink(links)
    .id((d: NetworkNode) => d.id)
    .strength((link: any) => {
      const source = link.source as NetworkNode;
      const target = link.target as NetworkNode;
      // Strong connection from star center to its content
      if (source.kind === 30040 && target.kind === 30041) {
        return STAR_LINK_STRENGTH;
      }
      // Weaker connection between star centers
      if (source.kind === 30040 && target.kind === 30040) {
        return INTER_STAR_LINK_STRENGTH;
      }
      return 0.5; // Default strength
    })
    .distance((link: any) => {
      const source = link.source as NetworkNode;
      const target = link.target as NetworkNode;
      // Fixed distance for star-to-content links
      if (source.kind === 30040 && target.kind === 30041) {
        return STAR_LINK_DISTANCE;
      }
      // Longer distance between star centers
      if (source.kind === 30040 && target.kind === 30040) {
        return INTER_STAR_DISTANCE;
      }
      return 100; // Default distance
    });

  // Apply forces to simulation
  simulation
    .force("charge", chargeForce)
    .force("link", linkForce);

  // Custom radial force to keep content nodes around their star center
  simulation.force("radial", createRadialForce(nodes, links));
  
  // Add tag gravity force if there are tag anchors
  const hasTagAnchors = nodes.some(n => n.isTagAnchor);
  if (hasTagAnchors) {
    simulation.force("tagGravity", createTagGravityForce(nodes, links));
  }

  // Periodic reheat to prevent freezing
  let tickCount = 0;
  simulation.on("tick", () => {
    tickCount++;
    // Every 300 ticks, give a small energy boost to prevent freezing
    if (tickCount % 300 === 0 && simulation.alpha() < 0.01) {
      simulation.alpha(0.02);
    }
  });

  return simulation;
}

/**
 * Applies the radial force to keep content nodes in orbit around their star center
 * @param nodes - The array of network nodes
 * @param nodeToCenter - Map of content node IDs to their star center node
 * @param targetDistance - The desired distance from center to content node
 * @param alpha - The current simulation alpha
 */
function applyRadialForce(
  nodes: NetworkNode[],
  nodeToCenter: Map<string, NetworkNode>,
  targetDistance: number,
  alpha: number
): void {
  nodes.forEach(node => {
    if (node.kind === 30041) {
      const center = nodeToCenter.get(node.id);
      if (
        center &&
        center.x != null &&
        center.y != null &&
        node.x != null &&
        node.y != null
      ) {
        // Calculate desired position
        const dx = node.x - center.x;
        const dy = node.y - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // Normalize and apply force
          const force = (distance - targetDistance) * alpha * 0.3; // Reduced force
          node.vx = (node.vx || 0) - (dx / distance) * force;
          node.vy = (node.vy || 0) - (dy / distance) * force;
        }
      }
    }
  });
}

/**
 * Creates a custom radial force that keeps content nodes in orbit around their star center
 */
function createRadialForce(nodes: NetworkNode[], links: NetworkLink[]): any {
  // Build a map of content nodes to their star centers
  const nodeToCenter = new Map<string, NetworkNode>();

  links.forEach(link => {
    const source = link.source as NetworkNode;
    const target = link.target as NetworkNode;
    if (source.kind === 30040 && target.kind === 30041) {
      nodeToCenter.set(target.id, source);
    }
  });

  function force(alpha: number) {
    applyRadialForce(nodes, nodeToCenter, STAR_LINK_DISTANCE, alpha);
  }

  force.initialize = function(_: NetworkNode[]) {
    nodes = _;
  };

  return force;
}

/**
 * Applies initial positioning for star networks
 */
export function applyInitialStarPositions(
  nodes: NetworkNode[],
  links: NetworkLink[],
  width: number,
  height: number
): void {
  // Group nodes by their star centers
  const starGroups = new Map<string, NetworkNode[]>();
  const starCenters: NetworkNode[] = [];
  
  // Identify star centers
  nodes.forEach(node => {
    if (node.isContainer && node.kind === 30040) {
      starCenters.push(node);
      starGroups.set(node.id, []);
    }
  });

  // Assign content nodes to their star centers
  links.forEach(link => {
    const source = link.source as NetworkNode;
    const target = link.target as NetworkNode;
    if (source.kind === 30040 && target.kind === 30041) {
      const group = starGroups.get(source.id);
      if (group) {
        group.push(target);
      }
    }
  });

  // Position star centers in a grid or circle
  if (starCenters.length === 1) {
    // Single star - center it
    const center = starCenters[0];
    center.x = width / 2;
    center.y = height / 2;
    // Don't fix position initially - let simulation run naturally
  } else if (starCenters.length > 1) {
    // Multiple stars - arrange in a circle
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;
    const angleStep = (2 * Math.PI) / starCenters.length;
    
    starCenters.forEach((center, i) => {
      const angle = i * angleStep;
      center.x = centerX + radius * Math.cos(angle);
      center.y = centerY + radius * Math.sin(angle);
      // Don't fix position initially - let simulation adjust
    });
  }

  // Position content nodes around their star centers
  starGroups.forEach((contentNodes, centerId) => {
    const center = nodes.find(n => n.id === centerId);
    if (!center) return;
    
    const angleStep = (2 * Math.PI) / Math.max(contentNodes.length, 1);
    contentNodes.forEach((node, i) => {
      const angle = i * angleStep;
      node.x = (center.x || 0) + STAR_LINK_DISTANCE * Math.cos(angle);
      node.y = (center.y || 0) + STAR_LINK_DISTANCE * Math.sin(angle);
    });
  });
}

/**
 * Handler for the start of a drag event in the star network simulation.
 * Sets the fixed position of the node to its current position.
 * @param event - The drag event from d3
 * @param d - The node being dragged
 * @param simulation - The d3 force simulation instance
 */
function dragstarted(event: any, d: NetworkNode, simulation: Simulation<NetworkNode, NetworkLink>) {
  // If no other drag is active, set a low alpha target to keep the simulation running smoothly
  if (!event.active) {
    simulation.alphaTarget(0.1).restart();
  }
  // Set the node's fixed position to its current position
  d.fx = d.x;
  d.fy = d.y;
}

/**
 * Handler for the drag event in the star network simulation.
 * Updates the node's fixed position to follow the mouse.
 * @param event - The drag event from d3
 * @param d - The node being dragged
 */
function dragged(event: any, d: NetworkNode) {
  // Update the node's fixed position to the current mouse position
  d.fx = event.x;
  d.fy = event.y;
}

/**
 * Handler for the end of a drag event in the star network simulation.
 * Keeps the node fixed at its new position after dragging.
 * @param event - The drag event from d3
 * @param d - The node being dragged
 * @param simulation - The d3 force simulation instance
 */
function dragended(event: any, d: NetworkNode, simulation: Simulation<NetworkNode, NetworkLink>) {
  // If no other drag is active, lower the alpha target to let the simulation cool down
  if (!event.active) {
    simulation.alphaTarget(0);
  }
  // Keep the node fixed at its new position
  d.fx = event.x;
  d.fy = event.y;
}

/**
 * Custom drag handler for star networks
 * @param simulation - The d3 force simulation instance
 * @returns The d3 drag behavior
 */
export function createStarDragHandler(
  simulation: Simulation<NetworkNode, NetworkLink>
): any {
  // These handlers are now top-level functions, so we use closures to pass simulation to them.
  // This is a common pattern in JavaScript/TypeScript when you need to pass extra arguments to event handlers.
  return d3.drag()
    .on('start', function(event: any, d: NetworkNode) { dragstarted(event, d, simulation); })
    .on('drag', dragged)
    .on('end', function(event: any, d: NetworkNode) { dragended(event, d, simulation); });
}