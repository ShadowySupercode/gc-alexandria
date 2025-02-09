import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type { NetworkNode, NetworkLink, GraphData, GraphState } from "../types";
import { nip19 } from "nostr-tools";
import { standardRelays } from "$lib/consts";

/**
 * Creates a NetworkNode from an NDKEvent
 */
export function createNetworkNode(
    event: NDKEvent,
    level: number = 0
): NetworkNode {
    const isContainer = event.kind === 30040;

    const node: NetworkNode = {
        id: event.id,
        event,
        isContainer,
        level,
        title: event.getMatchingTags("title")?.[0]?.[1] || "Untitled",
        content: event.content || "",
        author: event.pubkey || "",
        kind: event.kind,
        type: event?.kind === 30040 ? "Index" : "Content",
    };

    if (event.kind && event.pubkey) {
        try {
            const dTag = event.getMatchingTags("d")?.[0]?.[1] || "";
            node.naddr = nip19.naddrEncode({
                pubkey: event.pubkey,
                identifier: dTag,
                kind: event.kind,
                relays: standardRelays,
            });

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

export function createEventMap(events: NDKEvent[]): Map<string, NDKEvent> {
    const eventMap = new Map<string, NDKEvent>();
    events.forEach((event) => {
        if (event.id) {
            eventMap.set(event.id, event);
        }
    });
    return eventMap;
}

export function extractEventIdFromATag(tag: string[]): string | null {
    return tag[3] || null;
}

/**
 * Generates a color for an event based on its ID
 */
export function getEventColor(eventId: string): string {
    const num = parseInt(eventId.slice(0, 4), 16);
    const hue = num % 360;
    const saturation = 70;
    const lightness = 75;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function initializeGraphState(events: NDKEvent[]): GraphState {
    const nodeMap = new Map<string, NetworkNode>();
    const eventMap = createEventMap(events);

    // Create initial nodes
    events.forEach((event) => {
        if (!event.id) return;
        const node = createNetworkNode(event);
        nodeMap.set(event.id, node);
    });

    // Build referenced IDs set
    const referencedIds = new Set<string>();
    events.forEach((event) => {
        event.getMatchingTags("a").forEach((tag) => {
            const id = extractEventIdFromATag(tag);
            if (id) referencedIds.add(id);
        });
    });

    return {
        nodeMap,
        links: [],
        eventMap,
        referencedIds,
    };
}

export function processSequence(
    sequence: NetworkNode[],
    indexEvent: NDKEvent,
    level: number,
    state: GraphState,
    maxLevel: number,
): void {
    if (level >= maxLevel || sequence.length === 0) return;

    // Set levels for sequence nodes
    sequence.forEach((node) => {
        node.level = level + 1;
    });

    // Create initial link from index to first content
    const indexNode = state.nodeMap.get(indexEvent.id);
    if (indexNode && sequence[0]) {
        state.links.push({
            source: indexNode,
            target: sequence[0],
            isSequential: true,
        });
    }

    // Create sequential links
    for (let i = 0; i < sequence.length - 1; i++) {
        const currentNode = sequence[i];
        const nextNode = sequence[i + 1];

        state.links.push({
            source: currentNode,
            target: nextNode,
            isSequential: true,
        });

        processNestedIndex(currentNode, level + 1, state, maxLevel);
    }

    // Process final node if it's an index
    const lastNode = sequence[sequence.length - 1];
    if (lastNode?.isContainer) {
        processNestedIndex(lastNode, level + 1, state, maxLevel);
    }
}

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

export function processIndexEvent(
    indexEvent: NDKEvent,
    level: number,
    state: GraphState,
    maxLevel: number,
): void {
    if (level >= maxLevel) return;

    const sequence = indexEvent
        .getMatchingTags("a")
        .map((tag) => extractEventIdFromATag(tag))
        .filter((id): id is string => id !== null)
        .map((id) => state.nodeMap.get(id))
        .filter((node): node is NetworkNode => node !== undefined);

    processSequence(sequence, indexEvent, level, state, maxLevel);
}

export function generateGraph(
    events: NDKEvent[],
    maxLevel: number
): GraphData {
    const state = initializeGraphState(events);

    // Process root indices
    events
        .filter((e) => e.kind === 30040 && e.id && !state.referencedIds.has(e.id))
        .forEach((rootIndex) => processIndexEvent(rootIndex, 0, state, maxLevel));

    return {
        nodes: Array.from(state.nodeMap.values()),
        links: state.links,
    };
}