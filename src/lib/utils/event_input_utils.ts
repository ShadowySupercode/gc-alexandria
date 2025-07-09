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
 */
function splitAsciiDocSections(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const sections: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^==\s+/.test(line) && current.length > 0) {
      sections.push(current.join('\n').trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    sections.push(current.join('\n').trim());
  }
  return sections;
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
  const ndk = getNdk();
  const sections = splitAsciiDocSections(content);
  const sectionHeaders = extractAsciiDocSectionHeaders(content);
  const dTags = sectionHeaders.length === sections.length
    ? sectionHeaders.map(normalizeDTagValue)
    : sections.map((_, i) => `section${i}`);
  const sectionEvents: NDKEvent[] = sections.map((section, i) => {
    const header = sectionHeaders[i] || `Section ${i + 1}`;
    const dTag = dTags[i];
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
  const indexTags = [
    ...tags,
    ...dTags.map(d => ['a', d] as [string, string]),
  ];
  const indexEvent: NDKEvent = new NDKEventClass(ndk, {
    kind: 30040,
    content: '',
    tags: indexTags,
    pubkey: baseEvent.pubkey,
    created_at: baseEvent.created_at,
  });
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