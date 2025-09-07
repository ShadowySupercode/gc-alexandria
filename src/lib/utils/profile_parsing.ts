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
 * Extract key-value pairs from malformed JSON content with duplicate keys
 */
function extractKeyValuePairs(content: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const keyValueRegex = /"([^"]+)"\s*:\s*"([^"]*)"/g;
  let match;
  
  while ((match = keyValueRegex.exec(content)) !== null) {
    const [, key, value] = match;
    
    if (value && value !== '' && value !== 'null' && value !== 'undefined') {
      if (result[key]) {
        result[key].push(value);
      } else {
        result[key] = [value];
      }
    }
  }
  
  return result;
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
    
    // Check if content has duplicate keys by looking for common fields
    const hasDuplicateKeys = DEPRECATED_PROFILE_FIELDS.some(field => 
      content.includes(`"${field}"`) || content.includes('"website"') || content.includes('"nip05"') || content.includes('"lud16"')
    );
    
    if (hasDuplicateKeys) {
      const extractedData = extractKeyValuePairs(content);
      return Object.keys(extractedData).length > 0 ? extractedData : parsed;
    }
    
    return parsed;
  } catch (error) {
    // If JSON parsing fails, try to extract multiple values for duplicate keys
    const extractedData = extractKeyValuePairs(content);
    return Object.keys(extractedData).length > 0 ? extractedData : null;
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
    const tagsProfileData: Record<string, string[]> = {};
    for (const tag of event.tags || []) {
      if (tag.length >= 2) {
        const [key, value] = tag;
        if (value && value !== '') {
          if (!tagsProfileData[key]) {
            tagsProfileData[key] = [];
          }
          if (!tagsProfileData[key].includes(value)) {
            tagsProfileData[key].push(value);
          }
        }
      }
    }
    
    // Apply migration to tag data
    const migratedTagValues: Record<string, string[]> = {};
    
    // Process non-deprecated fields
    for (const [key, values] of Object.entries(tagsProfileData)) {
      if (!DEPRECATED_PROFILE_FIELDS.includes(key)) {
        migratedTagValues[key] = values;
      }
    }
    
    // Process deprecated fields with migration
    for (const [key, values] of Object.entries(tagsProfileData)) {
      if (DEPRECATED_PROFILE_FIELDS.includes(key)) {
        const tagObject = { [key]: values[0] };
        const migratedTagObject = migrateDeprecatedFields(tagObject);
        
        for (const [migratedKey, migratedValue] of Object.entries(migratedTagObject)) {
          if (migratedValue !== null && migratedValue !== undefined && migratedValue !== '') {
            const targetKey = migratedKey;
            if (migratedTagValues[targetKey]) {
              // Merge with existing values, avoiding duplicates
              const existingValues = migratedTagValues[targetKey];
              const newValues = Array.isArray(migratedValue) ? migratedValue : [migratedValue];
              const allValues = [...existingValues, ...newValues];
              migratedTagValues[targetKey] = Array.from(new Set(allValues));
            } else {
              migratedTagValues[targetKey] = values;
            }
          }
        }
      }
    }
    
    // Merge content and tag data
    const mergedProfileData: any = { ...migratedTagValues };
    
    if (contentProfileData) {
      for (const [key, value] of Object.entries(contentProfileData)) {
        if (value !== null && value !== undefined && value !== '') {
          const contentValues = Array.isArray(value) ? value : [value];
          if (mergedProfileData[key]) {
            // For the about field, only use tag data to avoid duplication
            if (key === 'about') {
              // Skip content data for about field, keep only tag data
              continue;
            }
            // For other fields, merge content values with tag values, avoiding duplicates
            const allValues = [...contentValues, ...mergedProfileData[key]];
            // Use a more robust deduplication that handles text content properly
            const uniqueValues: string[] = [];
            for (const val of allValues) {
              if (typeof val === 'string') {
                // Normalize the value by trimming and converting escaped newlines to actual newlines
                const normalizedVal = val.trim().replace(/\\n/g, '\n');
                if (normalizedVal && !uniqueValues.some(existing => {
                  if (typeof existing === 'string') {
                    const normalizedExisting = existing.trim().replace(/\\n/g, '\n');
                    return normalizedExisting === normalizedVal;
                  }
                  return false;
                })) {
                  uniqueValues.push(normalizedVal);
                }
              } else if (val) {
                // Handle non-string values
                if (!uniqueValues.includes(val)) {
                  uniqueValues.push(val);
                }
              }
            }
            mergedProfileData[key] = uniqueValues;
          } else {
            mergedProfileData[key] = contentValues;
          }
        }
      }
    }
    
    // Normalize newlines in the about field for proper rendering
    if (mergedProfileData.about && Array.isArray(mergedProfileData.about)) {
      mergedProfileData.about = mergedProfileData.about.map((aboutText: any) => 
        typeof aboutText === 'string' ? aboutText.replace(/\\n/g, '\n') : aboutText
      );
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
    
    // Create comprehensive tags from merged data
    const comprehensiveTags: string[][] = [];
    
    if (mergedProfileData) {
      for (const [key, value] of Object.entries(mergedProfileData)) {
        if (value !== null && value !== undefined && value !== '') {
          const values = Array.isArray(value) ? value : [value];
          for (const val of values) {
            if (val && val !== '') {
              comprehensiveTags.push([key, String(val)]);
            }
          }
        }
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
 * Selection strategy for profile field values
 */
export type ProfileValueStrategy = 'first' | 'best' | 'verified';

/**
 * Utility function to get a value from a profile field array with different selection strategies
 * @param field - The profile field array (e.g., name, displayName, etc.)
 * @param fallback - Fallback value if field is empty or undefined
 * @param strategy - Selection strategy: 'first' (default), 'best' (prioritize HTTPS, etc.), 'verified' (future: NIP-05 verified)
 * @returns The selected value from the array or the fallback
 */
export function getBestProfileValue(
  field: string[] | undefined, 
  fallback: string = "",
  strategy: ProfileValueStrategy = 'first'
): string {
  if (!field || field.length === 0) return fallback;
  
  switch (strategy) {
    case 'best':
      // Prioritize HTTPS URLs, verified domains, etc.
      if (field.some(url => url.startsWith('https://'))) {
        return field.find(url => url.startsWith('https://')) || field[0];
      }
      return field[0];
    case 'verified':
      // Future: Could check NIP-05 verification status
      // For now, just return first value
      return field[0];
    case 'first':
    default:
      return field[0];
  }
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
  return getBestProfileValue(profile.display_name) || 
         getBestProfileValue(profile.name) || 
         (pubkey ? shortenNpub(pubkey) : "Unknown");
}
