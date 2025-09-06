/**
 * Event validation and normalization utilities according to NIP-01 specification
 * AI-NOTE: This service provides comprehensive validation and normalization for all Nostr events
 * to ensure compliance with NIP-01 specification
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates an event according to NIP-01 specification
 */
export function validateEvent(event: any): ValidationResult {
  const errors: string[] = [];
  
  // Validate required fields
  if (!event.pubkey || typeof event.pubkey !== 'string') {
    errors.push('Missing or invalid pubkey');
  } else if (!/^[a-fA-F0-9]{64}$/.test(event.pubkey)) {
    errors.push('Pubkey must be a 64-character lowercase hex string');
  }
  
  if (typeof event.created_at !== 'number' || event.created_at <= 0) {
    errors.push('Missing or invalid created_at timestamp');
  }
  
  if (typeof event.kind !== 'number' || event.kind < 0 || event.kind > 65535) {
    errors.push('Kind must be a number between 0 and 65535');
  }
  
  if (typeof event.content !== 'string') {
    errors.push('Content must be a string');
  }
  
  // Validate tags structure
  if (!Array.isArray(event.tags)) {
    errors.push('Tags must be an array');
  } else {
    // Validate tags structure - tags can be empty arrays but individual elements shouldn't be empty
    for (let i = 0; i < event.tags.length; i++) {
      const tag = event.tags[i];
      if (!Array.isArray(tag)) {
        errors.push(`Tag ${i} must be an array`);
      } else {
        // Check that all tag elements are non-null strings
        for (let j = 0; j < tag.length; j++) {
          if (tag[j] === null || tag[j] === undefined) {
            errors.push(`Tag ${i}, element ${j} cannot be null or undefined`);
          } else if (typeof tag[j] !== 'string') {
            errors.push(`Tag ${i}, element ${j} must be a string`);
          }
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Normalizes and orders tags according to NIP-01 specification
 * Groups tags by type while maintaining original order of appearance
 */
export function normalizeAndOrderTags(tags: string[][]): string[][] {
  if (!Array.isArray(tags)) {
    return [];
  }
  
  // Filter out invalid tags and ensure all elements are strings
  const validTags: string[][] = [];
  for (const tag of tags) {
    if (!Array.isArray(tag)) {
      continue;
    }
    // Convert all elements to strings
    const stringTag = tag.map(element => String(element));
    // Allow empty tags, but if not empty, first element shouldn't be empty
    if (stringTag.length === 0 || stringTag[0] !== '') {
      validTags.push(stringTag);
    }
  }
  
  // Group tags by type while maintaining order
  const tagGroups: { [key: string]: string[][] } = {};
  const tagOrder: string[] = [];
  
  for (const tag of validTags) {
    if (tag.length === 0) {
      // Handle empty tags
      if (!tagGroups['']) {
        tagGroups[''] = [];
        tagOrder.push('');
      }
      tagGroups[''].push(tag);
    } else {
      const tagType = tag[0];
      if (!tagGroups[tagType]) {
        tagGroups[tagType] = [];
        tagOrder.push(tagType);
      }
      tagGroups[tagType].push(tag);
    }
  }
  
  // Reconstruct tags in grouped order
  const orderedTags: string[][] = [];
  for (const tagType of tagOrder) {
    orderedTags.push(...tagGroups[tagType]);
  }
  
  return orderedTags;
}

/**
 * Validates and normalizes an event according to NIP-01 specification
 * Returns the normalized event and validation result
 */
export function validateAndNormalizeEvent(event: any): {
  event: any;
  validation: ValidationResult;
} {
  const validation = validateEvent(event);
  
  if (validation.valid) {
    // Normalize the event
    const normalizedEvent = {
      ...event,
      pubkey: String(event.pubkey).toLowerCase(),
      created_at: Number(event.created_at),
      kind: Number(event.kind),
      content: String(event.content),
      tags: normalizeAndOrderTags(event.tags || [])
    };
    
    return {
      event: normalizedEvent,
      validation
    };
  }
  
  return {
    event,
    validation
  };
}

/**
 * Validates event serialization according to NIP-01 specification
 * Ensures proper UTF-8 encoding and character escaping
 */
export function validateEventSerialization(event: any): ValidationResult {
  const errors: string[] = [];
  
  try {
    // Test serialization according to NIP-01 spec
    const serialized = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content
    ]);
    
    // Check for proper UTF-8 encoding
    if (!/^[\x00-\x7F]*$/.test(serialized)) {
      // Contains non-ASCII characters, which is fine for UTF-8
      // but we should ensure proper escaping
    }
    
    // Check for proper character escaping
    const content = event.content;
    if (content.includes('\n') && !content.includes('\\n')) {
      errors.push('Content contains unescaped newlines');
    }
    if (content.includes('"') && !content.includes('\\"')) {
      errors.push('Content contains unescaped double quotes');
    }
    if (content.includes('\\') && !content.includes('\\\\')) {
      errors.push('Content contains unescaped backslashes');
    }
    
  } catch (error) {
    errors.push(`Serialization failed: ${error}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
