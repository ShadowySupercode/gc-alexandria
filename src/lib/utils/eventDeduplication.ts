import type { NDKEvent } from '@nostr-dev-kit/ndk';

/**
 * Deduplicate content events by keeping only the most recent version
 * @param contentEventSets Array of event sets from different sources
 * @returns Map of coordinate to most recent event
 */
export function deduplicateContentEvents(contentEventSets: Set<NDKEvent>[]): Map<string, NDKEvent> {
  const eventsByCoordinate = new Map<string, NDKEvent>();
  
  // Track statistics for debugging
  let totalEvents = 0;
  let duplicateCoordinates = 0;
  const duplicateDetails: Array<{ coordinate: string; count: number; events: string[] }> = [];
  
  contentEventSets.forEach((eventSet) => {
    eventSet.forEach(event => {
      totalEvents++;
      const dTag = event.tagValue("d");
      const author = event.pubkey;
      const kind = event.kind;
      
      if (dTag && author && kind) {
        const coordinate = `${kind}:${author}:${dTag}`;
        const existing = eventsByCoordinate.get(coordinate);
        
        if (existing) {
          // We found a duplicate coordinate
          duplicateCoordinates++;
          
          // Track details for the first few duplicates
          if (duplicateDetails.length < 5) {
            const existingDetails = duplicateDetails.find(d => d.coordinate === coordinate);
            if (existingDetails) {
              existingDetails.count++;
              existingDetails.events.push(`${event.id} (created_at: ${event.created_at})`);
            } else {
              duplicateDetails.push({
                coordinate,
                count: 2, // existing + current
                events: [
                  `${existing.id} (created_at: ${existing.created_at})`,
                  `${event.id} (created_at: ${event.created_at})`
                ]
              });
            }
          }
        }
        
        // Keep the most recent event (highest created_at)
        if (!existing || (event.created_at !== undefined && existing.created_at !== undefined && event.created_at > existing.created_at)) {
          eventsByCoordinate.set(coordinate, event);
        }
      }
    });
  });
  
  // Log deduplication results if any duplicates were found
  if (duplicateCoordinates > 0) {
    console.log(`[eventDeduplication] Found ${duplicateCoordinates} duplicate events out of ${totalEvents} total events`);
    console.log(`[eventDeduplication] Reduced to ${eventsByCoordinate.size} unique coordinates`);
    console.log(`[eventDeduplication] Duplicate details:`, duplicateDetails);
  } else if (totalEvents > 0) {
    console.log(`[eventDeduplication] No duplicates found in ${totalEvents} events`);
  }
  
  return eventsByCoordinate;
}

/**
 * Deduplicate and combine all events, keeping only the most recent version of replaceable events
 * @param nonPublicationEvents Array of non-publication events
 * @param validIndexEvents Set of valid index events
 * @param contentEvents Set of content events
 * @returns Array of deduplicated events
 */
