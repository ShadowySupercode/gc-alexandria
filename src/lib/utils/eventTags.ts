import { NDKEvent } from "@nostr-dev-kit/ndk";

/**
 * Common tag names used in Nostr events
 */
export type CommonTagName = 
  | 'title' 
  | 'd' 
  | 'a' 
  | 'e' 
  | 'p' 
  | 't' 
  | 'type' 
  | 'version' 
  | 'published_on' 
  | 'published_by' 
  | 'summary' 
  | 'i' 
  | 'source' 
  | 'auto-update' 
  | 'author' 
  | 'nip05' 
  | 'image' 
  | 'l' 
  | 'wikilink';

/**
 * Gets the first matching tag value for a given tag name.
 * Throws an error if multiple matching tags are found.
 * @param event The NDKEvent object
 * @param tagName The tag name to match (e.g., 'title', 'd', 'a')
 * @returns The value of the first matching tag, or undefined if no match is found
 * @throws Error if multiple matching tags are found
 */
export function getTagValue<T = string>(event: NDKEvent, tagName: CommonTagName): T | undefined {
  const matches = event.tags.filter(tag => tag[0] === tagName);
  
  if (matches.length > 1) {
    console.error(`Multiple ${tagName} tags found in event ${event.id}. Tags:`, event.tags);
    throw new Error(`Multiple ${tagName} tags found in event ${event.id}`);
  }
  
  return matches[0]?.[1] as T | undefined;
}

/**
 * Gets all values from matching tags for a given tag name.
 * @param event The NDKEvent object
 * @param tagName The tag name to match (e.g., 'a', 'e', 'p')
 * @returns An array of values from all matching tags
 */
export function getTagValues<T = string>(event: NDKEvent, tagName: CommonTagName): T[] {
  return event.tags
    .filter(tag => tag[0] === tagName)
    .map(tag => tag[1] as T);
}

/**
 * Gets all matching tags for a given tag name.
 * This is a lower-level function that returns the full tag arrays.
 * @param event The NDKEvent object
 * @param tagName The tag name to match
 * @returns An array of matching tag arrays
 */
export function getMatchingTags(event: NDKEvent, tagName: CommonTagName): string[][] {
  return event.tags.filter(tag => tag[0] === tagName);
}

// Extend NDKEvent prototype to add these methods
declare module "@nostr-dev-kit/ndk" {
  interface NDKEvent {
    /**
     * Gets the first matching tag value for a given tag name.
     * Throws an error if multiple matching tags are found.
     * @param tagName The tag name to match
     * @returns The value of the first matching tag, or undefined if no match is found
     * @throws Error if multiple matching tags are found
     */
    getTagValue<T = string>(tagName: CommonTagName): T | undefined;
    
    /**
     * Gets all values from matching tags for a given tag name.
     * @param tagName The tag name to match
     * @returns An array of values from all matching tags
     */
    getTagValues<T = string>(tagName: CommonTagName): T[];
    
    /**
     * Gets all matching tags for a given tag name.
     * @param tagName The tag name to match
     * @returns An array of matching tag arrays
     */
    getMatchingTags(tagName: CommonTagName): string[][];
  }
}

// Add the methods to NDKEvent prototype
NDKEvent.prototype.getTagValue = function<T = string>(tagName: CommonTagName): T | undefined {
  return getTagValue<T>(this, tagName);
};

NDKEvent.prototype.getTagValues = function<T = string>(tagName: CommonTagName): T[] {
  return getTagValues<T>(this, tagName);
};

NDKEvent.prototype.getMatchingTags = function(tagName: CommonTagName): string[][] {
  return getMatchingTags(this, tagName);
}; 