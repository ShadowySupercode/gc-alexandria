import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { ndkInstance } from "../ndk";
import { get } from "svelte/store";
import { extractPubkeysFromEvents, batchFetchProfiles } from "./profileCache";

// Constants for publication event kinds
const INDEX_EVENT_KIND = 30040;
const CONTENT_EVENT_KINDS = [30041, 30818];

/**
 * Interface for tag expansion fetch results
 */
export interface TagExpansionResult {
  publications: NDKEvent[];
  contentEvents: NDKEvent[];
}

/**
 * Fetches publications and their content events from relays based on tags
 * 
 * This function handles the relay-based fetching portion of tag expansion:
 * 1. Fetches publication index events that have any of the specified tags
 * 2. Extracts content event references from those publications
 * 3. Fetches the referenced content events
 * 
 * @param tags Array of tags to search for in publications
 * @param existingEventIds Set of existing event IDs to avoid duplicates
 * @param baseEvents Array of base events to check for existing content
 * @param debug Optional debug function for logging
 * @returns Promise resolving to publications and content events
 */
export async function fetchTaggedEventsFromRelays(
  tags: string[],
  existingEventIds: Set<string>,
  baseEvents: NDKEvent[],
  debug?: (...args: any[]) => void
): Promise<TagExpansionResult> {
  const log = debug || console.debug;
  
  log("Fetching from relays for tags:", tags);
  
  // Fetch publications that have any of the specified tags
  const ndk = get(ndkInstance);
  const taggedPublications = await ndk.fetchEvents({
    kinds: [INDEX_EVENT_KIND],
    "#t": tags, // Match any of these tags
    limit: 30 // Reasonable default limit
  });
  
  log("Found tagged publications from relays:", taggedPublications.size);
  
  // Filter to avoid duplicates
  const newPublications = Array.from(taggedPublications).filter(
    (event: NDKEvent) => !existingEventIds.has(event.id)
  );
  
  // Extract content event d-tags from new publications
  const contentEventDTags = new Set<string>();
  const existingContentDTags = new Set(
    baseEvents
      .filter(e => e.kind !== undefined && CONTENT_EVENT_KINDS.includes(e.kind))
      .map(e => e.tagValue("d"))
      .filter(d => d !== undefined)
  );
  
  newPublications.forEach((event: NDKEvent) => {
    const aTags = event.getMatchingTags("a");
    aTags.forEach((tag: string[]) => {
      // Parse the 'a' tag identifier: kind:pubkey:d-tag
      if (tag[1]) {
        const parts = tag[1].split(':');
        if (parts.length >= 3) {
          const dTag = parts.slice(2).join(':'); // Handle d-tags with colons
          if (!existingContentDTags.has(dTag)) {
            contentEventDTags.add(dTag);
          }
        }
      }
    });
  });
  
  // Fetch the content events
  let newContentEvents: NDKEvent[] = [];
  if (contentEventDTags.size > 0) {
    const contentEventsSet = await ndk.fetchEvents({
      kinds: CONTENT_EVENT_KINDS,
      "#d": Array.from(contentEventDTags), // Use d-tag filter
    });
    newContentEvents = Array.from(contentEventsSet);
  }
  
  return {
    publications: newPublications,
    contentEvents: newContentEvents
  };
}

/**
 * Searches through already fetched events for publications with specified tags
 * 
 * This function handles the local search portion of tag expansion:
 * 1. Searches through existing events for publications with matching tags
 * 2. Extracts content event references from those publications
 * 3. Finds the referenced content events in existing events
 * 
 * @param allEvents Array of all fetched events to search through
 * @param tags Array of tags to search for in publications
 * @param existingEventIds Set of existing event IDs to avoid duplicates
 * @param baseEvents Array of base events to check for existing content
 * @param debug Optional debug function for logging
 * @returns Promise resolving to publications and content events
 */
export function findTaggedEventsInFetched(
  allEvents: NDKEvent[],
  tags: string[],
  existingEventIds: Set<string>,
  baseEvents: NDKEvent[],
  debug?: (...args: any[]) => void
): TagExpansionResult {
  const log = debug || console.debug;
  
  log("Searching through already fetched events for tags:", tags);
  
  // Find publications in allEvents that have the specified tags
  const taggedPublications = allEvents.filter(event => {
    if (event.kind !== INDEX_EVENT_KIND) return false;
    if (existingEventIds.has(event.id)) return false; // Skip base events
    
    // Check if event has any of the specified tags
    const eventTags = event.getMatchingTags("t").map(tag => tag[1]);
    return tags.some(tag => eventTags.includes(tag));
  });
  
  const newPublications = taggedPublications;
  log("Found", newPublications.length, "publications in fetched events");
  
  // For content events, also search in allEvents
  const existingContentDTags = new Set(
    baseEvents
      .filter(e => e.kind !== undefined && CONTENT_EVENT_KINDS.includes(e.kind))
      .map(e => e.tagValue("d"))
      .filter(d => d !== undefined)
  );
  
  const contentEventDTags = new Set<string>();
  newPublications.forEach((event: NDKEvent) => {
    const aTags = event.getMatchingTags("a");
    aTags.forEach((tag: string[]) => {
      // Parse the 'a' tag identifier: kind:pubkey:d-tag
      if (tag[1]) {
        const parts = tag[1].split(':');
        if (parts.length >= 3) {
          const dTag = parts.slice(2).join(':'); // Handle d-tags with colons
          if (!existingContentDTags.has(dTag)) {
            contentEventDTags.add(dTag);
          }
        }
      }
    });
  });
  
  // Find content events in allEvents
  const newContentEvents = allEvents.filter(event => {
    if (!CONTENT_EVENT_KINDS.includes(event.kind || 0)) return false;
    const dTag = event.tagValue("d");
    return dTag !== undefined && contentEventDTags.has(dTag);
  });
  
  return {
    publications: newPublications,
    contentEvents: newContentEvents
  };
}

/**
 * Fetches profiles for new events and updates progress
 * 
 * @param newPublications Array of new publication events
 * @param newContentEvents Array of new content events
 * @param onProgressUpdate Callback to update progress state
 * @param debug Optional debug function for logging
 * @returns Promise that resolves when profile fetching is complete
 */
export async function fetchProfilesForNewEvents(
  newPublications: NDKEvent[],
  newContentEvents: NDKEvent[],
  onProgressUpdate: (progress: { current: number; total: number } | null) => void,
  debug?: (...args: any[]) => void
): Promise<void> {
  const log = debug || console.debug;
  
  // Extract pubkeys from new events
  const newPubkeys = extractPubkeysFromEvents([...newPublications, ...newContentEvents]);
  
  if (newPubkeys.size > 0) {
    log("Fetching profiles for", newPubkeys.size, "new pubkeys from tag expansion");
    
    onProgressUpdate({ current: 0, total: newPubkeys.size });
    
    await batchFetchProfiles(Array.from(newPubkeys), (fetched, total) => {
      onProgressUpdate({ current: fetched, total });
    });
    
    onProgressUpdate(null);
  }
} 