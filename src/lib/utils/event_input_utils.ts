import type { NDKEvent } from "./nostrUtils.ts";
import { get } from "svelte/store";
import { ndkInstance } from "../ndk.ts";
import { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
import { EVENT_KINDS } from "./search_constants";
import { 
  extractDocumentMetadata, 
  extractSectionMetadata, 
  parseAsciiDocWithMetadata,
  metadataToTags,
  removeMetadataFromContent
} from "./asciidoc_metadata";

// =========================
// Validation
// =========================

/**
 * Returns true if the event kind requires a d-tag (kinds 30000-39999).
 */
export function requiresDTag(kind: number): boolean {
  return (
    kind >= EVENT_KINDS.ADDRESSABLE.MIN && kind <= EVENT_KINDS.ADDRESSABLE.MAX
  );
}

/**
 * Returns true if the tags array contains at least one d-tag with a non-empty value.
 */
export function hasDTag(tags: [string, string][]): boolean {
  return tags.some(([k, v]) => k === "d" && v && v.trim() !== "");
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
export function validateNotAsciidoc(content: string): {
  valid: boolean;
  reason?: string;
} {
  if (containsAsciiDocHeaders(content)) {
    return {
      valid: false,
      reason:
        "Kind 30023 must not contain AsciiDoc headers (lines starting with = or ==).",
    };
  }
  return { valid: true };
}

/**
 * Validates AsciiDoc content. Must start with '=' and contain at least one '==' section header.
 * Returns { valid, reason }.
 */
export function validateAsciiDoc(content: string): {
  valid: boolean;
  reason?: string;
} {
  if (!content.trim().startsWith("=")) {
    return {
      valid: false,
      reason: 'AsciiDoc must start with a document title ("=").',
    };
  }
  if (!/^==\s+/m.test(content)) {
    return {
      valid: false,
      reason: 'AsciiDoc must contain at least one section header ("==").',
    };
  }
  return { valid: true };
}

/**
 * Validates that a 30040 event set will be created correctly.
 * Returns { valid, reason }.
 */
export function validate30040EventSet(content: string): {
  valid: boolean;
  reason?: string;
  warning?: string;
} {
  // Check for "index card" format first
  const lines = content.split(/\r?\n/);
  const { metadata } = extractDocumentMetadata(content);
  const documentTitle = metadata.title;
  const nonEmptyLines = lines.filter(line => line.trim() !== "").map(line => line.trim());
  const isIndexCardFormat = documentTitle && 
    nonEmptyLines.length === 2 && 
    nonEmptyLines[0].startsWith("=") && 
    nonEmptyLines[1].toLowerCase() === "index card";
  
  if (isIndexCardFormat) {
    return { valid: true };
  }

  // Check that we have a document title
  if (!documentTitle) {
    return {
      valid: false,
      reason:
        '30040 events must have a document title (line starting with "=").',
    };
  }

  // Check that the content will result in an empty 30040 event
  // The 30040 event should have empty content, with all content split into 30041 events
  if (!content.trim().startsWith("=")) {
    return {
      valid: false,
      reason: '30040 events must start with a document title ("=").',
    };
  }

  // Check for duplicate document headers (=)
  const documentHeaderMatches = content.match(/^=\s+/gm);
  if (documentHeaderMatches && documentHeaderMatches.length > 1) {
    return {
      valid: false,
      reason: '30040 events must have exactly one document title ("="). Found multiple document headers.',
    };
  }

  // Parse the content to check sections
  const parsed = parseAsciiDocWithMetadata(content);
  const hasSections = parsed.sections.length > 0;
  
  if (!hasSections) {
    return {
      valid: true,
      warning: "No section headers (==) found. This will create a 30040 index event and a single 30041 preamble section. Continue?",
    };
  }

  // Only validate as AsciiDoc if we have sections
  const asciiDocValidation = validateAsciiDoc(content);
  if (!asciiDocValidation.valid) {
    return asciiDocValidation;
  }

  // Check for empty sections
  const emptySections = parsed.sections.filter(section => section.content.trim() === "");
  if (emptySections.length > 0) {
    return {
      valid: true,
      warning: "You are creating sections that contain no content. Proceed?",
    };
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
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Converts a title string to a valid d-tag (lowercase, hyphens, no punctuation).
 */
export function titleToDTag(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens
}

/**
 * Extracts the topmost Markdown # header (line starting with '# ').
 */
function extractMarkdownTopHeader(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
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
  baseEvent: Partial<NDKEvent> & { pubkey: string; created_at: number },
): { indexEvent: NDKEvent; sectionEvents: NDKEvent[] } {
  console.log("=== build30040EventSet called ===");
  console.log("Input content:", content);
  console.log("Input tags:", tags);
  console.log("Input baseEvent:", baseEvent);

  const ndk = getNdk();
  console.log("NDK instance:", ndk);

  // Parse the AsciiDoc content with metadata extraction
  const parsed = parseAsciiDocWithMetadata(content);
  console.log("Parsed AsciiDoc:", parsed);

  // Check if this is an "index card" format (no sections, just title + "index card")
  const lines = content.split(/\r?\n/);
  const documentTitle = parsed.metadata.title;
  
  // For index card format, the content should be exactly: title + "index card"
  const nonEmptyLines = lines.filter(line => line.trim() !== "").map(line => line.trim());
  const isIndexCardFormat = documentTitle && 
    nonEmptyLines.length === 2 && 
    nonEmptyLines[0].startsWith("=") && 
    nonEmptyLines[1].toLowerCase() === "index card";
  
  if (isIndexCardFormat) {
    console.log("Creating index card format (no sections)");
    const indexDTag = normalizeDTagValue(documentTitle);
    
    // Convert document metadata to tags
    const metadataTags = metadataToTags(parsed.metadata);
    
    const indexEvent: NDKEvent = new NDKEventClass(ndk, {
      kind: 30040,
      content: "",
      tags: [
        ...tags,
        ...metadataTags,
        ["d", indexDTag],
        ["title", documentTitle],
      ],
      pubkey: baseEvent.pubkey,
      created_at: baseEvent.created_at,
    });
    
    console.log("Final index event (index card):", indexEvent);
    console.log("=== build30040EventSet completed (index card) ===");
    return { indexEvent, sectionEvents: [] };
  }

  // Generate the index d-tag first
  const indexDTag = documentTitle ? normalizeDTagValue(documentTitle) : "index";
  console.log("Index event:", { documentTitle, indexDTag });

  // Create section events with their metadata
  const sectionEvents: NDKEvent[] = parsed.sections.map((section, i) => {
    const sectionDTag = `${indexDTag}-${normalizeDTagValue(section.title)}`;
    console.log(`Creating section ${i}:`, { 
      title: section.title, 
      dTag: sectionDTag, 
      content: section.content,
      metadata: section.metadata 
    });
    
    // Convert section metadata to tags
    const sectionMetadataTags = metadataToTags(section.metadata);
    
    return new NDKEventClass(ndk, {
      kind: 30041,
      content: section.content,
      tags: [
        ...tags,
        ...sectionMetadataTags,
        ["d", sectionDTag], 
        ["title", section.title]
      ],
      pubkey: baseEvent.pubkey,
      created_at: baseEvent.created_at,
    });
  });

  // Create proper a tags with format: kind:pubkey:d-tag
  const aTags = sectionEvents.map(event => {
    const dTag = event.tags.find(([k]) => k === "d")?.[1];
    return ["a", `30041:${baseEvent.pubkey}:${dTag}`] as [string, string];
  });
  console.log("A tags:", aTags);

  // Convert document metadata to tags
  const metadataTags = metadataToTags(parsed.metadata);

  const indexTags = [
    ...tags,
    ...metadataTags,
    ["d", indexDTag],
    ["title", documentTitle || "Untitled"],
    ...aTags,
  ];

  const indexEvent: NDKEvent = new NDKEventClass(ndk, {
    kind: 30040,
    content: "",
    tags: indexTags,
    pubkey: baseEvent.pubkey,
    created_at: baseEvent.created_at,
  });
  console.log("Final index event:", indexEvent);
  console.log("=== build30040EventSet completed ===");
  return { indexEvent, sectionEvents };
}

/**
 * Returns the appropriate title tag for a given event kind and content.
 * - 30041, 30818: AsciiDoc document header (first '= ' line)
 * - 30023: Markdown topmost '# ' header
 */
export function getTitleTagForEvent(
  kind: number,
  content: string,
): string | null {
  if (kind === 30041 || kind === 30818) {
    const { metadata } = extractDocumentMetadata(content);
    return metadata.title || null;
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
export function getDTagForEvent(
  kind: number,
  content: string,
  existingDTag?: string,
): string | null {
  if (existingDTag && existingDTag.trim() !== "") {
    return existingDTag.trim();
  }

  if (kind === 30023) {
    const title = extractMarkdownTopHeader(content);
    return title ? normalizeDTagValue(title) : null;
  }

  if (kind === 30041 || kind === 30818) {
    const { metadata } = extractDocumentMetadata(content);
    return metadata.title ? normalizeDTagValue(metadata.title) : null;
  }

  return null;
}

/**
 * Returns a description of what a 30040 event structure should be.
 */
export function get30040EventDescription(): string {
  return `30040 events are publication indexes that organize AsciiDoc content into structured publications.

**Supported Structures:**

1. **Normal Document** (with sections):
   = Document Title
   :author: Author Name
   :summary: Document description
   :keywords: tag1, tag2, tag3
   
   == Section 1
   Section content here...
   
   == Section 2
   More content...

2. **Index Card** (empty publication):
   = Publication Title
   index card

3. **Skeleton Document** (empty sections):
   = Document Title
   
   == Empty Section 1
   
   == Empty Section 2

4. **Preamble Document** (with preamble content):
   = Document Title
   :author: Author Name
   :summary: Document description
   :keywords: tag1, tag2, tag3

   Preamble content here...

   == Section 1
   Section content here...

**Metadata Extraction:**
- Document title, authors, version, publication date, and publisher are extracted from header lines
- Additional metadata (summary/description, keywords/tags, image, ISBN, etc.) are extracted from attributes
- Multiple authors and summaries are preserved
- All metadata is converted to appropriate Nostr event tags

**Event Structure:**
- 30040 index event: Empty content with metadata tags and a-tags referencing sections
- 30041 section events: Individual section content with section-specific metadata

**Special Features:**
- Preamble content (between header and first section) is preserved
- Multiple authors and descriptions are supported
- Keywords and tags are automatically converted to Nostr t-tags
- Index card format creates empty publications without sections`;
}

/**
 * Analyzes a 30040 event to determine if it was created correctly.
 * Returns { valid, issues } where issues is an array of problems found.
 */
export function analyze30040Event(event: {
  content: string;
  tags: [string, string][];
  kind: number;
}): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check if it's actually a 30040 event
  if (event.kind !== 30040) {
    issues.push("Event is not kind 30040");
    return { valid: false, issues };
  }

  // Check if content is empty (30040 should be metadata only)
  if (event.content && event.content.trim() !== "") {
    issues.push("30040 events should have empty content (metadata only)");
    issues.push("Content should be split into separate 30041 events");
  }

  // Check for required tags
  const hasTitle = event.tags.some(([k, v]) => k === "title" && v);
  const hasDTag = event.tags.some(([k, v]) => k === "d" && v);
  const hasATags = event.tags.some(([k, v]) => k === "a" && v);

  if (!hasTitle) {
    issues.push("Missing title tag");
  }
  if (!hasDTag) {
    issues.push("Missing d tag");
  }
  if (!hasATags) {
    issues.push("Missing a tags (should reference 30041 content events)");
  }

  // Check if a tags have the correct format (kind:pubkey:d-tag)
  const aTags = event.tags.filter(([k, v]) => k === "a" && v);
  for (const [, value] of aTags) {
    if (!value.includes(":")) {
      issues.push(
        `Invalid a tag format: ${value} (should be "kind:pubkey:d-tag")`,
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Returns guidance on how to fix incorrect 30040 events.
 */
export function get30040FixGuidance(): string {
  return `To fix a 30040 event:

1. **Content Structure**: Ensure your AsciiDoc starts with a document title (= Title)
   - Add at least one section (== Section) for normal documents
   - Use "index card" format for empty publications
   - Include metadata in header lines or attributes, 
     or add them manually to the tag list

2. **Metadata**: Add relevant metadata to improve discoverability:
   - Author: Use header line or :author: attribute
   - Summary: Use :summary: or :description: attribute
   - Keywords: Use :keywords: or :tags: attribute
   - Version: Use revision line or :version: attribute
   - Publication date: Use revision line or :published_on: attribute

3. **Event Structure**: The system will automatically create:
   - 30040 index event: Empty content with metadata and a-tags
   - 30041 section events: Individual section content with section metadata

4. **Common Issues**:
   - Missing document title: Start with "= Your Title"
   - No sections: Add "== Section Name" or use "index card" format
   - Invalid metadata: Use proper AsciiDoc attribute syntax (:key: value)

5. **Best Practices**:
   - Include descriptive titles and summaries
   - Use keywords for better searchability
   - Add author information when relevant
   - Consider using preamble content for introductions`;
}
