/**
 * Person Network Builder
 *
 * Creates person anchor nodes for event authors in the network visualization
 */

import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type { NetworkNode, NetworkLink } from "../types";
import { getDisplayNameSync } from "$lib/utils/profileCache";
import { SeededRandom, createDebugFunction } from "./common";

const PERSON_ANCHOR_RADIUS = 15;
const PERSON_ANCHOR_PLACEMENT_RADIUS = 1000;
const MAX_PERSON_NODES = 20; // Default limit for person nodes

// Debug function
const debug = createDebugFunction("PersonNetworkBuilder");


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
  
  debug("Extracting unique persons", { eventCount: events.length, followListCount: followListEvents?.length || 0 });
  
  // First collect pubkeys from follow list events
  const followListPubkeys = new Set<string>();
  if (followListEvents && followListEvents.length > 0) {
    followListEvents.forEach((event) => {
      // Follow list author
      if (event.pubkey) {
        followListPubkeys.add(event.pubkey);
      }
      // People in follow lists (p tags)
      if (event.tags) {
        event.tags
          .filter(tag => {
            tag[0] === 'p'
          })
          .forEach(tag => {
            followListPubkeys.add(tag[1]);
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
  
  debug("Extracted persons", { personCount: personMap.size });

  return personMap;
}

/**
 * Helper to build eligible person info for anchor nodes.
 */
function buildEligiblePerson(
  pubkey: string,
  connection: PersonConnection,
  showSignedBy: boolean,
  showReferenced: boolean
): {
  pubkey: string;
  connection: PersonConnection;
  connectedEventIds: Set<string>;
  totalConnections: number;
} | null {
  const connectedEventIds = new Set<string>();

  if (showSignedBy) {
    connection.signedByEventIds.forEach(id => connectedEventIds.add(id));
  }

  if (showReferenced) {
    connection.referencedInEventIds.forEach(id => connectedEventIds.add(id));
  }

  if (connectedEventIds.size === 0) {
    return null;
  }

  return {
    pubkey,
    connection,
    connectedEventIds,
    totalConnections: connectedEventIds.size
  };
}

type EligiblePerson = {
  pubkey: string;
  connection: PersonConnection;
  totalConnections: number;
  connectedEventIds: Set<string>;
};

function getEligiblePersons(
  personMap: Map<string, PersonConnection>,
  showSignedBy: boolean,
  showReferenced: boolean,
  limit: number
): EligiblePerson[] {
  // Build eligible persons and keep only top N using a min-heap or partial sort
  const eligible: EligiblePerson[] = [];

  for (const [pubkey, connection] of personMap) {
    let totalConnections = 0;
    if (showSignedBy) totalConnections += connection.signedByEventIds.size;
    if (showReferenced) totalConnections += connection.referencedInEventIds.size;
    if (totalConnections === 0) continue;

    // Only build the set if this person is eligible
    const connectedEventIds = new Set<string>();
    if (showSignedBy) {
      connection.signedByEventIds.forEach(id => connectedEventIds.add(id));
    }
    if (showReferenced) {
      connection.referencedInEventIds.forEach(id => connectedEventIds.add(id));
    }

    eligible.push({ pubkey, connection, totalConnections, connectedEventIds });
  }

  // Partial sort: get top N by totalConnections
  eligible.sort((a, b) => b.totalConnections - a.totalConnections);
  return eligible.slice(0, limit);
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
  const eligiblePersons = getEligiblePersons(personMap, showSignedBy, showReferenced, limit);

  // Create nodes for the limited set
  debug("Creating person anchor nodes", { 
    eligibleCount: eligiblePersons.length, 
    limitedCount: eligiblePersons.length,
    showSignedBy,
    showReferenced 
  });

  eligiblePersons.forEach(({ pubkey, connection, connectedEventIds }) => {
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

  debug("Created person anchor nodes", { count: anchorNodes.length, totalEligible: eligiblePersons.length });

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
  debug("Creating person links", { anchorCount: personAnchors.length, nodeCount: nodes.length });
  
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const links: PersonLink[] = personAnchors.flatMap((anchor) => {
    if (!anchor.connectedNodes || !anchor.pubkey) {
      return [];
    }

    const connection = personMap.get(anchor.pubkey);
    if (!connection) {
      return [];
    }

    return anchor.connectedNodes.map((nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node) {
        return undefined;
      }

      let connectionType: 'signed-by' | 'referenced' | undefined;
      if (connection.signedByEventIds.has(nodeId)) {
        connectionType = 'signed-by';
      } else if (connection.referencedInEventIds.has(nodeId)) {
        connectionType = 'referenced';
      }

      const link: PersonLink = {
        source: anchor,
        target: node,
        isSequential: false,
        connectionType,
      };
      
      return link;
    }).filter((link): link is PersonLink => link !== undefined); // Remove undefineds and type guard
  });

  debug("Created person links", { linkCount: links.length });
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