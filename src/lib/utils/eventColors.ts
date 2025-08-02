/**
 * Deterministic color mapping for event kinds
 * Uses golden ratio to distribute colors evenly across the spectrum
 */

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

/**
 * Get a deterministic color for an event kind
 * @param kind - The event kind number
 * @returns HSL color string
 */
export function getEventKindColor(kind: number): string {
  // Use golden ratio for better distribution
  const hue = (kind * GOLDEN_RATIO * 360) % 360;
  
  // Use different saturation/lightness for better visibility
  const saturation = 65 + (kind % 20); // 65-85%
  const lightness = 55 + ((kind * 3) % 15); // 55-70%
  
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get a friendly name for an event kind
 * @param kind - The event kind number
 * @returns Human-readable name
 */
export function getEventKindName(kind: number): string {
  const kindNames: Record<number, string> = {
    0: 'Metadata',
    1: 'Text Note',
    2: 'Recommend Relay',
    3: 'Contact List',
    4: 'Encrypted DM',
    5: 'Event Deletion',
    6: 'Repost',
    7: 'Reaction',
    8: 'Badge Award',
    16: 'Generic Repost',
    40: 'Channel Creation',
    41: 'Channel Metadata',
    42: 'Channel Message',
    43: 'Channel Hide Message',
    44: 'Channel Mute User',
    1984: 'Reporting',
    9734: 'Zap Request',
    9735: 'Zap',
    10000: 'Mute List',
    10001: 'Pin List',
    10002: 'Relay List',
    22242: 'Client Authentication',
    24133: 'Nostr Connect',
    27235: 'HTTP Auth',
    30000: 'Categorized People List',
    30001: 'Categorized Bookmark List',
    30008: 'Profile Badges',
    30009: 'Badge Definition',
    30017: 'Create or update a stall',
    30018: 'Create or update a product',
    30023: 'Long-form Content',
    30024: 'Draft Long-form Content',
    30040: 'Publication Index',
    30041: 'Publication Content',
    30078: 'Application-specific Data',
    30311: 'Live Event',
    30402: 'Classified Listing',
    30403: 'Draft Classified Listing',
    30617: 'Repository',
    30818: 'Wiki Page',
    31922: 'Date-Based Calendar Event',
    31923: 'Time-Based Calendar Event',
    31924: 'Calendar',
    31925: 'Calendar Event RSVP',
    31989: 'Handler recommendation',
    31990: 'Handler information',
    34550: 'Community Definition',
  };
  
  return kindNames[kind] || `Kind ${kind}`;
}

