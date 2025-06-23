import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { VisualizationConfig } from '$lib/stores/visualizationConfig';

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

