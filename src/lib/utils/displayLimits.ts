import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { VisualizationConfig } from '$lib/stores/visualizationConfig';
import { isEventId, isCoordinate, parseCoordinate } from './nostr_identifiers';
import type { NostrEventId } from './nostr_identifiers';

/**
 * Filters events based on visualization configuration
 * @param events - All available events
 * @param config - Visualization configuration
 * @returns Filtered events that should be displayed
 */
export function filterByDisplayLimits(events: NDKEvent[], config: VisualizationConfig): NDKEvent[] {
  const result: NDKEvent[] = [];
  const kindCounts = new Map<number, number>();

  for (const event of events) {
    const kind = event.kind;
    if (kind === undefined) continue;

    // Get the config for this event kind
    const eventConfig = config.eventConfigs.find(ec => ec.kind === kind);
    
    // Skip if the kind is disabled
    if (eventConfig && eventConfig.enabled === false) {
      continue;
    }
    
    const limit = eventConfig?.limit;

    // Special handling for content kinds (30041, 30818) with showAll option
    if ((kind === 30041 || kind === 30818) && eventConfig?.showAll) {
      // Show all content events when showAll is true
      result.push(event);
      // Still update the count for UI display
      const currentCount = kindCounts.get(kind) || 0;
      kindCounts.set(kind, currentCount + 1);
    } else if (limit !== undefined) {
      // Normal limit checking
      const currentCount = kindCounts.get(kind) || 0;
      if (currentCount < limit) {
        result.push(event);
        kindCounts.set(kind, currentCount + 1);
      }
    } else {
      // No limit configured, add the event
      result.push(event);
    }
  }

  return result;
}

/**
 * Detects events that are referenced but not present in the current set
 * @param events - Current events
 * @param existingIds - Set of all known event IDs (hex format)
 * @param existingCoordinates - Optional map of existing coordinates for NIP-33 detection
 * @returns Set of missing event identifiers
 */
export function detectMissingEvents(
  events: NDKEvent[], 
  existingIds: Set<NostrEventId>,
  existingCoordinates?: Map<string, NDKEvent>
): Set<string> {
  const missing = new Set<string>();

  for (const event of events) {
    // Check 'e' tags for direct event references (hex IDs)
    const eTags = event.getMatchingTags('e');
    for (const eTag of eTags) {
      if (eTag.length < 2) continue;
      
      const eventId = eTag[1];
      
      // Type check: ensure it's a valid hex event ID
      if (!isEventId(eventId)) {
        console.warn('Invalid event ID in e tag:', eventId);
        continue;
      }
      
      if (!existingIds.has(eventId)) {
        missing.add(eventId);
      }
    }

    // Check 'a' tags for NIP-33 references (kind:pubkey:d-tag)
    const aTags = event.getMatchingTags('a');
    for (const aTag of aTags) {
      if (aTag.length < 2) continue;
      
      const identifier = aTag[1];
      
      // Type check: ensure it's a valid coordinate
      if (!isCoordinate(identifier)) {
        console.warn('Invalid coordinate in a tag:', identifier);
        continue;
      }
      
      // Parse the coordinate
      const parsed = parseCoordinate(identifier);
      if (!parsed) continue;
      
      // If we have existing coordinates, check if this one exists
      if (existingCoordinates) {
        if (!existingCoordinates.has(identifier)) {
          missing.add(identifier);
        }
      } else {
        // Without coordinate map, we can't detect missing NIP-33 events
        // This is a limitation when we only have hex IDs
        console.debug('Cannot detect missing NIP-33 events without coordinate map:', identifier);
      }
    }
  }

  return missing;
}

/**
 * Builds a map of coordinates to events for NIP-33 detection
 * @param events - Array of events to build coordinate map from
 * @returns Map of coordinate strings to events
 */
export function buildCoordinateMap(events: NDKEvent[]): Map<string, NDKEvent> {
  const coordinateMap = new Map<string, NDKEvent>();
  
  for (const event of events) {
    // Only process replaceable events (kinds 30000-39999)
    if (event.kind && event.kind >= 30000 && event.kind < 40000) {
      const dTag = event.tagValue('d');
      const author = event.pubkey;
      
      if (dTag && author) {
        const coordinate = `${event.kind}:${author}:${dTag}`;
        coordinateMap.set(coordinate, event);
      }
    }
  }
  
  return coordinateMap;
}

