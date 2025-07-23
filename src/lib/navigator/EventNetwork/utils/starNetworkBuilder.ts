/**
 * Star Network Builder for NKBIP-01 Events
 * 
 * This module provides utilities for building star network visualizations specifically
 * for NKBIP-01 events (kinds 30040 and 30041). Unlike the sequential network builder,
 * this creates star formations where index events (30040) are central nodes with 
 * content events (30041) arranged around them.
 */

import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type { NetworkNode, NetworkLink, GraphData, GraphState } from "../types";
import { getMatchingTags } from '$lib/utils/nostrUtils';
import { createNetworkNode, createEventMap, extractEventIdFromATag, getEventColor } from './networkBuilder';
import { createDebugFunction } from './common';
import { wikiKind, indexKind, zettelKinds } from '$lib/consts';


// Debug function
const debug = createDebugFunction("StarNetworkBuilder");

/**
 * Represents a star network with a central index node and peripheral content nodes
 */
export interface StarNetwork {
  center: NetworkNode;           // Central index node (30040)
  peripheralNodes: NetworkNode[]; // Content nodes (30041) and connected indices (30040)
  links: NetworkLink[];          // Links within this star
}

/**
 * Creates a star network from an index event and its references
 * 
 * @param indexEvent - The central index event (30040)
 * @param state - Current graph state
 * @param level - Hierarchy level for this star
 * @returns A star network structure
 */
export function createStarNetwork(
  indexEvent: NDKEvent,
  state: GraphState,
  level: number = 0
): StarNetwork | null {
  debug("Creating star network", { indexId: indexEvent.id, level });
  
  const centerNode = state.nodeMap.get(indexEvent.id);
  if (!centerNode) {
    debug("Center node not found for index event", indexEvent.id);
    return null;
  }

  // Set the center node level
  centerNode.level = level;
  
  // Extract referenced event IDs from 'a' tags
  const referencedIds = getMatchingTags(indexEvent, "a")
    .map(tag => extractEventIdFromATag(tag))
    .filter((id): id is string => id !== null);

  debug("Found referenced IDs", { count: referencedIds.length, ids: referencedIds });

  // Get peripheral nodes (both content and nested indices)
  const peripheralNodes: NetworkNode[] = [];
  const links: NetworkLink[] = [];

  referencedIds.forEach(id => {
    const node = state.nodeMap.get(id);
    if (node) {
      // Set the peripheral node level
      node.level += 1;
      peripheralNodes.push(node);
      
      // Create link from center to peripheral node
      links.push({
        source: centerNode,
        target: node,
        isSequential: false // Star links are not sequential
      });
      
      debug("Added peripheral node", { nodeId: id, nodeType: node.type });
    }
  });

  return {
    center: centerNode,
    peripheralNodes,
    links
  };
}

/**
 * Processes all index events to create star networks
 * 
 * @param events - Array of all events
 * @param maxLevel - Maximum nesting level to process
 * @returns Array of star networks
 */
export function createStarNetworks(
  events: NDKEvent[],
  maxLevel: number,
  existingNodeMap?: Map<string, NetworkNode>
): StarNetwork[] {
  debug("Creating star networks", { eventCount: events.length, maxLevel });
  
  // Use existing node map or create new one
  const nodeMap = existingNodeMap || new Map<string, NetworkNode>();
  const eventMap = createEventMap(events);

  // Create nodes for all events if not using existing map
  if (!existingNodeMap) {
    events.forEach(event => {
      if (!event.id) return;
      const node = createNetworkNode(event);
      nodeMap.set(event.id, node);
    });
  }

  const state: GraphState = {
    nodeMap,
    links: [],
    eventMap,
    referencedIds: new Set<string>()
  };

  // Find all index events and non-publication events
  const publicationKinds = [wikiKind, indexKind, ...zettelKinds];
  const indexEvents = events.filter(event => event.kind === indexKind);
  const nonPublicationEvents = events.filter(event => 
    event.kind !== undefined && !publicationKinds.includes(event.kind)
  );
  
  debug("Found index events", { count: indexEvents.length });
  debug("Found non-publication events", { count: nonPublicationEvents.length });

  const starNetworks: StarNetwork[] = [];
  const processedIndices = new Set<string>();

  // Process all index events regardless of level
  indexEvents.forEach(indexEvent => {
    if (!indexEvent.id || processedIndices.has(indexEvent.id)) return;

    const star = createStarNetwork(indexEvent, state, 0);
    if (star && star.peripheralNodes.length > 0) {
      starNetworks.push(star);
      processedIndices.add(indexEvent.id);
      debug("Created star network", { 
        centerId: star.center.id, 
        peripheralCount: star.peripheralNodes.length
      });
    }
  });
  
  // Add non-publication events as standalone nodes (stars with no peripherals)
  nonPublicationEvents.forEach(event => {
    if (!event.id || !nodeMap.has(event.id)) return;
    
    const node = nodeMap.get(event.id)!;
    const star: StarNetwork = {
      center: node,
      peripheralNodes: [],
      links: []
    };
    starNetworks.push(star);
    debug("Created standalone star for non-publication event", { 
      eventId: event.id,
      kind: event.kind
    });
  });

  return starNetworks;
}

