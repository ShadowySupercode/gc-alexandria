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
 * Prepare profile event for publishing by merging content and tags
 * Returns both the merged content (for backward compatibility) and comprehensive tags (for new clients)
 */
export function prepareProfileEventForPublishing(
  content: string,
  tags: string[][]
): { content: string; tags: string[][] } {
  try {
    // Parse content field if it's JSON
    let contentProfileData: any = null;
    if (content) {
      try {
        contentProfileData = JSON.parse(content);
      } catch (e) {
        // If not valid JSON, use as-is
        contentProfileData = null;
      }
    }
    
    // Create a mock NDKEvent to use with parseProfileContent
    const mockEvent = {
      kind: 0,
      content: content,
      tags: tags,
      pubkey: "",
      created_at: 0
    } as any;
    
    // Use the existing parseProfileContent function to get merged profile data
    const mergedProfileData = parseProfileContent(mockEvent);
    
    // Convert back to JSON string for content (backward compatible)
    const finalContent = mergedProfileData ? JSON.stringify(mergedProfileData) : content;
    
    // Now create comprehensive tags that include all values from both content and tags
    const comprehensiveTags: string[][] = [];
    const tagMap = new Map<string, string[]>();
    
    // First, collect all existing tag values
    for (const tag of tags) {
      if (tag.length >= 2) {
        const [key, value] = tag;
        if (value && value !== '') {
          if (!tagMap.has(key)) {
            tagMap.set(key, []);
          }
          if (!tagMap.get(key)!.includes(value)) {
            tagMap.get(key)!.push(value);
          }
        }
      }
    }
    
    // Then, add any values from content that aren't already in tags
    if (contentProfileData) {
      for (const [key, value] of Object.entries(contentProfileData)) {
        if (value !== null && value !== undefined && value !== '') {
          if (!tagMap.has(key)) {
            tagMap.set(key, []);
          }
          if (!tagMap.get(key)!.includes(String(value))) {
            tagMap.get(key)!.push(String(value));
          }
        }
      }
    }
    
    // Convert back to tag array format
    for (const [key, values] of tagMap) {
      for (const value of values) {
        comprehensiveTags.push([key, value]);
      }
    }
    
    return {
      content: finalContent,
      tags: comprehensiveTags
    };
  } catch (error) {
    console.warn("Failed to prepare profile event for publishing:", error);
    return {
      content: content,
      tags: tags
    };
  }
}

