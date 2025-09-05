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
 * Validates an event according to NIP-01 specification
 */
function validateEvent(event: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate required fields
  if (!event.pubkey || typeof event.pubkey !== 'string') {
    errors.push('Missing or invalid pubkey');
  } else if (!/^[a-fA-F0-9]{64}$/.test(event.pubkey)) {
    errors.push('Pubkey must be a 64-character lowercase hex string');
  }
  
  if (typeof event.created_at !== 'number' || event.created_at <= 0) {
    errors.push('Missing or invalid created_at timestamp');
  }
  
  if (typeof event.kind !== 'number' || event.kind < 0 || event.kind > 65535) {
    errors.push('Kind must be an integer between 0 and 65535');
  }
  
  if (typeof event.content !== 'string') {
    errors.push('Content must be a string');
  }
  
  if (!Array.isArray(event.tags)) {
    errors.push('Tags must be an array');
  } else {
    // Validate tags structure - tags can be empty array, but individual elements shouldn't be empty
    for (let i = 0; i < event.tags.length; i++) {
      const tag = event.tags[i];
      if (!Array.isArray(tag)) {
        errors.push(`Tag ${i} must be an array`);
      } else {
        // Check that all tag elements are non-null, non-empty strings
        for (let j = 0; j < tag.length; j++) {
          if (tag[j] === null || tag[j] === undefined) {
            errors.push(`Tag ${i}, element ${j} cannot be null or undefined`);
          } else if (typeof tag[j] !== 'string') {
            errors.push(`Tag ${i}, element ${j} must be a string`);
          } else if (tag[j] === '') {
            errors.push(`Tag ${i}, element ${j} cannot be empty string`);
          }
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalizes and orders tags according to NIP-01 specification
 * Groups tags by type while maintaining original order of appearance
 */
function normalizeAndOrderTags(tags: string[][]): string[][] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }
  
  // Filter out invalid tags and ensure all elements are strings
  const validTags = tags
    .filter(tag => Array.isArray(tag))
    .map(tag => tag.map(element => String(element)))
    .filter(tag => tag.length === 0 || tag[0] !== ''); // Allow empty tags, but if not empty, first element shouldn't be empty
  
  // Group tags by their first element (tag type)
  const tagGroups: { [key: string]: string[][] } = {};
  const tagOrder: string[] = []; // Track order of first appearance
  
  for (const tag of validTags) {
    const tagType = tag[0];
    if (!tagGroups[tagType]) {
      tagGroups[tagType] = [];
      tagOrder.push(tagType);
    }
    tagGroups[tagType].push(tag);
  }
  
  // Rebuild tags array in order of first appearance, with same types grouped together
  const orderedTags: string[][] = [];
  for (const tagType of tagOrder) {
    orderedTags.push(...tagGroups[tagType]);
  }
  
  return orderedTags;
}

/**
 * Converts TagData array to NDK-compatible format with proper validation and ordering
 */
function convertTagsToNDKFormat(tags: TagData[]): string[][] {
  const ndkTags = tags
    .filter(tag => tag.key.trim() !== "")
    .map(tag => [tag.key, ...tag.values]);
  
  return normalizeAndOrderTags(ndkTags);
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
    // Convert multi-value tags to the format expected by NDK with proper validation and ordering
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

    // AI-NOTE: Validate event according to NIP-01 specification before creating NDK event
    const validation = validateEvent(eventDataForNDK);
    if (!validation.valid) {
      return { 
        success: false, 
        error: `Event validation failed: ${validation.errors.join(', ')}` 
      };
    }

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
      
      // AI-NOTE: Final validation before signing according to NIP-01 specification
      const finalValidation = validateEvent(plainEvent);
      if (!finalValidation.valid) {
        throw new Error(`Event validation failed before signing: ${finalValidation.errors.join(', ')}`);
      }
      
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
      
      // AI-NOTE: Event ID should be generated during signing according to NIP-01
      // The validation above ensures the event is properly formatted before signing

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
      
      console.log("publishEvent: Publishing to relays:", relays);
      console.log("publishEvent: Anonymous relays:", anonymousRelays);
      console.log("publishEvent: Active outbox relays:", get(activeOutboxRelays));
      console.log("publishEvent: Active inbox relays:", get(activeInboxRelays));
      
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
  
  console.log("loadEvent: Starting search for event ID:", eventId);
  console.log("loadEvent: NDK pool relays:", Array.from(ndk.pool.relays.values()).map((r: any) => r.url));
  console.log("loadEvent: Active inbox relays:", get(activeInboxRelays));
  console.log("loadEvent: Active outbox relays:", get(activeOutboxRelays));
  
  const foundEvent = await fetchEventWithFallback(ndk, eventId, 10000);

  if (foundEvent) {
    console.log("loadEvent: Successfully found event:", foundEvent.id);
    
    // AI-NOTE: Validate and normalize the loaded event according to NIP-01 specification
    const validation = validateEvent(foundEvent);
    const validationIssues = validation.valid ? undefined : validation.errors;
    
    if (!validation.valid) {
      console.warn("loadEvent: Event validation failed:", validation.errors);
    }
    
    // Normalize and order tags according to NIP-01 specification
    const normalizedTags = normalizeAndOrderTags(foundEvent.tags || []);
    
    // Convert NDK event format to our format
    const eventData: EventData = {
      kind: foundEvent.kind, // Use the actual kind from the event
      content: foundEvent.content || "", // Preserve content exactly as-is
      createdAt: Math.floor(Date.now() / 1000), // Use current time for replacement
    };

    // Convert normalized NDK tags format to our format
    const tags: TagData[] = normalizedTags.map((tag: string[]) => ({
      key: tag[0] || "",
      values: tag.slice(1)
    }));

    return { eventData, tags, validationIssues };
  }

  console.log("loadEvent: Event not found on any relay");
  return null;
}
