/**
 * Person Network Builder
 *
 * Creates person anchor nodes for event authors in the network visualization
 */

import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type { NetworkNode, NetworkLink } from "../types";
import { getDisplayNameSync } from "$lib/utils/profileCache";

const PERSON_ANCHOR_RADIUS = 15;
const PERSON_ANCHOR_PLACEMENT_RADIUS = 1000;

/**
 * Simple seeded random number generator
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

/**
 * Creates a deterministic seed from a string
 */
function createSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Extracts unique persons (pubkeys) from events
 */
export function extractUniquePersons(
  events: NDKEvent[]
): Map<string, Set<string>> {
  // Map of pubkey -> Set of event IDs
  const personMap = new Map<string, Set<string>>();
  
  console.log(`[PersonBuilder] Extracting persons from ${events.length} events`);

  events.forEach((event) => {
    if (!event.pubkey || !event.id) return;

    if (!personMap.has(event.pubkey)) {
      personMap.set(event.pubkey, new Set());
    }

    personMap.get(event.pubkey)!.add(event.id);
  });
  
  console.log(`[PersonBuilder] Found ${personMap.size} unique persons`);

  return personMap;
}

/**
 * Creates person anchor nodes
 */
export function createPersonAnchorNodes(
  personMap: Map<string, Set<string>>,
  width: number,
  height: number
): NetworkNode[] {
  const anchorNodes: NetworkNode[] = [];

  const centerX = width / 2;
  const centerY = height / 2;

  Array.from(personMap.entries()).forEach(([pubkey, eventIds]) => {
    // Create seeded random generator for consistent positioning
    const rng = new SeededRandom(createSeed(pubkey));

    // Generate deterministic position
    const angle = rng.next() * 2 * Math.PI;
    const distance = rng.next() * PERSON_ANCHOR_PLACEMENT_RADIUS;
    const x = centerX + distance * Math.cos(angle);
    const y = centerY + distance * Math.sin(angle);

    // Get display name
    const displayName = getDisplayNameSync(pubkey);

    const anchorNode: NetworkNode = {
      id: `person-anchor-${pubkey}`,
      title: displayName,
      content: `${eventIds.size} events`,
      author: "",
      kind: 0, // Special kind for anchors
      type: "PersonAnchor",
      level: -1,
      isPersonAnchor: true,
      pubkey,
      displayName,
      connectedNodes: Array.from(eventIds),
      x,
      y,
      fx: x, // Fix position
      fy: y,
    };

    anchorNodes.push(anchorNode);
  });

  return anchorNodes;
}

/**
 * Creates links between person anchors and their events
 */
export function createPersonLinks(
  personAnchors: NetworkNode[],
  nodes: NetworkNode[]
): NetworkLink[] {
  const links: NetworkLink[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  personAnchors.forEach((anchor) => {
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

  return links;
}

/**
 * Formats person anchor info for display in Legend
 */
export interface PersonAnchorInfo {
  pubkey: string;
  displayName: string;
  eventCount: number;
}

/**
 * Extracts person info for Legend display
 */
export function extractPersonAnchorInfo(
  personAnchors: NetworkNode[]
): PersonAnchorInfo[] {
  return personAnchors.map(anchor => ({
    pubkey: anchor.pubkey || "",
    displayName: anchor.displayName || "",
    eventCount: anchor.connectedNodes?.length || 0,
  }));
}