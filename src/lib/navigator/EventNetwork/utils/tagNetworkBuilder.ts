/**
 * Tag Network Builder
 *
 * Enhances network visualizations with tag anchor nodes that act as gravity points
 * for nodes sharing the same tags.
 */

import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type { NetworkNode, NetworkLink, GraphData } from "../types";
import { getDisplayNameSync } from "$lib/utils/profileCache";
import { SeededRandom, createDebugFunction } from "./common";

// Configuration
const TAG_ANCHOR_RADIUS = 15;
// TODO: Move this to settings panel for user control
const TAG_ANCHOR_PLACEMENT_RADIUS = 1250; // Radius from center within which to randomly place tag anchors

// Debug function
const debug = createDebugFunction("TagNetworkBuilder");


/**
 * Creates a deterministic seed from a string
 */
function createSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Color mapping for tag anchor nodes
 */
export function getTagAnchorColor(tagType: string): string {
  switch (tagType) {
    case "t":
      return "#eba5a5"; // Blue for hashtags
    case "p":
      return "#10B981"; // Green for people
    case "author":
      return "#8B5CF6"; // Purple for authors
    case "e":
      return "#F59E0B"; // Yellow for events
    case "a":
      return "#EF4444"; // Red for articles
    case "kind3":
      return "#06B6D4"; // Cyan for follow lists
    default:
      return "#6B7280"; // Gray for others
  }
}

/**
 * Extracts unique tags from events for a specific tag type
 */
export function extractUniqueTagsForType(
  events: NDKEvent[],
  tagType: string,
): Map<string, Set<string>> {
  // Map of tagValue -> Set of event IDs
  const tagMap = new Map<string, Set<string>>();
  debug("Extracting unique tags for type", { tagType, eventCount: events.length });

  events.forEach((event) => {
    if (!event.tags || !event.id) return;

    event.tags.forEach((tag) => {
      if (tag.length < 2) return;

      if (tag[0] !== tagType) return;
      const tagValue = tag[1];

      if (!tagValue) return;

      if (!tagMap.has(tagValue)) {
        tagMap.set(tagValue, new Set());
      }

      tagMap.get(tagValue)!.add(event.id);
    });
  });
  
  debug("Extracted tags", { tagCount: tagMap.size });

  return tagMap;
}

/**
 * Creates tag anchor nodes from extracted tags of a specific type
 */
export function createTagAnchorNodes(
  tagMap: Map<string, Set<string>>,
  tagType: string,
  width: number,
  height: number,
): NetworkNode[] {
  const anchorNodes: NetworkNode[] = [];

  debug("Creating tag anchor nodes", { tagType, tagCount: tagMap.size });

  // Calculate positions for tag anchors randomly within radius
  // Show all tags regardless of how many events they appear in
  const minEventCount = 1;
  let validTags = Array.from(tagMap.entries()).filter(
    ([_, eventIds]) => eventIds.size >= minEventCount,
  );

  if (validTags.length === 0) return [];
  
  // Sort all tags by number of connections (events) descending
  validTags.sort((a, b) => b[1].size - a[1].size);

  validTags.forEach(([tagValue, eventIds]) => {
    // Position anchors randomly within a radius from the center
    const centerX = width / 2;
    const centerY = height / 2;

    // Create seeded random generator based on tag type and value for consistent positioning
    const seedString = `${tagType}-${tagValue}`;
    const rng = new SeededRandom(createSeed(seedString));

    // Generate deterministic position within the defined radius
    const angle = rng.next() * 2 * Math.PI;
    const distance = rng.next() * TAG_ANCHOR_PLACEMENT_RADIUS;
    const x = centerX + distance * Math.cos(angle);
    const y = centerY + distance * Math.sin(angle);

    // Format the display title based on tag type
    let displayTitle = tagValue;
    if (tagType === "t") {
      displayTitle = tagValue.startsWith("#") ? tagValue : `#${tagValue}`;
    } else if (tagType === "author") {
      displayTitle = tagValue;
    } else if (tagType === "p") {
      // Use display name for pubkey
      displayTitle = getDisplayNameSync(tagValue);
    }

    const anchorNode: NetworkNode = {
      id: `tag-anchor-${tagType}-${tagValue}`,
      title: displayTitle,
      content: `${eventIds.size} events`,
      author: "",
      kind: 0, // Special kind for tag anchors
      type: "TagAnchor",
      level: -1, // Tag anchors are outside the hierarchy
      isTagAnchor: true,
      tagType,
      tagValue,
      connectedNodes: Array.from(eventIds),
      x,
      y,
      fx: x, // Fix position
      fy: y,
    };

    anchorNodes.push(anchorNode);
  });

  debug("Created tag anchor nodes", { count: anchorNodes.length });
  return anchorNodes;
}

