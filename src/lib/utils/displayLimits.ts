import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { DisplayLimits } from '$lib/stores/displayLimits';

/**
 * Filters events based on display limits
 * @param events - All available events
 * @param limits - Display limit settings
 * @returns Filtered events that should be displayed
 */
export function filterByDisplayLimits(events: NDKEvent[], limits: DisplayLimits): NDKEvent[] {
  if (limits.max30040 === -1 && limits.max30041 === -1) {
    // No limits, return all events
    return events;
  }

  const result: NDKEvent[] = [];
  let count30040 = 0;
  let count30041 = 0;

  for (const event of events) {
    if (event.kind === 30040) {
      if (limits.max30040 === -1 || count30040 < limits.max30040) {
        result.push(event);
        count30040++;
      }
    } else if (event.kind === 30041) {
      if (limits.max30041 === -1 || count30041 < limits.max30041) {
        result.push(event);
        count30041++;
      }
    } else {
      // Other event kinds always pass through
      result.push(event);
    }

    // Early exit optimization if both limits are reached
    if (limits.max30040 !== -1 && count30040 >= limits.max30040 &&
        limits.max30041 !== -1 && count30041 >= limits.max30041) {
      // Add remaining non-limited events
      const remaining = events.slice(events.indexOf(event) + 1);
      for (const e of remaining) {
        if (e.kind !== 30040 && e.kind !== 30041) {
          result.push(e);
        }
      }
      break;
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