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
const MAX_PERSON_NODES = 20; // Default limit for person nodes

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

export interface PersonConnection {
  signedByEventIds: Set<string>;
  referencedInEventIds: Set<string>;
  isFromFollowList?: boolean; // Track if this person comes from follow lists
}

/**
 * Extracts unique persons (pubkeys) from events
 * Tracks both signed-by (event.pubkey) and referenced (["p", pubkey] tags)
 */
export function extractUniquePersons(
  events: NDKEvent[],
  followListEvents?: NDKEvent[]
): Map<string, PersonConnection> {
  // Map of pubkey -> PersonConnection
  const personMap = new Map<string, PersonConnection>();
  
  console.log(`[PersonBuilder] Extracting persons from ${events.length} events`);
  
  // First collect pubkeys from follow list events
  const followListPubkeys = new Set<string>();
  if (followListEvents && followListEvents.length > 0) {
    console.log(`[PersonBuilder] Processing ${followListEvents.length} follow list events`);
    followListEvents.forEach((event) => {
      // Follow list author
      if (event.pubkey) {
        followListPubkeys.add(event.pubkey);
      }
      // People in follow lists (p tags)
      if (event.tags) {
        event.tags.forEach(tag => {
          if (tag[0] === "p" && tag[1]) {
            followListPubkeys.add(tag[1]);
          }
        });
      }
    });
  }

  events.forEach((event) => {
    if (!event.id) return;

    // Track signed-by connections
    if (event.pubkey) {
      if (!personMap.has(event.pubkey)) {
        personMap.set(event.pubkey, {
          signedByEventIds: new Set(),
          referencedInEventIds: new Set(),
          isFromFollowList: followListPubkeys.has(event.pubkey)
        });
      }
      personMap.get(event.pubkey)!.signedByEventIds.add(event.id);
    }

    // Track referenced connections from "p" tags
    if (event.tags) {
      event.tags.forEach(tag => {
        if (tag[0] === "p" && tag[1]) {
          const referencedPubkey = tag[1];
          if (!personMap.has(referencedPubkey)) {
            personMap.set(referencedPubkey, {
              signedByEventIds: new Set(),
              referencedInEventIds: new Set(),
              isFromFollowList: followListPubkeys.has(referencedPubkey)
            });
          }
          personMap.get(referencedPubkey)!.referencedInEventIds.add(event.id);
        }
      });
    }
  });
  
  console.log(`[PersonBuilder] Found ${personMap.size} unique persons`);
  console.log(`[PersonBuilder] ${followListPubkeys.size} are from follow lists`);

  return personMap;
}

/**
 * Creates person anchor nodes
 */
export function createPersonAnchorNodes(
  personMap: Map<string, PersonConnection>,
  width: number,
  height: number,
  showSignedBy: boolean,
  showReferenced: boolean,
  limit: number = MAX_PERSON_NODES
): { nodes: NetworkNode[], totalCount: number } {
  const anchorNodes: NetworkNode[] = [];

  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate eligible persons and their connection counts
  const eligiblePersons: Array<{
    pubkey: string;
    connection: PersonConnection;
    connectedEventIds: Set<string>;
    totalConnections: number;
  }> = [];

  Array.from(personMap.entries()).forEach(([pubkey, connection]) => {
    // Get all connected event IDs based on filters
    const connectedEventIds = new Set<string>();
    
    if (showSignedBy) {
      connection.signedByEventIds.forEach(id => connectedEventIds.add(id));
    }
    
    if (showReferenced) {
      connection.referencedInEventIds.forEach(id => connectedEventIds.add(id));
    }
    
    // Skip if no connections match the filter
    if (connectedEventIds.size === 0) return;

    eligiblePersons.push({
      pubkey,
      connection,
      connectedEventIds,
      totalConnections: connectedEventIds.size
    });
  });

  // Sort by total connections (descending) and take only top N
  eligiblePersons.sort((a, b) => b.totalConnections - a.totalConnections);
  const limitedPersons = eligiblePersons.slice(0, limit);

  // Create nodes for the limited set
  limitedPersons.forEach(({ pubkey, connection, connectedEventIds }) => {

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
      content: `${connection.signedByEventIds.size} signed, ${connection.referencedInEventIds.size} referenced`,
      author: "",
      kind: 0, // Special kind for anchors
      type: "PersonAnchor",
      level: -1,
      isPersonAnchor: true,
      pubkey,
      displayName,
      connectedNodes: Array.from(connectedEventIds),
      isFromFollowList: connection.isFromFollowList,
      x,
      y,
      fx: x, // Fix position
      fy: y,
    };

    anchorNodes.push(anchorNode);
  });

  return {
    nodes: anchorNodes,
    totalCount: eligiblePersons.length
  };
}

export interface PersonLink extends NetworkLink {
  connectionType?: "signed-by" | "referenced";
}

/**
 * Creates links between person anchors and their events
 * Adds connection type for coloring
 */
export function createPersonLinks(
  personAnchors: NetworkNode[],
  nodes: NetworkNode[],
  personMap: Map<string, PersonConnection>
): PersonLink[] {
  const links: PersonLink[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  personAnchors.forEach((anchor) => {
    if (!anchor.connectedNodes || !anchor.pubkey) return;

    const connection = personMap.get(anchor.pubkey);
    if (!connection) return;

    anchor.connectedNodes.forEach((nodeId) => {
      const node = nodeMap.get(nodeId);
      if (node) {
        // Determine connection type
        let connectionType: "signed-by" | "referenced" | undefined;
        if (connection.signedByEventIds.has(nodeId)) {
          connectionType = "signed-by";
        } else if (connection.referencedInEventIds.has(nodeId)) {
          connectionType = "referenced";
        }

        links.push({
          source: anchor,
          target: node,
          isSequential: false,
          connectionType,
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
  signedByCount: number;
  referencedCount: number;
  isFromFollowList: boolean;
}

/**
 * Extracts person info for Legend display
 */
export function extractPersonAnchorInfo(
  personAnchors: NetworkNode[],
  personMap: Map<string, PersonConnection>
): PersonAnchorInfo[] {
  return personAnchors.map(anchor => {
    const connection = personMap.get(anchor.pubkey || "");
    return {
      pubkey: anchor.pubkey || "",
      displayName: anchor.displayName || "",
      signedByCount: connection?.signedByEventIds.size || 0,
      referencedCount: connection?.referencedInEventIds.size || 0,
      isFromFollowList: connection?.isFromFollowList || false,
    };
  });
}