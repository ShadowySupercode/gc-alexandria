/**
 * Profile utilities for handling kind 0 events with both content and tags
 * AI-NOTE: This module handles the transition from JSON content to tags for profile events
 * while maintaining backward compatibility
 */

import type { NDKEvent } from "./nostrUtils";

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
  [key: string]: any;
}

export interface AggregatedProfileData {
  content: string;
  tags: string[][];
  profileData: ProfileData;
}

/**
 * Parse profile content from JSON string
 */
export function parseProfileContent(content: string): ProfileData | null {
  if (!content) return null;
  
  try {
    return JSON.parse(content);
  } catch (error) {
    console.warn("Failed to parse profile content:", error);
    return null;
  }
}

/**
 * Convert profile data to JSON string
 */
export function stringifyProfileData(profileData: ProfileData): string {
  return JSON.stringify(profileData);
}

/**
 * Extract profile data from tags
 */
export function extractProfileDataFromTags(tags: string[][]): ProfileData {
  const profileData: ProfileData = {};
  
  for (const tag of tags) {
    if (tag.length >= 2) {
      const [key, value] = tag;
      if (value) {
        // Handle multiple values for the same key (e.g., multiple websites)
        if (profileData[key]) {
          if (Array.isArray(profileData[key])) {
            (profileData[key] as string[]).push(value);
          } else {
            profileData[key] = [profileData[key] as string, value];
          }
        } else {
          profileData[key] = value;
        }
      }
    }
  }
  
  return profileData;
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
 * Merge two profile data objects, with the second taking precedence
 */
export function mergeProfileData(base: ProfileData, override: ProfileData): ProfileData {
  const merged: ProfileData = { ...base };
  
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined && value !== null && value !== "") {
      if (Array.isArray(value)) {
        // Handle multiple values
        if (merged[key] && Array.isArray(merged[key])) {
          // Merge arrays, removing duplicates
          const existing = merged[key] as string[];
          const newValues = value.filter(v => !existing.includes(v));
          merged[key] = [...existing, ...newValues];
        } else if (merged[key]) {
          // Convert existing single value to array and merge
          const existing = [merged[key] as string];
          const newValues = value.filter(v => !existing.includes(v));
          merged[key] = [...existing, ...newValues];
        } else {
          merged[key] = value;
        }
      } else {
        merged[key] = value;
      }
    }
  }
  
  return merged;
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
 * Aggregate profile data from both content and tags
 * This handles the transition from JSON content to tags while maintaining backward compatibility
 */
export function aggregateProfileData(event: NDKEvent): AggregatedProfileData {
  // Parse content field (legacy JSON format)
  const contentProfileData = parseProfileContent(event.content || "");
  
  // Extract profile data from tags (new format)
  const tagsProfileData = extractProfileDataFromTags(event.tags || []);
  
  // Merge the two, with tags taking precedence over content
  const mergedProfileData = mergeProfileData(
    contentProfileData || {},
    tagsProfileData
  );
  
  // Convert back to JSON string for content
  const aggregatedContent = stringifyProfileData(mergedProfileData);
  
  // Convert to tags, deduplicating
  const aggregatedTags = deduplicateTags([
    ...convertProfileDataToTags(mergedProfileData),
    ...(event.tags || [])
  ]);
  
  return {
    content: aggregatedContent,
    tags: aggregatedTags,
    profileData: mergedProfileData
  };
}

/**
 * Ensure a kind 0 event has an id before publishing
 * According to NIP-01, the id is calculated as sha256 of the serialized event
 */
export function ensureEventId(event: NDKEvent): NDKEvent {
  if (event.id) {
    return event;
  }
  
  // The id should be calculated by the signing process
  // This function is mainly for validation - the actual id generation
  // happens during the signing process in the event publishing code
  console.warn("Event missing id - this should be generated during signing");
  return event;
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
