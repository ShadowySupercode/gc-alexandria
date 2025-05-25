/**
 * Network Builder Utilities
 *
 * This module provides utilities for building a network graph from Nostr events.
 * It handles the creation of nodes and links, and the processing of event relationships.
 */

import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type { NetworkNode, NetworkLink, GraphData, GraphState } from "../types";
import { nip19 } from "nostr-tools";
import { standardRelays } from "$lib/consts";
import { getTagValue, getTagValues } from "$lib/utils/eventTags";

// Configuration
const DEBUG = false; // Set to true to enable debug logging
const INDEX_EVENT_KIND = 30040;
const CONTENT_EVENT_KIND = 30041;

/**
 * Debug logging function that only logs when DEBUG is true
 */
function debug(...args: any[]) {
  if (DEBUG) {
    console.log("[NetworkBuilder]", ...args);
  }
}

/**
 * Creates a NetworkNode from an NDKEvent
 *
 * Extracts relevant information from the event and creates a node representation
 * for the visualization.
 *
 * @param event - The Nostr event to convert to a node
 * @param level - The hierarchy level of the node (default: 0)
 * @returns A NetworkNode object representing the event
 */
export function createNetworkNode(
  event: NDKEvent,
  level: number = 0,
): NetworkNode {
  debug("Creating network node", {
    eventId: event.id,
    kind: event.kind,
    level,
  });

  const isContainer = event.kind === INDEX_EVENT_KIND;
  const nodeType = isContainer ? "Index" : "Content";

  // Create the base node with essential properties
  const node: NetworkNode = {
    id: event.id,
    event,
    isContainer,
    level,
    title: event.getTagValue("title") || "Untitled",
    content: event.content || "",
    author: event.pubkey || "",
    kind: event.kind || CONTENT_EVENT_KIND, // Default to content event kind if undefined
    type: nodeType,
  };

  // Add NIP-19 identifiers if possible
  if (event.kind && event.pubkey) {
    try {
      const dTag = event.getTagValue("d") || "";

      // Create naddr (NIP-19 address) for the event
      node.naddr = nip19.naddrEncode({
        pubkey: event.pubkey,
        identifier: dTag,
        kind: event.kind,
        relays: standardRelays,
      });

      // Create nevent (NIP-19 event reference) for the event
      node.nevent = nip19.neventEncode({
        id: event.id,
        relays: standardRelays,
        kind: event.kind,
      });
    } catch (error) {
      console.warn("Failed to generate identifiers for node:", error);
    }
  }

  return node;
}

/**
 * Creates a map of event IDs to events for quick lookup
 *
 * @param events - Array of Nostr events
 * @returns Map of event IDs to events
 */
export function createEventMap(events: NDKEvent[]): Map<string, NDKEvent> {
  debug("Creating event map", { eventCount: events.length });

  const eventMap = new Map<string, NDKEvent>();
  events.forEach((event) => {
    if (event.id) {
      eventMap.set(event.id, event);
    }
  });

  debug("Event map created", { mapSize: eventMap.size });
  return eventMap;
}

/**
 * Extracts a d-tag (identifier) from an 'a' tag value.
 *
 * @param tagValue - The tag value to extract the d-tag from (format: 'kind:pubkey:d-tag')
 * @returns The d-tag (identifier) or null if not found
 */
export function extractDTagFromATag(tagValue: string): string | null {
  // The third part of the colon-separated string is the d-tag (identifier)
  const parts = tagValue.split(":");
  return parts.length > 2 ? parts[2] : null;
}

/**
 * Generates a deterministic color for an event based on its ID
 *
 * This creates visually distinct colors for different index events
 * while ensuring the same event always gets the same color.
 *
 * @param eventId - The event ID to generate a color for
 * @returns An HSL color string
 */