/**
 * Creates inter-star connections between star networks
 * 
 * @param starNetworks - Array of star networks
 * @returns Additional links connecting different star networks
 */
export function createInterStarConnections(starNetworks: StarNetwork[]): NetworkLink[] {
  debug("Creating inter-star connections", { starCount: starNetworks.length });
  
  const interStarLinks: NetworkLink[] = [];
  
  // Create a map of center nodes for quick lookup
  const centerNodeMap = new Map<string, NetworkNode>();
  starNetworks.forEach(star => {
    centerNodeMap.set(star.center.id, star.center);
  });

  // For each star, check if any of its peripheral nodes are centers of other stars
  starNetworks.forEach(star => {
    star.peripheralNodes.forEach(peripheralNode => {
      // If this peripheral node is the center of another star, create an inter-star link
      if (peripheralNode.isContainer && centerNodeMap.has(peripheralNode.id)) {
        const targetStar = starNetworks.find(s => s.center.id === peripheralNode.id);
        if (targetStar) {
          interStarLinks.push({
            source: star.center,
            target: targetStar.center,
            isSequential: false
          });
          debug("Created inter-star connection", { 
            from: star.center.id, 
            to: targetStar.center.id 
          });
        }
      }
    });
  });

  return interStarLinks;
}

/**
 * Applies star-specific positioning to nodes using a radial layout
 * 
 * @param starNetworks - Array of star networks
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function applyStarLayout(
  starNetworks: StarNetwork[],
  width: number,
  height: number
): void {
  debug("Applying star layout", { 
    starCount: starNetworks.length, 
    dimensions: { width, height } 
  });

  const centerX = width / 2;
  const centerY = height / 2;
  
  // If only one star, center it
  if (starNetworks.length === 1) {
    const star = starNetworks[0];
    
    // Position center node
    star.center.x = centerX;
    star.center.y = centerY;
    star.center.fx = centerX; // Fix center position
    star.center.fy = centerY;
    
    // Position peripheral nodes in a circle around center
    const radius = Math.min(width, height) * 0.25;
    const angleStep = (2 * Math.PI) / star.peripheralNodes.length;
    
    star.peripheralNodes.forEach((node, index) => {
      const angle = index * angleStep;
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
    });
    
    return;
  }

  // For multiple stars, arrange them in a grid or circle
  const starsPerRow = Math.ceil(Math.sqrt(starNetworks.length));
  const starSpacingX = width / (starsPerRow + 1);
  const starSpacingY = height / (Math.ceil(starNetworks.length / starsPerRow) + 1);

  starNetworks.forEach((star, index) => {
    const row = Math.floor(index / starsPerRow);
    const col = index % starsPerRow;
    
    const starCenterX = (col + 1) * starSpacingX;
    const starCenterY = (row + 1) * starSpacingY;
    
    // Position center node
    star.center.x = starCenterX;
    star.center.y = starCenterY;
    star.center.fx = starCenterX; // Fix center position
    star.center.fy = starCenterY;
    
    // Position peripheral nodes around this star's center
    const radius = Math.min(starSpacingX, starSpacingY) * 0.3;
    const angleStep = (2 * Math.PI) / Math.max(star.peripheralNodes.length, 1);
    
    star.peripheralNodes.forEach((node, nodeIndex) => {
      const angle = nodeIndex * angleStep;
      node.x = starCenterX + radius * Math.cos(angle);
      node.y = starCenterY + radius * Math.sin(angle);
    });
  });
}

/**
 * Generates a complete star network graph from events
 * 
 * @param events - Array of Nostr events
 * @param maxLevel - Maximum hierarchy level to process
 * @returns Complete graph data with star network layout
 */
export function generateStarGraph(
  events: NDKEvent[],
  maxLevel: number
): GraphData {
  debug("Generating star graph", { eventCount: events.length, maxLevel });
  
  // Guard against empty events
  if (!events || events.length === 0) {
    return { nodes: [], links: [] };
  }
  
  // Initialize all nodes first
  const nodeMap = new Map<string, NetworkNode>();
  events.forEach(event => {
    if (!event.id) return;
    const node = createNetworkNode(event);
    nodeMap.set(event.id, node);
  });
  
  // Create star networks with the existing node map
  const starNetworks = createStarNetworks(events, maxLevel, nodeMap);
  
  // Create inter-star connections
  const interStarLinks = createInterStarConnections(starNetworks);
  
  // Collect nodes that are part of stars
  const nodesInStars = new Set<string>();
  const allLinks: NetworkLink[] = [];
  
  // Add nodes and links from all stars
  starNetworks.forEach(star => {
    nodesInStars.add(star.center.id);
    star.peripheralNodes.forEach(node => {
      nodesInStars.add(node.id);
    });
    allLinks.push(...star.links);
  });
  
  // Add inter-star links
  allLinks.push(...interStarLinks);
  
  // Include orphaned nodes (those not in any star)
  const allNodes: NetworkNode[] = [];
  nodeMap.forEach((node, id) => {
    allNodes.push(node);
  });
  
  const result = {
    nodes: allNodes,
    links: allLinks
  };
  
  debug("Star graph generation complete", { 
    nodeCount: result.nodes.length, 
    linkCount: result.links.length,
    starCount: starNetworks.length,
    orphanedNodes: allNodes.length - nodesInStars.size
  });
  
  return result;
}