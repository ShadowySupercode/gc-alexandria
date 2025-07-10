import type { NDKEvent } from './nostrUtils';
import { get } from 'svelte/store';
import { ndkInstance } from '$lib/ndk';
import { NDKEvent as NDKEventClass } from '@nostr-dev-kit/ndk';

// =========================
// Validation
// =========================

/**
 * Returns true if the event kind requires a d-tag (kinds 30000-39999).
 */
export function requiresDTag(kind: number): boolean {
  return kind >= 30000 && kind <= 39999;
}

/**
 * Returns true if the tags array contains at least one d-tag with a non-empty value.
 */
export function hasDTag(tags: [string, string][]): boolean {
  return tags.some(([k, v]) => k === 'd' && v && v.trim() !== '');
}

/**
 * Returns true if the content contains AsciiDoc headers (lines starting with '=' or '==').
 */
function containsAsciiDocHeaders(content: string): boolean {
  return /^={1,}\s+/m.test(content);
}

/**
 * Validates that content does NOT contain AsciiDoc headers (for kind 30023).
 * Returns { valid, reason }.
 */
export function validateNotAsciidoc(content: string): { valid: boolean; reason?: string } {
  if (containsAsciiDocHeaders(content)) {
    return {
      valid: false,
      reason: 'Kind 30023 must not contain AsciiDoc headers (lines starting with = or ==).',
    };
  }
  return { valid: true };
}

/**
 * Validates AsciiDoc content. Must start with '=' and contain at least one '==' section header.
 * Returns { valid, reason }.
 */
export function validateAsciiDoc(content: string): { valid: boolean; reason?: string } {
  if (!content.trim().startsWith('=')) {
    return { valid: false, reason: 'AsciiDoc must start with a document title ("=").' };
  }
  if (!/^==\s+/m.test(content)) {
    return { valid: false, reason: 'AsciiDoc must contain at least one section header ("==").' };
  }
  return { valid: true };
}

/**
 * Validates that a 30040 event set will be created correctly.
 * Returns { valid, reason }.
 */
export function validate30040EventSet(content: string): { valid: boolean; reason?: string } {
  // First validate as AsciiDoc
  const asciiDocValidation = validateAsciiDoc(content);
  if (!asciiDocValidation.valid) {
    return asciiDocValidation;
  }
  
  // Check that we have at least one section
  const sectionsResult = splitAsciiDocSections(content);
  if (sectionsResult.sections.length === 0) {
    return { valid: false, reason: '30040 events must contain at least one section.' };
  }
  
  // Check that we have a document title
  const documentTitle = extractAsciiDocDocumentHeader(content);
  if (!documentTitle) {
    return { valid: false, reason: '30040 events must have a document title (line starting with "=").' };
  }
  
  // Check that the content will result in an empty 30040 event
  // The 30040 event should have empty content, with all content split into 30041 events
  if (!content.trim().startsWith('=')) {
    return { valid: false, reason: '30040 events must start with a document title ("=").' };
  }
  
  return { valid: true };
}

// =========================
// Extraction & Normalization
// =========================

/**
 * Normalize a string for use as a d-tag: lowercase, hyphens, alphanumeric only.
 */
function normalizeDTagValue(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Converts a title string to a valid d-tag (lowercase, hyphens, no punctuation).
 */
export function titleToDTag(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '');    // Trim leading/trailing hyphens
}

/**
 * Extracts the first AsciiDoc document header (line starting with '= ').
 */