/**
 * Creates invisible links between tag anchors and nodes that have those tags
 */
export function createTagLinks(
  tagAnchors: NetworkNode[],
  nodes: NetworkNode[],
): NetworkLink[] {
  debug("Creating tag links", { anchorCount: tagAnchors.length, nodeCount: nodes.length });
  
  const links: NetworkLink[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  tagAnchors.forEach((anchor) => {
    if (!anchor.connectedNodes) return;

    anchor.connectedNodes.forEach((nodeId) => {
      const node = nodeMap.get(nodeId);
      if (node) {
        links.push({
          source: anchor,
          target: node,
          isSequential: false,
        });
      }
    });
  });

  debug("Created tag links", { linkCount: links.length });
  return links;
}

/**
 * Enhances a graph with tag anchor nodes for a specific tag type
 */
export function enhanceGraphWithTags(
  graphData: GraphData,
  events: NDKEvent[],
  tagType: string,
  width: number,
  height: number,
  displayLimit?: number,
): GraphData {
  debug("Enhancing graph with tags", { tagType, displayLimit });
  
  // Extract unique tags for the specified type
  const tagMap = extractUniqueTagsForType(events, tagType);

  // Create tag anchor nodes
  let tagAnchors = createTagAnchorNodes(tagMap, tagType, width, height);
  
  // Apply display limit if provided
  if (displayLimit && displayLimit > 0 && tagAnchors.length > displayLimit) {
    // Sort by connection count (already done in createTagAnchorNodes)
    // and take only the top ones up to the limit
    tagAnchors = tagAnchors.slice(0, displayLimit);
  }

  // Create links between anchors and nodes
  const tagLinks = createTagLinks(tagAnchors, graphData.nodes);

  // Return enhanced graph
  return {
    nodes: [...graphData.nodes, ...tagAnchors],
    links: [...graphData.links, ...tagLinks],
  };
}

/**
 * Applies a gentle pull on each node toward its tag anchors.
 *
 * @param nodes - The array of network nodes to update.
 * @param nodeToAnchors - A map from node IDs to their tag anchor nodes.
 * @param alpha - The current simulation alpha (cooling factor).
 */
export function applyTagGravity(
  nodes: NetworkNode[],
  nodeToAnchors: Map<string, NetworkNode[]>,
  alpha: number
): void {
  nodes.forEach((node) => {
    if (node.isTagAnchor) return; // Tag anchors don't move

    const anchors = nodeToAnchors.get(node.id);
    if (!anchors || anchors.length === 0) return;

    // Apply gentle pull toward each tag anchor
    anchors.forEach((anchor) => {
      if (
        anchor.x != null &&
        anchor.y != null &&
        node.x != null &&
        node.y != null
      ) {
        const dx = anchor.x - node.x;
        const dy = anchor.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // Gentle force that decreases with distance
          const strength = (0.02 * alpha) / anchors.length;
          node.vx = (node.vx || 0) + (dx / distance) * strength * distance;
          node.vy = (node.vy || 0) + (dy / distance) * strength * distance;
        }
      }
    });
  });
}

/**
 * Custom force for tag anchor gravity
 */
export function createTagGravityForce(
  nodes: NetworkNode[],
  links: NetworkLink[],
): any {
  // Build a map of nodes to their tag anchors
  const nodeToAnchors = new Map<string, NetworkNode[]>();

  links.forEach((link) => {
    const source = link.source as NetworkNode;
    const target = link.target as NetworkNode;

    if (source.isTagAnchor && !target.isTagAnchor) {
      if (!nodeToAnchors.has(target.id)) {
        nodeToAnchors.set(target.id, []);
      }
      nodeToAnchors.get(target.id)!.push(source);
    } else if (target.isTagAnchor && !source.isTagAnchor) {
      if (!nodeToAnchors.has(source.id)) {
        nodeToAnchors.set(source.id, []);
      }
      nodeToAnchors.get(source.id)!.push(target);
    }
  });

  debug("Creating tag gravity force");
  
  function force(alpha: number) {
    applyTagGravity(nodes, nodeToAnchors, alpha);
  }

  force.initialize = function (_: NetworkNode[]) {
    nodes = _;
  };

  return force;
}