export function getEventColor(eventId: string): string {
  // Use first 4 characters of event ID as a hex number
  const num = parseInt(eventId.slice(0, 4), 16);
  // Convert to a hue value (0-359)
  const hue = num % 360;
  // Use fixed saturation and lightness for pastel colors
  const saturation = 70;
  const lightness = 75;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Initializes the graph state from a set of events
 *
 * Creates nodes for all events and identifies referenced events.
 *
 * @param events - Array of Nostr events
 * @returns Initial graph state
 */
export function initializeGraphState(events: NDKEvent[]): GraphState {
  debug("Initializing graph state", { eventCount: events.length });

  const nodeMap = new Map<string, NetworkNode>();
  const eventMap = createEventMap(events);

  // Create initial nodes for all events
  events.forEach((event) => {
    if (!event.id) return;
    const node = createNetworkNode(event);
    nodeMap.set(event.id, node);
  });
  debug("Node map created", { nodeCount: nodeMap.size });

  // Build set of referenced event IDs to identify root events
  const referencedIds = new Set<string>();
  events.forEach((event) => {
    const aTags = event.getTagValues("a");
    debug("Processing a-tags for event", {
      eventId: event.id,
      aTagCount: aTags.length,
    });

    aTags.forEach((tag) => {
      const id = extractDTagFromATag(tag);
      if (id) referencedIds.add(id);
    });
  });
  debug("Referenced IDs set created", { referencedCount: referencedIds.size });

  return {
    nodeMap,
    links: [],
    eventMap,
    referencedIds,
  };
}

/**
 * Processes a sequence of nodes referenced by an index event
 *
 * Creates links between the index and its content, and between sequential content nodes.
 * Also processes nested indices recursively up to the maximum level.
 *
 * @param sequence - Array of nodes in the sequence
 * @param indexEvent - The index event referencing the sequence
 * @param level - Current hierarchy level
 * @param state - Current graph state
 * @param maxLevel - Maximum hierarchy level to process
 */
export function processSequence(
  sequence: NetworkNode[],
  indexEvent: NDKEvent,
  level: number,
  state: GraphState,
  maxLevel: number,
): void {
  // Stop if we've reached max level or have no nodes
  if (level >= maxLevel || sequence.length === 0) return;

  // Set levels for all nodes in the sequence
  sequence.forEach((node) => {
    node.level = level + 1;
  });

  // Create link from index to first content node
  const indexNode = state.nodeMap.get(indexEvent.id);
  if (indexNode && sequence[0]) {
    state.links.push({
      source: indexNode,
      target: sequence[0],
      isSequential: true,
    });
  }

  // Create sequential links between content nodes
  for (let i = 0; i < sequence.length - 1; i++) {
    const currentNode = sequence[i];
    const nextNode = sequence[i + 1];

    state.links.push({
      source: currentNode,
      target: nextNode,
      isSequential: true,
    });

    // Process nested indices recursively
    if (currentNode.isContainer) {
      processNestedIndex(currentNode, level + 1, state, maxLevel);
    }
  }

  // Process the last node if it's an index
  const lastNode = sequence[sequence.length - 1];
  if (lastNode?.isContainer) {
    processNestedIndex(lastNode, level + 1, state, maxLevel);
  }
}

/**
 * Processes a nested index node
 *
 * @param node - The index node to process
 * @param level - Current hierarchy level
 * @param state - Current graph state
 * @param maxLevel - Maximum hierarchy level to process
 */
export function processNestedIndex(
  node: NetworkNode,
  level: number,
  state: GraphState,
  maxLevel: number,
): void {
  if (!node.isContainer || level >= maxLevel) return;

  const nestedEvent = state.eventMap.get(node.id);
  if (nestedEvent) {
    processIndexEvent(nestedEvent, level, state, maxLevel);
  }
}

/**
 * Processes an index event and its referenced content
 *
 * @param indexEvent - The index event to process
 * @param level - Current hierarchy level
 * @param state - Current graph state
 * @param maxLevel - Maximum hierarchy level to process
 */
export function processIndexEvent(
  indexEvent: NDKEvent,
  level: number,
  state: GraphState,
  maxLevel: number,
): void {
  if (level >= maxLevel) return;

  // Extract the sequence of nodes referenced by this index
  const sequence = indexEvent
    .getTagValues("a")
    .map((tag: string) => extractDTagFromATag(tag))
    .filter((id: string | null): id is string => id !== null)
    .map((id: string) => state.nodeMap.get(id))
    .filter(
      (node: NetworkNode | undefined): node is NetworkNode =>
        node !== undefined,
    );

  processSequence(sequence, indexEvent, level, state, maxLevel);
}

/**
 * Generates a complete graph from a set of events
 *
 * This is the main entry point for building the network visualization.
 *
 * @param events - Array of Nostr events
 * @param maxLevel - Maximum hierarchy level to process
 * @returns Complete graph data for visualization
 */
export function generateGraph(events: NDKEvent[], maxLevel: number): GraphData {
  debug("Generating graph", { eventCount: events.length, maxLevel });

  // Initialize the graph state
  const state = initializeGraphState(events);

  // Find root index events (those not referenced by other events)
  const rootIndices = events.filter(
    (e) =>
      e.kind === INDEX_EVENT_KIND && e.id && !state.referencedIds.has(e.id),
  );

  debug("Found root indices", {
    rootCount: rootIndices.length,
    rootIds: rootIndices.map((e) => e.id),
  });

  // Process each root index
  rootIndices.forEach((rootIndex) => {
    debug("Processing root index", {
      rootId: rootIndex.id,
      aTags: rootIndex.getTagValues("a").length,
    });
    processIndexEvent(rootIndex, 0, state, maxLevel);
  });

  // Create the final graph data
  const result = {
    nodes: Array.from(state.nodeMap.values()),
    links: state.links,
  };

  debug("Graph generation complete", {
    nodeCount: result.nodes.length,
    linkCount: result.links.length,
  });

  return result;
}
