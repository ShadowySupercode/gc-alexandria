/**
 * Event publishing and loading services
 */

import { get } from "svelte/store";
import { userStore } from "$lib/stores/userStore";
import NDK, { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
import type { NDKEvent } from "$lib/utils/nostrUtils";
import { prefixNostrAddresses } from "$lib/utils/nostrUtils";
import { fetchEventWithFallback } from "$lib/utils/nostrUtils";

import { WebSocketPool } from "$lib/data_structures/websocket_pool";
import { anonymousRelays } from "$lib/consts";
import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
import { removeMetadataFromContent } from "$lib/utils/asciidoc_metadata";
import { build30040EventSet } from "$lib/utils/event_input_utils";
import type { EventData, TagData, PublishResult, LoadEventResult } from "./types";

/**
 * Converts TagData array to NDK-compatible format
 */
function convertTagsToNDKFormat(tags: TagData[]): string[][] {
  return tags
    .filter(tag => tag.key.trim() !== "")
    .map(tag => [tag.key, ...tag.values]);
}

/**
 * Publishes an event to relays
 */
export async function publishEvent(ndk: any, eventData: EventData, tags: TagData[]): Promise<PublishResult> {
  if (!ndk) {
    return { success: false, error: "NDK context not available" };
  }
  
  const userState = get(userStore);
  const pubkey = userState.pubkey;
  
  if (!pubkey) {
    return { success: false, error: "User not logged in." };
  }
  
  const pubkeyString = String(pubkey);
  if (!/^[a-fA-F0-9]{64}$/.test(pubkeyString)) {
    return { success: false, error: "Invalid public key: must be a 64-character hex string." };
  }

  const baseEvent = { pubkey: pubkeyString, created_at: eventData.createdAt };
  let events: NDKEvent[] = [];

  console.log("Publishing event with kind:", eventData.kind);
  console.log("Content length:", eventData.content.length);
  console.log("Content preview:", eventData.content.substring(0, 100));
  console.log("Tags:", tags);

  if (Number(eventData.kind) === 30040) {
    console.log("=== 30040 EVENT CREATION START ===");
    console.log("Creating 30040 event set with content:", eventData.content);
    
    try {
      // Get the current d and title values from the UI
      const dTagValue = tags.find(tag => tag.key === "d")?.values[0] || "";
      const titleTagValue = tags.find(tag => tag.key === "title")?.values[0] || "";
      
      // Convert multi-value tags to the format expected by build30040EventSet
      // Filter out d and title tags since we'll add them manually
      const compatibleTags: [string, string][] = tags
        .filter(tag => tag.key.trim() !== "" && tag.key !== "d" && tag.key !== "title")
        .map(tag => [tag.key, tag.values[0] || ""] as [string, string]);
      
      const { indexEvent, sectionEvents } = build30040EventSet(
        eventData.content,
        compatibleTags,
        baseEvent,
        ndk,
      );
      
      // Override the d and title tags with the UI values if they exist
      const finalTags = indexEvent.tags.filter(tag => tag[0] !== "d" && tag[0] !== "title");
      if (dTagValue) {
        finalTags.push(["d", dTagValue]);
      }
      if (titleTagValue) {
        finalTags.push(["title", titleTagValue]);
      }
      
      // Update the index event with the correct tags
      indexEvent.tags = finalTags;
      console.log("Index event:", indexEvent);
      console.log("Section events:", sectionEvents);
      
      // Publish all 30041 section events first, then the 30040 index event
      events = [...sectionEvents, indexEvent];
      console.log("Total events to publish:", events.length);
      console.log("=== 30040 EVENT CREATION END ===");
    } catch (error) {
      console.error("Error in build30040EventSet:", error);
      return { 
        success: false, 
        error: `Failed to build 30040 event set: ${error instanceof Error ? error.message : "Unknown error"}` 
      };
    }
  } else {
    // Convert multi-value tags to the format expected by NDK
    let eventTags = convertTagsToNDKFormat(tags);

    // For AsciiDoc events, remove metadata from content
    let finalContent = eventData.content;
    if (eventData.kind === 30040 || eventData.kind === 30041) {
      finalContent = removeMetadataFromContent(eventData.content);
    }
    
    // Prefix Nostr addresses before publishing
    const prefixedContent = prefixNostrAddresses(finalContent);

    // Create event with proper serialization
    const eventDataForNDK = {
      kind: eventData.kind,
      content: prefixedContent,
      tags: eventTags,
      pubkey: pubkeyString,
      created_at: eventData.createdAt,
    };

    events = [new NDKEventClass(ndk, eventDataForNDK)];
  }

  let atLeastOne = false;
  let relaysPublished: string[] = [];
  let lastEventId: string | null = null;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    try {
      console.log("Publishing event:", {
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        hasContent: event.content && event.content.length > 0,
      });

      // Always sign with a plain object if window.nostr is available
      // Create a completely plain object to avoid proxy cloning issues
      const plainEvent = {
        kind: Number(event.kind),
        pubkey: String(event.pubkey),
        created_at: Number(
          event.created_at ?? Math.floor(Date.now() / 1000),
        ),
        tags: event.tags.map((tag) => tag.map(String)),
        content: String(event.content),
      };
      
      if (
        typeof window !== "undefined" &&
        window.nostr &&
        window.nostr.signEvent
      ) {
        const signed = await window.nostr.signEvent(plainEvent);
        event.sig = signed.sig;
        if ("id" in signed) {
          event.id = signed.id as string;
        }
      } else {
        await event.sign();
      }

      // Use direct WebSocket publishing like CommentBox does
      const signedEvent = {
        ...plainEvent,
        id: event.id,
        sig: event.sig,
      };

      // Try to publish to relays directly
      const relays = [
        ...anonymousRelays,
        ...get(activeOutboxRelays),
        ...get(activeInboxRelays),
      ];
      let published = false;

      for (const relayUrl of relays) {
        try {
          const ws = await WebSocketPool.instance.acquire(relayUrl);

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              WebSocketPool.instance.release(ws);
              reject(new Error("Timeout"));
            }, 5000);

            ws.onmessage = (e) => {
              const [type, id, ok, message] = JSON.parse(e.data);
              if (type === "OK" && id === signedEvent.id) {
                clearTimeout(timeout);
                if (ok) {
                  published = true;
                  relaysPublished.push(relayUrl);
                  WebSocketPool.instance.release(ws);
                  resolve();
                } else {
                  WebSocketPool.instance.release(ws);
                  reject(new Error(message));
                }
              }
            };

            // Send the event to the relay
            ws.send(JSON.stringify(["EVENT", signedEvent]));
          });
          if (published) break;
        } catch (e) {
          console.error(`Failed to publish to ${relayUrl}:`, e);
        }
      }

      if (published) {
        atLeastOne = true;
        // For 30040, set lastEventId to the index event (last in array)
        if (Number(eventData.kind) === 30040) {
          if (i === events.length - 1) {
            lastEventId = event.id;
          }
        } else {
          lastEventId = event.id;
        }
      }
    } catch (signError) {
      console.error("Error signing/publishing event:", signError);
      return { 
        success: false, 
        error: `Failed to sign event: ${signError instanceof Error ? signError.message : "Unknown error"}` 
      };
    }
  }

  if (atLeastOne) {
    return { 
      success: true, 
      eventId: lastEventId || undefined,
      relays: relaysPublished 
    };
  } else {
    return { success: false, error: "Failed to publish to any relay." };
  }
}

/**
 * Loads an event by its hex ID
 */
export async function loadEvent(ndk: any, eventId: string): Promise<LoadEventResult | null> {
  if (!ndk) {
    throw new Error("NDK context not available");
  }
  
  const foundEvent = await fetchEventWithFallback(ndk, eventId, 10000);

  if (foundEvent) {
    // Convert NDK event format to our format
    const eventData: EventData = {
      kind: foundEvent.kind, // Use the actual kind from the event
      content: foundEvent.content || "", // Preserve content exactly as-is
      createdAt: Math.floor(Date.now() / 1000), // Use current time for replacement
    };

    // Convert NDK tags format to our format
    const tags: TagData[] = foundEvent.tags.map((tag: string[]) => ({
      key: tag[0] || "",
      values: tag.slice(1)
    }));

    return { eventData, tags };
  }

  return null;
}
