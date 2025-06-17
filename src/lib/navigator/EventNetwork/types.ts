/**
 * Type definitions for the Event Network visualization
 *
 * This module defines the core data structures used in the D3 force-directed
 * graph visualization of Nostr events.
 */

import type { NDKEvent } from "@nostr-dev-kit/ndk";

/**
 * Base interface for nodes in a D3 force simulation
 * Represents the physical properties of a node in the simulation
 */
export interface SimulationNodeDatum {
  index?: number; // Node index in the simulation
  x?: number; // X position
  y?: number; // Y position
  vx?: number; // X velocity
  vy?: number; // Y velocity
  fx?: number | null; // Fixed X position (when node is pinned)
  fy?: number | null; // Fixed Y position (when node is pinned)
}

/**
 * Base interface for links in a D3 force simulation
 * Represents connections between nodes
 */
export interface SimulationLinkDatum<NodeType> {
  source: NodeType | string | number; // Source node or identifier
  target: NodeType | string | number; // Target node or identifier
  index?: number; // Link index in the simulation
}

/**
 * Represents a node in the event network visualization
 * Extends the base simulation node with Nostr event-specific properties
 */
export interface NetworkNode extends SimulationNodeDatum {
  id: string; // Unique identifier (event ID)
  event?: NDKEvent; // Reference to the original NDK event
  level: number; // Hierarchy level in the network
  kind: number; // Nostr event kind (30040 for index, 30041/30818 for content)
  title: string; // Event title
  content: string; // Event content
  author: string; // Author's public key
  type: "Index" | "Content" | "TagAnchor" | "PersonAnchor"; // Node type classification
  naddr?: string; // NIP-19 naddr identifier
  nevent?: string; // NIP-19 nevent identifier
  isContainer?: boolean; // Whether this node is a container (index)

  // Tag anchor specific fields
  isTagAnchor?: boolean; // Whether this is a tag anchor node
  tagType?: string; // Type of tag (t, p, e, etc.)
  tagValue?: string; // The tag value
  connectedNodes?: string[]; // IDs of nodes that have this tag
  
  // Person anchor specific fields
  isPersonAnchor?: boolean; // Whether this is a person anchor node
  pubkey?: string; // The person's public key
  displayName?: string; // The person's display name from kind 0
  isFromFollowList?: boolean; // Whether this person comes from follow lists
}

/**
 * Represents a link between nodes in the event network
 * Extends the base simulation link with event-specific properties
 */
export interface NetworkLink extends SimulationLinkDatum<NetworkNode> {
  source: NetworkNode; // Source node (overridden to be more specific)
  target: NetworkNode; // Target node (overridden to be more specific)
  isSequential: boolean; // Whether this link represents a sequential relationship
}

/**
 * Represents the complete graph data for visualization
 */
export interface GraphData {
  nodes: NetworkNode[]; // All nodes in the graph
  links: NetworkLink[]; // All links in the graph
}

/**
 * Represents the internal state of the graph during construction
 * Used to track relationships and build the final graph
 */
export interface GraphState {
  nodeMap: Map<string, NetworkNode>; // Maps event IDs to nodes
  links: NetworkLink[]; // All links in the graph
  eventMap: Map<string, NDKEvent>; // Maps event IDs to original events
  referencedIds: Set<string>; // Set of event IDs referenced by other events
}
