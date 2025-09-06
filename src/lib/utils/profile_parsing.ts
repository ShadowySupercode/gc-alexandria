/**
 * Profile parsing utilities for kind 0 events
 * AI-NOTE: This service handles the transition from JSON content to tags for profile events
 * while maintaining backward compatibility and proper aggregation
 */

import type { NDKEvent } from "$lib/utils/nostrUtils";

export interface ProfileData {
  // Core profile fields (NIP-01)
  name?: string[];
  about?: string[];
  picture?: string[];
  nip05?: string[];
  
  // NIP-24 extra fields
  display_name?: string[];
  website?: string[];
  banner?: string[];
  bot?: boolean[];
  birthday?: Array<{ year?: number; month?: number; day?: number }>;
  
  // Additional common fields
  lud16?: string[];
  pronouns?: string[];
  
  // Extended fields for search and user management
  pubkey?: string;
  isInUserLists?: boolean;
  listKinds?: number[];
  created_at?: number;
  
  // Extensible for future fields
  [key: string]: any;
}


/**
 * Migrate deprecated profile fields to their modern equivalents according to NIP-24
 * @param profileData - The profile data to migrate
 * @returns Migrated profile data with deprecated fields replaced
 */
function migrateDeprecatedFields(profileData: any): any {
  if (!profileData) return profileData;
  
  const migrated = { ...profileData };
  
  // NIP-24: displayName -> display_name (only if display_name doesn't already exist)
  if (migrated.displayName && !migrated.display_name) {
    migrated.display_name = migrated.displayName;
    delete migrated.displayName;
  }
  
  // NIP-24: username -> name (only if name doesn't already exist)
  if (migrated.username && !migrated.name) {
    migrated.name = migrated.username;
    delete migrated.username;
  }
  
  // Remove other deprecated fields that should be ignored
  delete migrated.displayName; // Always remove deprecated displayName
  delete migrated.username;    // Always remove deprecated username
  
  return migrated;
}

/**
 * Parse profile content from kind 0 events with proper aggregation and deduplication
 * Content field contains the first/topmost entry, tags can have multiple entries
 * Includes NIP-24 field migration for deprecated fields
 */
export function parseProfileContent(event: NDKEvent): ProfileData | null {
  if (event.kind !== 0) {
    return null;
  }

  try {
    // Parse content field (legacy JSON format) and migrate deprecated fields
    let contentProfileData: any = null;
    if (event.content) {
      contentProfileData = migrateDeprecatedFields(JSON.parse(event.content));
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
    
    // Apply migration to tag data (convert to object format for migration, then back)
    const tagObject = Object.fromEntries(
      Object.entries(allTagValues).map(([key, values]) => [key, values[0]]) // Use first value for migration
    );
    const migratedTagObject = migrateDeprecatedFields(tagObject);
    
    // Convert back to tag values format, preserving multiple values where appropriate
    const migratedTagValues: { [key: string]: string[] } = {};
    for (const [key, value] of Object.entries(migratedTagObject)) {
      if (value !== null && value !== undefined && value !== '') {
        migratedTagValues[key] = Array.isArray(value) ? value : [value];
      }
    }
    
    // Merge with original tag values for fields that weren't migrated
    for (const [key, values] of Object.entries(allTagValues)) {
      if (!migratedTagValues[key]) {
        migratedTagValues[key] = values;
      }
    }
    
    // Then, merge with content data
    if (contentProfileData) {
      for (const [key, value] of Object.entries(contentProfileData)) {
        if (value !== null && value !== undefined && value !== '') {
          if (migratedTagValues[key]) {
            // Field exists in tags, keep all values from migrated tags
            mergedProfileData[key] = migratedTagValues[key];
          } else {
            // Field only exists in content, wrap in array
            mergedProfileData[key] = [value];
          }
        }
      }
    }
    
    // Add any tag-only fields
    for (const [key, values] of Object.entries(migratedTagValues)) {
      if (!mergedProfileData[key]) {
        // Field only exists in tags, keep all values
        mergedProfileData[key] = values;
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

/**
 * Utility function to get the first value from a profile field array
 * @param field - The profile field array (e.g., name, displayName, etc.)
 * @param fallback - Fallback value if field is empty or undefined
 * @returns The first value from the array or the fallback
 */
export function getFirstProfileValue(field: string[] | undefined, fallback: string = ""): string {
  return (field && field.length > 0 ? field[0] : fallback);
}

/**
 * Utility function to create a shortened npub/pubkey for display
 * @param identifier - The npub or pubkey to shorten
 * @returns Shortened identifier in format "abc12345...defg"
 */
export function shortenNpub(identifier: string | undefined | null): string {
  if (!identifier) return "";
  return `${identifier.slice(0, 8)}...${identifier.slice(-4)}`;
}

/**
 * Utility function to get the best display name from a profile, replicating userBadge logic
 * @param profile - The profile data
 * @param pubkey - Optional pubkey to use for npub fallback
 * @returns The best available display name or shortened npub
 */
export function getBestDisplayName(profile: ProfileData | undefined | null, pubkey?: string): string {
  if (!profile) {
    return pubkey ? shortenNpub(pubkey) : "Unknown";
  }
  return profile.display_name?.[0] || profile.name?.[0] || (pubkey ? shortenNpub(pubkey) : "Unknown");
}