export function deduplicateAndCombineEvents(
  nonPublicationEvents: NDKEvent[],
  validIndexEvents: Set<NDKEvent>,
  contentEvents: Set<NDKEvent>
): NDKEvent[] {
  // Track statistics for debugging
  const initialCount = nonPublicationEvents.length + validIndexEvents.size + contentEvents.size;
  let replaceableEventsProcessed = 0;
  let duplicateCoordinatesFound = 0;
  const duplicateDetails: Array<{ coordinate: string; count: number; events: string[] }> = [];
  
  // First, build coordinate map for replaceable events
  const coordinateMap = new Map<string, NDKEvent>();
  const allEventsToProcess = [
    ...nonPublicationEvents, // Non-publication events fetched earlier
    ...Array.from(validIndexEvents), 
    ...Array.from(contentEvents)
  ];
  
  // First pass: identify the most recent version of each replaceable event
  allEventsToProcess.forEach(event => {
    if (!event.id) return;
    
    // For replaceable events (30000-39999), track by coordinate
    if (event.kind && event.kind >= 30000 && event.kind < 40000) {
      replaceableEventsProcessed++;
      const dTag = event.tagValue("d");
      const author = event.pubkey;
      
      if (dTag && author) {
        const coordinate = `${event.kind}:${author}:${dTag}`;
        const existing = coordinateMap.get(coordinate);
        
        if (existing) {
          // We found a duplicate coordinate
          duplicateCoordinatesFound++;
          
          // Track details for the first few duplicates
          if (duplicateDetails.length < 5) {
            const existingDetails = duplicateDetails.find(d => d.coordinate === coordinate);
            if (existingDetails) {
              existingDetails.count++;
              existingDetails.events.push(`${event.id} (created_at: ${event.created_at})`);
            } else {
              duplicateDetails.push({
                coordinate,
                count: 2, // existing + current
                events: [
                  `${existing.id} (created_at: ${existing.created_at})`,
                  `${event.id} (created_at: ${event.created_at})`
                ]
              });
            }
          }
        }
        
        // Keep the most recent version
        if (!existing || (event.created_at !== undefined && existing.created_at !== undefined && event.created_at > existing.created_at)) {
          coordinateMap.set(coordinate, event);
        }
      }
    }
  });
  
  // Second pass: build final event map
  const finalEventMap = new Map<string, NDKEvent>();
  const seenCoordinates = new Set<string>();
  
  allEventsToProcess.forEach(event => {
    if (!event.id) return;
    
    // For replaceable events, only add if it's the chosen version
    if (event.kind && event.kind >= 30000 && event.kind < 40000) {
      const dTag = event.tagValue("d");
      const author = event.pubkey;
      
      if (dTag && author) {
        const coordinate = `${event.kind}:${author}:${dTag}`;
        const chosenEvent = coordinateMap.get(coordinate);
        
        // Only add this event if it's the chosen one for this coordinate
        if (chosenEvent && chosenEvent.id === event.id) {
          if (!seenCoordinates.has(coordinate)) {
            finalEventMap.set(event.id, event);
            seenCoordinates.add(coordinate);
          }
        }
        return;
      }
    }
    
    // Non-replaceable events are added directly
    finalEventMap.set(event.id, event);
  });
  
  const finalCount = finalEventMap.size;
  const reduction = initialCount - finalCount;
  
  // Log deduplication results if any duplicates were found
  if (duplicateCoordinatesFound > 0) {
    console.log(`[eventDeduplication] deduplicateAndCombineEvents: Found ${duplicateCoordinatesFound} duplicate coordinates out of ${replaceableEventsProcessed} replaceable events`);
    console.log(`[eventDeduplication] deduplicateAndCombineEvents: Reduced from ${initialCount} to ${finalCount} events (${reduction} removed)`);
    console.log(`[eventDeduplication] deduplicateAndCombineEvents: Duplicate details:`, duplicateDetails);
  } else if (replaceableEventsProcessed > 0) {
    console.log(`[eventDeduplication] deduplicateAndCombineEvents: No duplicates found in ${replaceableEventsProcessed} replaceable events`);
  }
  
  return Array.from(finalEventMap.values());
}

/**
 * Check if an event is a replaceable event (kinds 30000-39999)
 * @param event The event to check
 * @returns True if the event is replaceable
 */
export function isReplaceableEvent(event: NDKEvent): boolean {
  return event.kind !== undefined && event.kind >= 30000 && event.kind < 40000;
}

/**
 * Get the coordinate for a replaceable event
 * @param event The event to get the coordinate for
 * @returns The coordinate string (kind:pubkey:d-tag) or null if not a valid replaceable event
 */
export function getEventCoordinate(event: NDKEvent): string | null {
  if (!isReplaceableEvent(event)) {
    return null;
  }
  
  const dTag = event.tagValue("d");
  const author = event.pubkey;
  
  if (!dTag || !author) {
    return null;
  }
  
  return `${event.kind}:${author}:${dTag}`;
} 