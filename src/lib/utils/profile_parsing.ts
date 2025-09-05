/**
 * Profile parsing utilities for kind 0 events
 * AI-NOTE: This service handles the transition from JSON content to tags for profile events
 * while maintaining backward compatibility and proper aggregation
 */

import type { NDKEvent } from "$lib/utils/nostrUtils";

export interface ProfileData {
  name?: string;
  display_name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
  pronouns?: string;
  [key: string]: any;
}

export interface AggregatedProfileData {
  content: string;
  tags: string[][];
  profileData: ProfileData;
}

/**
 * Parse profile content from kind 0 events with proper aggregation and deduplication
 * Content field contains the first/topmost entry, tags can have multiple entries
 */
export function parseProfileContent(event: NDKEvent): ProfileData | null {
  if (event.kind !== 0) {
    return null;
  }

  try {
    // Parse content field (legacy JSON format)
    let contentProfileData: any = null;
    if (event.content) {
      contentProfileData = JSON.parse(event.content);
    }
    
    // Extract profile data from tags (new format)
    const tagsProfileData: any = {};
    for (const tag of event.tags || []) {
      if (tag.length >= 2) {
        const [key, value] = tag;
        if (value) {
          // Handle multiple values for the same key (e.g., multiple websites)
          if (tagsProfileData[key]) {
            if (Array.isArray(tagsProfileData[key])) {
              tagsProfileData[key].push(value);
            } else {
              tagsProfileData[key] = [tagsProfileData[key], value];
            }
          } else {
            tagsProfileData[key] = value;
          }
        }
      }
    }
    
    // Merge and deduplicate the two sources
    // Content field should only contain the first/topmost entry
    // Tags can have multiple entries for the same field type
    const mergedProfileData: any = {};
    const allTagValues: { [key: string]: string[] } = {};
    
    // First, collect all tag values (preserving order of appearance)
    for (const tag of event.tags || []) {
      if (tag.length >= 2) {
        const [key, value] = tag;
        if (value && value !== '') {
          if (!allTagValues[key]) {
            allTagValues[key] = [];
          }
          // Only add if not already present (deduplication while preserving order)
          if (!allTagValues[key].includes(value)) {
            allTagValues[key].push(value);
          }
        }
      }
    }
    
    // Then, merge with content data
    if (contentProfileData) {
      for (const [key, value] of Object.entries(contentProfileData)) {
        if (value !== null && value !== undefined && value !== '') {
          if (allTagValues[key]) {
            // Field exists in tags, use first tag value for content, keep all for tags
            const firstTagValue = allTagValues[key][0];
            mergedProfileData[key] = firstTagValue;
          } else {
            // Field only exists in content
            mergedProfileData[key] = value;
          }
        }
      }
    }
    
    // Add any tag-only fields
    for (const [key, values] of Object.entries(allTagValues)) {
      if (!mergedProfileData[key]) {
        // Field only exists in tags, use first value for content
        mergedProfileData[key] = values[0];
      }
    }
    
    return mergedProfileData;
  } catch (error) {
    console.warn("Failed to parse profile content:", error);
    return null;
  }
}

/**
 * Get all tag values for a specific field from a profile event
 * Useful for fields that can have multiple values (like website)
 */
export function getProfileTagValues(event: NDKEvent, fieldName: string): string[] {
  if (event.kind !== 0) {
    return [];
  }

  const values: string[] = [];
  for (const tag of event.tags || []) {
    if (tag.length >= 2 && tag[0] === fieldName && tag[1]) {
      if (!values.includes(tag[1])) {
        values.push(tag[1]);
      }
    }
  }
  
  return values;
}

/**
 * Check if a profile field exists in content, tags, or both
 */
export function getProfileFieldSource(event: NDKEvent, fieldName: string): 'content' | 'tags' | 'both' | 'none' {
  if (event.kind !== 0) {
    return 'none';
  }

  let inContent = false;
  let inTags = false;

  // Check content
  if (event.content) {
    try {
      const contentData = JSON.parse(event.content);
      if (contentData[fieldName] !== null && contentData[fieldName] !== undefined && contentData[fieldName] !== '') {
        inContent = true;
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Check tags
  for (const tag of event.tags || []) {
    if (tag.length >= 2 && tag[0] === fieldName && tag[1]) {
      inTags = true;
      break;
    }
  }

  if (inContent && inTags) return 'both';
  if (inContent) return 'content';
  if (inTags) return 'tags';
  return 'none';
}

/**
 * Convert profile data to JSON string
 */
export function stringifyProfileData(profileData: ProfileData): string {
  return JSON.stringify(profileData);
}

/**
 * Convert profile data to tags
 */
export function convertProfileDataToTags(profileData: ProfileData): string[][] {
  const tags: string[][] = [];
  
  for (const [key, value] of Object.entries(profileData)) {
    if (value !== undefined && value !== null && value !== "") {
      if (Array.isArray(value)) {
        // Handle multiple values for the same key
        for (const item of value) {
          if (item) {
            tags.push([key, String(item)]);
          }
        }
      } else {
        tags.push([key, String(value)]);
      }
    }
  }
  
  return tags;
}

/**
 * Deduplicate tags by key-value pairs
 */
export function deduplicateTags(tags: string[][]): string[][] {
  const seen = new Set<string>();
  const deduplicated: string[][] = [];
  
  for (const tag of tags) {
    if (tag.length >= 2) {
      const key = tag[0];
      const value = tag[1];
      const keyValue = `${key}:${value}`;
      
      if (!seen.has(keyValue)) {
        seen.add(keyValue);
        deduplicated.push(tag);
      }
    }
  }
  
  return deduplicated;
}

/**
 * Get all values for a specific tag key from an event
 */
export function getTagValues(event: NDKEvent, key: string): string[] {
  const values: string[] = [];
  
  for (const tag of event.tags || []) {
    if (tag.length >= 2 && tag[0] === key) {
      values.push(tag[1]);
    }
  }
  
  return values;
}

/**
 * Check if an event has a specific tag
 */
export function hasTag(event: NDKEvent, key: string, value?: string): boolean {
  for (const tag of event.tags || []) {
    if (tag.length >= 2 && tag[0] === key) {
      if (value === undefined || tag[1] === value) {
        return true;
      }
    }
  }
  return false;
}
