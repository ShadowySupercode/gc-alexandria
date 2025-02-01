import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { FeedType, standardRelays } from "$lib/consts";
import type { NetworkNode } from "./types";

export function createNetworkNode(
    event: NDKEvent,
    feedType: FeedType,
    index?: number,
    level?: number,
): NetworkNode {
    let relays = standardRelays;
    const isContainer = event.kind === 30040;

    const node: NetworkNode = {
        id: event.id,
        event,
        isContainer,
        level: level || 0,
        title: event.getMatchingTags("title")?.[0]?.[1] || "Untitled",
        content: event.content || "",
        author: event.pubkey || "",
        kind: event.kind,
        type: event?.kind === 30040 ? "Index" : "Content",
    };

    // Generate naddr for replaceable events
    if (event.kind && event.pubkey) {
        try {
            // Get the 'd' tag value if it exists
            const dTag = event.getMatchingTags("d")?.[0]?.[1] || "";

            // Create TLV data structure for naddr
            const data = {
                pubkey: event.pubkey,
                identifier: dTag,
                kind: event.kind,
                relays: relays,
            };

            node.naddr = nip19.naddrEncode(data);
        } catch (error) {
            console.warn("Failed to generate naddr for node:", error);
        }
        try {
            const nevent = nip19.neventEncode({
                id: event.id,
                relays: relays,
                kind: event.kind,
            });
            node.nevent = nevent;
        } catch (error) {
            console.warn("Failed to decode naddr for node:", error);
        }
    }

    return node;
}

export function updateNodeVelocity(
    node: NetworkNode,
    deltaVx: number,
    deltaVy: number,
) {
    if (typeof node.vx === "number" && typeof node.vy === "number") {
        node.vx = node.vx - deltaVx;
        node.vy = node.vy - deltaVy;
    }
}

export function getEventColor(eventId: string): string {
    const num = parseInt(eventId.slice(0, 4), 16);
    const hue = num % 360;
    const saturation = 70;
    const lightness = 75;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}