/**
 * Profile parsing utilities for kind 0 events
 * AI-NOTE: This service handles the transition from JSON content to tags for profile events
 * while maintaining backward compatibility and proper aggregation
 */

import type { NDKEvent } from "$lib/utils/nostrUtils";
import { DEPRECATED_PROFILE_FIELDS } from "$lib/components/event_input/eventServices";

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
 * Extract multiple values from malformed JSON content that has duplicate keys
 * @param content - The malformed JSON content string
 * @returns Object with arrays for fields that had duplicate keys
 */
function extractMultipleValuesFromMalformedJSON(content: string): any | null {
  try {
    // First try normal JSON parsing
    const parsed = JSON.parse(content);
    
    // Even if JSON parsing succeeds, check for duplicate keys by using regex
    // to extract all key-value pairs including duplicates
    const result: any = {};
    
    // Use regex to find all key-value pairs, including duplicates
    // This regex handles string values specifically
    const keyValueRegex = /"([^"]+)"\s*:\s*"([^"]*)"/g;
    let match;
    
    while ((match = keyValueRegex.exec(content)) !== null) {
      const key = match[1];
      const value = match[2];
      
      if (value && value !== '' && value !== 'null' && value !== 'undefined') {
        if (result[key]) {
          if (Array.isArray(result[key])) {
            result[key].push(value);
          } else {
            result[key] = [result[key], value];
          }
        } else {
          result[key] = value;
        }
      }
    }
    
    // Convert single values to arrays for consistency
    for (const [key, value] of Object.entries(result)) {
      if (!Array.isArray(value)) {
        result[key] = [value];
      }
    }
    
    return Object.keys(result).length > 0 ? result : parsed;
  } catch (error) {
    // If JSON parsing fails, try to extract multiple values for duplicate keys
    const result: any = {};
    
    // Use regex to find all key-value pairs, including duplicates
    const keyValueRegex = /"([^"]+)"\s*:\s*"([^"]*)"/g;
    let match;
    
    while ((match = keyValueRegex.exec(content)) !== null) {
      const key = match[1];
      const value = match[2];
      
      if (value && value !== '' && value !== 'null' && value !== 'undefined') {
        if (result[key]) {
          if (Array.isArray(result[key])) {
            result[key].push(value);
          } else {
            result[key] = [result[key], value];
          }
        } else {
          result[key] = value;
        }
      }
    }
    
    // Convert single values to arrays for consistency
    for (const [key, value] of Object.entries(result)) {
      if (!Array.isArray(value)) {
        result[key] = [value];
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  }
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
  }
  
  // NIP-24: username -> name (only if name doesn't already exist)
  if (migrated.username && !migrated.name) {
    migrated.name = migrated.username;
  }
  
  // Always remove deprecated fields after migration (regardless of whether migration occurred)
  for (const field of DEPRECATED_PROFILE_FIELDS) {
    delete migrated[field];
  }
  
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
      try {
        contentProfileData = migrateDeprecatedFields(JSON.parse(event.content));
      } catch (parseError) {
        // If JSON parsing fails, try to extract multiple values for duplicate keys
        contentProfileData = extractMultipleValuesFromMalformedJSON(event.content);
        if (contentProfileData) {
          contentProfileData = migrateDeprecatedFields(contentProfileData);
        }
      }
      
      // AI-NOTE: Handle malformed JSON with duplicate keys even if JSON.parse() succeeds
      // JSON.parse() only keeps the last value for duplicate keys, so we need to extract all values
      // Check if content has duplicate keys by looking for common fields that might be duplicated
      // Also check for deprecated fields
      if (contentProfileData && (
        event.content.includes('"website"') || 
        event.content.includes('"username"') ||
        event.content.includes('"displayName"') || 
        event.content.includes('"nip05"') ||
        event.content.includes('"lud16"')
      )) {
        const extractedData = extractMultipleValuesFromMalformedJSON(event.content);
        if (extractedData) {
          // Apply migration to the extracted data
          const migratedExtractedData = migrateDeprecatedFields(extractedData);
          // Use the extracted data which has all values, with migration applied
          // The extracted data should be the authoritative source since it handles all values properly
          contentProfileData = migratedExtractedData;
        }
      }
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
    
    // Start with all tag values, then apply migration
    const migratedTagValues: { [key: string]: string[] } = {};
    
    // First, add all non-deprecated fields with their full values
    for (const [key, values] of Object.entries(allTagValues)) {
      if (!DEPRECATED_PROFILE_FIELDS.includes(key)) {
        migratedTagValues[key] = values;
      }
    }
    
    // Then, handle migration for deprecated fields
    for (const [key, values] of Object.entries(allTagValues)) {
      if (DEPRECATED_PROFILE_FIELDS.includes(key)) {
        // Apply migration to the first value to determine the target field
        const tagObject = { [key]: values[0] };
        const migratedTagObject = migrateDeprecatedFields(tagObject);
        
        // Add the migrated values to the target field
        for (const [migratedKey, migratedValue] of Object.entries(migratedTagObject)) {
          if (migratedValue !== null && migratedValue !== undefined && migratedValue !== '') {
            if (migratedTagValues[migratedKey]) {
              // Merge with existing values, avoiding duplicates
              const existingValues = migratedTagValues[migratedKey];
              const newValues = Array.isArray(migratedValue) ? migratedValue : [migratedValue];
              const allValues = [...existingValues, ...newValues];
              migratedTagValues[migratedKey] = Array.from(new Set(allValues));
            } else {
              // Add all values from the deprecated field to the migrated field
              migratedTagValues[migratedKey] = values;
            }
          }
        }
      }
    }
    
    // Then, merge with content data
    if (contentProfileData) {
      for (const [key, value] of Object.entries(contentProfileData)) {
        if (value !== null && value !== undefined && value !== '') {
          if (migratedTagValues[key]) {
            // Field exists in tags, merge content values with tag values
            const contentValues = Array.isArray(value) ? value : [value];
            const allValues = [...contentValues, ...migratedTagValues[key]];
            // Remove duplicates while preserving order
            const uniqueValues = Array.from(new Set(allValues));
            mergedProfileData[key] = uniqueValues;
          } else {
            // Field only exists in content, wrap in array
            mergedProfileData[key] = Array.isArray(value) ? value : [value];
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
    
    // First, collect all existing tag values (excluding deprecated fields)
    for (const tag of tags) {
      if (tag.length >= 2) {
        const [key, value] = tag;
        if (value && value !== '' && !DEPRECATED_PROFILE_FIELDS.includes(key)) {
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
    // Use the migrated profile data instead of the original content data
    if (mergedProfileData) {
      for (const [key, value] of Object.entries(mergedProfileData)) {
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
