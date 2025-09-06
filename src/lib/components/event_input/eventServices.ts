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
import { validateEvent, normalizeAndOrderTags, validateAndNormalizeEvent } from "$lib/utils/event_validation";
import { prepareProfileEventForPublishing, parseProfileContent } from "$lib/utils/profile_parsing";

/**
 * Extract all values from malformed JSON content that has duplicate keys
 * This ensures clients using only tags get complete information from content
 */
function extractAllValuesFromMalformedJson(content: string, profileFields: string[]): Array<{ field: string; values: string[] }> {
  const results: Array<{ field: string; values: string[] }> = [];
  
  for (const field of profileFields) {
    const values: string[] = [];
    
    // Use regex to find all occurrences of the field in the JSON string
    // Pattern matches: "field":"value" or "field": "value"
    const regex = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'g');
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const value = match[1];
      if (value && value.trim() !== '') {
        values.push(value);
      }
    }
    
    if (values.length > 0) {
      results.push({ field, values });
    }
  }
  
  return results;
}
import type { EventData, TagData, PublishResult, LoadEventResult } from "./types";


/**
 * Converts TagData array to NDK-compatible format with proper validation and ordering
 * For duplicate tag types, creates separate tag entries for each value
 */
export function convertTagsToNDKFormat(tags: TagData[]): string[][] {
  const result: string[][] = [];
  
  for (const tag of tags) {
    if (tag.key.trim() !== "") {
      // Create ONE tag entry with all values
      // Note: Empty strings are valid in Nostr tags, so we preserve them
      result.push([tag.key, ...tag.values]);
    }
  }
  
  return normalizeAndOrderTags(result);
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
  let eventDataForNDK: any;

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
  } else if (Number(eventData.kind) === 0) {
    // Special handling for profile events (kind 0)
    let eventTags = convertTagsToNDKFormat(tags);
    
    // Use the profile parsing service to prepare the event for publishing
    const { content: finalContent, tags: comprehensiveTags } = prepareProfileEventForPublishing(
      eventData.content,
      eventTags
    );
    
    // Update eventTags with the comprehensive tags
    eventTags = normalizeAndOrderTags(comprehensiveTags);
    
    // Prefix Nostr addresses before publishing
    const prefixedContent = prefixNostrAddresses(finalContent);

    // Create event with proper serialization
    eventDataForNDK = {
      kind: eventData.kind,
      content: prefixedContent,
      tags: eventTags,
      pubkey: pubkeyString,
      created_at: eventData.createdAt,
    };
  } else {
    // For other event types
    let eventTags = convertTagsToNDKFormat(tags);

    // For AsciiDoc events, remove metadata from content
    let finalContent = eventData.content;
    if (eventData.kind === 30040 || eventData.kind === 30041) {
      finalContent = removeMetadataFromContent(eventData.content);
    }
    
    // Prefix Nostr addresses before publishing
    const prefixedContent = prefixNostrAddresses(finalContent);

    // Create event with proper serialization
    eventDataForNDK = {
      kind: eventData.kind,
      content: prefixedContent,
      tags: eventTags,
      pubkey: pubkeyString,
      created_at: eventData.createdAt,
    };
  }

  // AI-NOTE: Validate event according to NIP-01 specification before creating NDK event
  const validation = validateEvent(eventDataForNDK);
  if (!validation.valid) {
    return { 
      success: false, 
      error: `Event validation failed: ${validation.errors.join(', ')}` 
    };
  }

  events = [new NDKEventClass(ndk, eventDataForNDK)];

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
    // For profile events, content entries should be listed first in tags for consistency
    const tags: TagData[] = [];
    const seenTags = new Set<string>(); // Track seen tags to deduplicate only identical tags
    
    // For profile events (kind 0), extract profile data from content and add as tags FIRST
    if (foundEvent.kind === 0) {
      try {
        // Profile fields that should be extracted to tags
        const profileFields = ['name', 'display_name', 'about', 'picture', 'banner', 'website', 'nip05', 'lud16', 'pronouns'];
        
        // Extract ALL values from content (including malformed JSON with duplicate keys)
        // This ensures clients using only tags get complete information from content
        const allContentValues = extractAllValuesFromMalformedJson(foundEvent.content || "{}", profileFields);
        for (const { field, values } of allContentValues) {
          for (const value of values) {
            if (value !== null && value !== undefined && value !== '') {
              const tagData = {
                key: field,
                values: [String(value)]
              };
              const tagKey = JSON.stringify(tagData);
              if (!seenTags.has(tagKey)) {
                seenTags.add(tagKey);
                tags.push(tagData);
              }
            }
          }
        }
      } catch (error) {
        console.warn("Failed to parse profile content for tag extraction:", error);
      }
    }
    
    // Then add all existing tags from the original event
    for (const tag of normalizedTags) {
      if (tag.length >= 2) {
        const key = tag[0] || "";
        // Preserve empty strings - they are valid in Nostr tags
        const values = tag.slice(1).map(v => v === null || v === undefined ? "" : String(v));
        
        if (key) {
          // ALL tags can have multiple values - add each tag as a separate entry
          const tagData = {
            key,
            values: values
          };
          const tagKey = JSON.stringify(tagData);
          if (!seenTags.has(tagKey)) {
            seenTags.add(tagKey);
            tags.push(tagData);
          }
        }
      }
    }
    
    // tags array is already populated above

    return { eventData, tags, validationIssues };
  }

  console.log("loadEvent: Event not found on any relay");
  return null;
}