function extractAsciiDocDocumentHeader(content: string): string | null {
  const match = content.match(/^=\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Extracts all section headers (lines starting with '== ').
 */
function extractAsciiDocSectionHeaders(content: string): string[] {
  return Array.from(content.matchAll(/^==\s+(.+)$/gm)).map(m => m[1].trim());
}

/**
 * Extracts the topmost Markdown # header (line starting with '# ').
 */
function extractMarkdownTopHeader(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Splits AsciiDoc content into sections at each '==' header. Returns array of section strings.
 * Document title (= header) is excluded from sections and only used for the index event title.
 * Section headers (==) are discarded from content.
 * Text between document header and first section becomes a "Preamble" section.
 */
function splitAsciiDocSections(content: string): { sections: string[]; sectionHeaders: string[]; hasPreamble: boolean } {
  const lines = content.split(/\r?\n/);
  const sections: string[] = [];
  const sectionHeaders: string[] = [];
  let current: string[] = [];
  let foundFirstSection = false;
  let hasPreamble = false;
  let preambleContent: string[] = [];
  
  for (const line of lines) {
    // Skip document title lines (= header)
    if (/^=\s+/.test(line)) {
      continue;
    }
    
    // If we encounter a section header (==) and we have content, start a new section
    if (/^==\s+/.test(line)) {
      if (current.length > 0) {
        sections.push(current.join('\n').trim());
        current = [];
      }
      
      // Extract section header for title tag
      const headerMatch = line.match(/^==\s+(.+)$/);
      if (headerMatch) {
        sectionHeaders.push(headerMatch[1].trim());
      }
      
      foundFirstSection = true;
    } else if (foundFirstSection) {
      // Only add lines to current section if we've found the first section
      current.push(line);
    } else {
      // Text before first section becomes preamble
      if (line.trim() !== '') {
        preambleContent.push(line);
      }
    }
  }
  
  // Add the last section
  if (current.length > 0) {
    sections.push(current.join('\n').trim());
  }
  
  // Add preamble as first section if it exists
  if (preambleContent.length > 0) {
    sections.unshift(preambleContent.join('\n').trim());
    sectionHeaders.unshift('Preamble');
    hasPreamble = true;
  }
  
  return { sections, sectionHeaders, hasPreamble };
}

// =========================
// Event Construction
// =========================

/**
 * Returns the current NDK instance from the store.
 */
function getNdk() {
  return get(ndkInstance);
}

/**
 * Builds a set of events for a 30040 publication: one 30040 index event and one 30041 event per section.
 * Each 30041 gets a d-tag (normalized section header) and a title tag (raw section header).
 * The 30040 index event references all 30041s by their d-tag.
 */
export function build30040EventSet(
  content: string,
  tags: [string, string][],
  baseEvent: Partial<NDKEvent> & { pubkey: string; created_at: number }
): { indexEvent: NDKEvent; sectionEvents: NDKEvent[] } {
  console.log('=== build30040EventSet called ===');
  console.log('Input content:', content);
  console.log('Input tags:', tags);
  console.log('Input baseEvent:', baseEvent);
  
  const ndk = getNdk();
  console.log('NDK instance:', ndk);
  
  const sectionsResult = splitAsciiDocSections(content);
  const sections = sectionsResult.sections;
  const sectionHeaders = sectionsResult.sectionHeaders;
  console.log('Sections:', sections);
  console.log('Section headers:', sectionHeaders);
  
  const dTags = sectionHeaders.length === sections.length
    ? sectionHeaders.map(normalizeDTagValue)
    : sections.map((_, i) => `section${i}`);
  console.log('D tags:', dTags);
  
  const sectionEvents: NDKEvent[] = sections.map((section, i) => {
    const header = sectionHeaders[i] || `Section ${i + 1}`;
    const dTag = dTags[i];
    console.log(`Creating section ${i}:`, { header, dTag, content: section });
    return new NDKEventClass(ndk, {
      kind: 30041,
      content: section,
      tags: [
        ...tags,
        ['d', dTag],
        ['title', header],
      ],
      pubkey: baseEvent.pubkey,
      created_at: baseEvent.created_at,
    });
  });
  
  // Create proper a tags with format: kind:pubkey:d-tag
  const aTags = dTags.map(dTag => ['a', `30041:${baseEvent.pubkey}:${dTag}`] as [string, string]);
  console.log('A tags:', aTags);
  
  // Extract document title for the index event
  const documentTitle = extractAsciiDocDocumentHeader(content);
  const indexDTag = documentTitle ? normalizeDTagValue(documentTitle) : 'index';
  console.log('Index event:', { documentTitle, indexDTag });
  
  const indexTags = [
    ...tags,
    ['d', indexDTag],
    ['title', documentTitle || 'Untitled'],
    ...aTags,
  ];
  
  const indexEvent: NDKEvent = new NDKEventClass(ndk, {
    kind: 30040,
    content: '',
    tags: indexTags,
    pubkey: baseEvent.pubkey,
    created_at: baseEvent.created_at,
  });
  console.log('Final index event:', indexEvent);
  console.log('=== build30040EventSet completed ===');
  return { indexEvent, sectionEvents };
}

/**
 * Returns the appropriate title tag for a given event kind and content.
 * - 30041, 30818: AsciiDoc document header (first '= ' line)
 * - 30023: Markdown topmost '# ' header
 */
export function getTitleTagForEvent(kind: number, content: string): string | null {
  if (kind === 30041 || kind === 30818) {
    return extractAsciiDocDocumentHeader(content);
  }
  if (kind === 30023) {
    return extractMarkdownTopHeader(content);
  }
  return null;
}

/**
 * Returns the appropriate d-tag value for a given event kind and content.
 * - 30023: Normalized markdown header
 * - 30041, 30818: Normalized AsciiDoc document header
 * - 30040: Uses existing d-tag or generates from content
 */
export function getDTagForEvent(kind: number, content: string, existingDTag?: string): string | null {
  if (existingDTag && existingDTag.trim() !== '') {
    return existingDTag.trim();
  }
  
  if (kind === 30023) {
    const title = extractMarkdownTopHeader(content);
    return title ? normalizeDTagValue(title) : null;
  }
  
  if (kind === 30041 || kind === 30818) {
    const title = extractAsciiDocDocumentHeader(content);
    return title ? normalizeDTagValue(title) : null;
  }
  
  return null;
} 

/**
 * Returns a description of what a 30040 event structure should be.
 */
export function get30040EventDescription(): string {
  return `30040 events are publication indexes that contain:
- Empty content (metadata only)
- A d-tag for the publication identifier
- A title tag for the publication title
- A tags referencing 30041 content events (one per section)

The content is split into sections, each published as a separate 30041 event.`;
} 

/**
 * Analyzes a 30040 event to determine if it was created correctly.
 * Returns { valid, issues } where issues is an array of problems found.
 */
export function analyze30040Event(event: { content: string; tags: [string, string][]; kind: number }): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check if it's actually a 30040 event
  if (event.kind !== 30040) {
    issues.push('Event is not kind 30040');
    return { valid: false, issues };
  }
  
  // Check if content is empty (30040 should be metadata only)
  if (event.content && event.content.trim() !== '') {
    issues.push('30040 events should have empty content (metadata only)');
    issues.push('Content should be split into separate 30041 events');
  }
  
  // Check for required tags
  const hasTitle = event.tags.some(([k, v]) => k === 'title' && v);
  const hasDTag = event.tags.some(([k, v]) => k === 'd' && v);
  const hasATags = event.tags.some(([k, v]) => k === 'a' && v);
  
  if (!hasTitle) {
    issues.push('Missing title tag');
  }
  if (!hasDTag) {
    issues.push('Missing d tag');
  }
  if (!hasATags) {
    issues.push('Missing a tags (should reference 30041 content events)');
  }
  
  // Check if a tags have the correct format (kind:pubkey:d-tag)
  const aTags = event.tags.filter(([k, v]) => k === 'a' && v);
  for (const [, value] of aTags) {
    if (!value.includes(':')) {
      issues.push(`Invalid a tag format: ${value} (should be "kind:pubkey:d-tag")`);
    }
  }
  
  return { valid: issues.length === 0, issues };
} 

/**
 * Returns guidance on how to fix incorrect 30040 events.
 */
export function get30040FixGuidance(): string {
  return `To fix a 30040 event:

1. **Content Issue**: 30040 events should have empty content. All content should be split into separate 30041 events.

2. **Structure**: A proper 30040 event should contain:
   - Empty content
   - d tag: publication identifier
   - title tag: publication title
   - a tags: references to 30041 content events (format: "30041:pubkey:d-tag")

3. **Process**: When creating a 30040 event:
   - Write your content with document title (= Title) and sections (== Section)
   - The system will automatically split it into one 30040 index event and multiple 30041 content events
   - The 30040 will have empty content and reference the 30041s via a tags`;
} 