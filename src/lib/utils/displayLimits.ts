import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { DisplayLimits } from '$lib/stores/displayLimits';
import type { VisualizationConfig } from '$lib/stores/visualizationConfig';

/**
 * Filters events based on display limits and allowed kinds
 * @param events - All available events
 * @param limits - Display limit settings
 * @param config - Visualization configuration (optional)
 * @returns Filtered events that should be displayed
 */
export function filterByDisplayLimits(events: NDKEvent[], limits: DisplayLimits, config?: VisualizationConfig): NDKEvent[] {
  const result: NDKEvent[] = [];
  const kindCounts = new Map<number, number>();

  for (const event of events) {
    // First check if the event kind is allowed and not disabled
    if (config && event.kind !== undefined) {
      if (!config.allowedKinds.includes(event.kind)) {
        continue; // Skip events with disallowed kinds
      }
      if (config.disabledKinds.includes(event.kind)) {
        continue; // Skip temporarily disabled kinds
      }
    }

    const kind = event.kind;
    if (kind === undefined) continue;

    // Get the limit for this event kind from the config
    const eventConfig = config?.eventConfigs.find(ec => ec.kind === kind);
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
 * @param existingIds - Set of all known event IDs
 * @returns Set of missing event identifiers
 */
export function detectMissingEvents(events: NDKEvent[], existingIds: Set<string>): Set<string> {
  const missing = new Set<string>();

  for (const event of events) {
    // Check 'a' tags for NIP-33 references (kind:pubkey:d-tag)
    const aTags = event.getMatchingTags('a');
    for (const aTag of aTags) {
      if (aTag.length < 2) continue;
      
      const identifier = aTag[1];
      const parts = identifier.split(':');
      
      if (parts.length >= 3) {
        const [kind, pubkey, dTag] = parts;
        // Create a synthetic ID for checking
        const syntheticId = `${kind}:${pubkey}:${dTag}`;
        
        // Check if we have an event matching this reference
        const hasEvent = Array.from(existingIds).some(id => {
          // This is a simplified check - in practice, you'd need to
          // check the actual event's d-tag value
          return id === dTag || id === syntheticId;
        });
        
        if (!hasEvent) {
          missing.add(dTag);
        }
      }
    }

    // Check 'e' tags for direct event references
    const eTags = event.getMatchingTags('e');
    for (const eTag of eTags) {
      if (eTag.length < 2) continue;
      
      const eventId = eTag[1];
      if (!existingIds.has(eventId)) {
        missing.add(eventId);
      }
    }
  }

  return missing;
}

/**
 * Groups events by kind for easier counting and display
 */
export function groupEventsByKind(events: NDKEvent[]): Map<number, NDKEvent[]> {
  const groups = new Map<number, NDKEvent[]>();
  
  for (const event of events) {
    const kind = event.kind;
    if (kind !== undefined) {
      if (!groups.has(kind)) {
        groups.set(kind, []);
      }
      groups.get(kind)!.push(event);
    }
  }
  
  return groups;
}

/**
 * Counts events by kind
 */
export function countEventsByKind(events: NDKEvent[]): Map<number, number> {
  const counts = new Map<number, number>();
  
  for (const event of events) {
    const kind = event.kind;
    if (kind !== undefined) {
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }
  }
  
  return counts;
}