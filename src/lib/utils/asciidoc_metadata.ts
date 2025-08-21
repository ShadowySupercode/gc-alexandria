/**
 * AsciiDoc Metadata Extraction Service using Asciidoctor
 *
 * Thin wrapper around Asciidoctor's built-in metadata extraction capabilities.
 * Leverages the existing Pharos parser to avoid duplication.
 */

// @ts-ignore
import Processor from "asciidoctor";
import type { Document } from "asciidoctor";

export interface AsciiDocMetadata {
  title?: string;
  authors?: string[];
  version?: string;
  edition?: string;
  publicationDate?: string;
  publisher?: string;
  summary?: string;
  coverImage?: string;
  isbn?: string;
  tags?: string[];
  source?: string;
  publishedBy?: string;
  type?: string;
  autoUpdate?: 'yes' | 'ask' | 'no';
  customAttributes?: Record<string, string>;
}

export type SectionMetadata = AsciiDocMetadata;


// Shared attribute mapping based on Asciidoctor standard attributes
const ATTRIBUTE_MAP: Record<string, keyof AsciiDocMetadata> = {
  // Standard Asciidoctor attributes
  "author": "authors",
  "description": "summary",
  "keywords": "tags",
  "revnumber": "version",
  "revdate": "publicationDate",
  "revremark": "edition",
  "title": "title",

  // Custom attributes for Alexandria
  "published_by": "publishedBy",
  "publisher": "publisher",
  "summary": "summary",
  "image": "coverImage",
  "cover": "coverImage",
  "isbn": "isbn",
  "source": "source",
  "type": "type",
  "auto-update": "autoUpdate",
  "version": "version",
  "edition": "edition",
  "published_on": "publicationDate",
  "date": "publicationDate",
  "version-label": "version",
};

/**
 * Creates an Asciidoctor processor instance
 */
function createProcessor() {
  return Processor();
}

/**
 * Decodes HTML entities in a string
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&#8217;': "'",
    '&#8216;': "'",
    '&#8220;': '"',
    '&#8221;': '"',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  };
  
  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char);
  }
  return result;
}

/**
 * Extracts tags from attributes, combining tags and keywords
 */
function extractTagsFromAttributes(attributes: Record<string, any>): string[] {
  const tags: string[] = [];
  const attrTags = attributes["tags"];
  const attrKeywords = attributes["keywords"];

  if (attrTags && typeof attrTags === "string") {
    tags.push(...attrTags.split(",").map((tag) => tag.trim()));
  }

  if (attrKeywords && typeof attrKeywords === "string") {
    tags.push(...attrKeywords.split(",").map((tag) => tag.trim()));
  }

  return [...new Set(tags)]; // Remove duplicates
}

/**
 * Maps attributes to metadata with special handling for authors and tags
 */
function mapAttributesToMetadata(
  attributes: Record<string, any>,
  metadata: AsciiDocMetadata,
  isDocument: boolean = false,
): void {
  for (const [key, value] of Object.entries(attributes)) {
    const metadataKey = ATTRIBUTE_MAP[key.toLowerCase()];
    if (metadataKey && value && typeof value === "string") {
      if (metadataKey === "authors" && isDocument) {
        // Skip author mapping for documents since it's handled manually
        continue;
      } else if (metadataKey === "authors" && !isDocument) {
        // For sections, append author to existing authors array
        if (!metadata.authors) {
          metadata.authors = [];
        }
        metadata.authors.push(value);
      } else if (metadataKey === "tags") {
        // Skip tags mapping since it's handled by extractTagsFromAttributes
        continue;
      } else if (metadataKey === "summary") {
        // Handle summary specially - combine with existing summary if present
        if (metadata.summary) {
          metadata.summary = `${metadata.summary} ${value}`;
        } else {
          metadata.summary = value;
        }
      } else {
        (metadata as any)[metadataKey] = value;
      }
    } else if (value && typeof value === 'string' && !systemAttributes.includes(key)) {
      // Handle unknown/custom attributes - but only if they're not system attributes
      if (!metadata.customAttributes) {
        metadata.customAttributes = {};
      }
      metadata.customAttributes[key] = value;
    }
  }
}

/**
 * Extracts authors from document header only (not sections)
 */
function extractDocumentAuthors(sourceContent: string): string[] {
  const authors: string[] = [];
  const lines = sourceContent.split(/\r?\n/);
  
  // Find the document title line
  let titleLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^=\s+/)) {
      titleLineIndex = i;
      break;
    }
  }
  
  if (titleLineIndex === -1) {
    return authors;
  }
  
  // Look for authors in the lines immediately following the title
  let i = titleLineIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    
    // Stop if we hit a blank line, section header, or content that's not an author
    if (line.trim() === "" || line.match(/^==\s+/)) {
      break;
    }
    
    if (line.includes("<") && !line.startsWith(":")) {
      // This is an author line like "John Doe <john@example.com>"
      const authorName = line.split("<")[0].trim();
      if (authorName) {
        authors.push(authorName);
      }
    } else if (line.startsWith(":")) {
      // This is an attribute line, skip it
      // Don't break here, continue to next line
    } else {
      // Not an author line, stop looking
      break;
    }
    
    i++;
  }
  
  return authors;
}

/**
 * Extracts authors from section header only
 */
function extractSectionAuthors(sectionContent: string): string[] {
  const authors: string[] = [];
  const lines = sectionContent.split(/\r?\n/);
  
  // Find the section title line
  let titleLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^==\s+/)) {
      titleLineIndex = i;
      break;
    }
  }
  
  if (titleLineIndex === -1) {
    return authors;
  }
  
  // Look for authors in the lines immediately following the section title
  let i = titleLineIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    
    // Stop if we hit a blank line, another section header, or content that's not an author
    if (line.trim() === "" || line.match(/^==\s+/)) {
      break;
    }
    
    if (line.includes("<") && !line.startsWith(":")) {
      // This is an author line like "John Doe <john@example.com>"
      const authorName = line.split("<")[0].trim();
      if (authorName) {
        authors.push(authorName);
      }
    } else if (
      line.match(/^[A-Za-z\s]+$/) &&
      line.trim() !== "" && 
      line.trim().split(/\s+/).length <= 2 &&
      !line.startsWith(":")
    ) {
      // This is a simple author name without email (for sections)
      authors.push(line.trim());
    } else if (line.startsWith(":")) {
      // This is an attribute line, skip it
      // Don't break here, continue to next line
    } else {
      // Not an author line, stop looking
      break;
    }
    
    i++;
  }
  
  return authors;
}

// System attributes to filter out when adding custom attributes as tags
const systemAttributes = [
  'attribute-undefined', 'attribute-missing', 'appendix-caption', 'appendix-refsig',
  'caution-caption', 'chapter-refsig', 'example-caption', 'figure-caption',
  'important-caption', 'last-update-label', 'manname-title', 'note-caption',
  'part-refsig', 'preface-title', 'section-refsig', 'table-caption',
  'tip-caption', 'toc-title', 'untitled-label', 'version-label', 'warning-caption'
];

/**
 * Strips section header and attribute lines from content
 */
function stripSectionHeader(sectionContent: string): string {
  const lines = sectionContent.split(/\r?\n/);
  let contentStart = 0;
  
  // Find where the section header ends
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip section title line and attribute lines
    if (
      !line.match(/^=+\s+/) && 
      !line.includes("<") &&
      !line.match(/^.+,\s*.+:\s*.+$/) &&
      !line.match(/^:[^:]+:\s*.+$/) && 
      line.trim() !== ""
    ) {
      contentStart = i;
      break;
    }
  }
  
  const processedLines: string[] = [];
  let lastWasEmpty = false;
  
  for (let i = contentStart; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip attribute lines within content
    if (line.match(/^:[^:]+:\s*.+$/)) {
      continue;
    }
    
    // Handle empty lines - don't add more than one consecutive empty line
    if (line.trim() === '') {
      if (!lastWasEmpty) {
        processedLines.push('');
      }
      lastWasEmpty = true;
    } else {
      processedLines.push(line);
      lastWasEmpty = false;
    }
  }
  
  // Remove extra blank lines and normalize newlines
  return processedLines.join('\n').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

/**
 * Strips document header and attribute lines from content
 */
function stripDocumentHeader(content: string): string {
  const lines = content.split(/\r?\n/);
  let contentStart = 0;
  
  // Find the first line that is actual content (not header, author, or attribute)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip title line, author line, revision line, and attribute lines
    if (
      !line.match(/^=\s+/) && 
      !line.includes("<") &&
      !line.match(/^.+,\s*.+:\s*.+$/) &&
      !line.match(/^:[^:]+:\s*.+$/) && 
      line.trim() !== ""
    ) {
      contentStart = i;
      break;
    }
  }
  
  // Filter out all attribute lines and author lines from the content
  const contentLines = lines.slice(contentStart);
  const filteredLines = contentLines.filter((line) => {
    // Skip attribute lines
    if (line.match(/^:[^:]+:\s*.+$/)) {
      return false;
    }
    return true;
  });
  
  // Ensure deeper headers (====) have proper newlines around them
  const processedLines = [];
  for (let i = 0; i < filteredLines.length; i++) {
    const line = filteredLines[i];
    const prevLine = i > 0 ? filteredLines[i - 1] : '';
    const nextLine = i < filteredLines.length - 1 ? filteredLines[i + 1] : '';
    
    // If this is a deeper header (====+), ensure it has newlines around it
    if (line.match(/^====+\s+/)) {
      // Add newline before if previous line isn't blank
      if (prevLine && prevLine.trim() !== '') {
        processedLines.push('');
      }
      processedLines.push(line);
      // Add newline after if next line isn't blank and exists
      if (nextLine && nextLine.trim() !== '') {
        processedLines.push('');
      }
    } else {
      processedLines.push(line);
    }
  }
  
  // Remove extra blank lines and normalize newlines
  return processedLines.join('\n').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

/**
 * Parses attributes from section content using simple regex
 * Converts :tagname: tagvalue -> [tagname, tagvalue] 
 * Converts :tags: comma,separated -> [t, tag1], [t, tag2], etc.
 */
export function parseSimpleAttributes(content: string): [string, string][] {
  const tags: [string, string][] = [];
  const lines = content.split(/\r?\n/);
  
  for (const line of lines) {
    const match = line.match(/^:([^:]+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      const tagName = key.trim();
      const tagValue = value.trim();
      
      if (tagName === 'tags') {
        // Special handling for :tags: - split into individual t-tags
        const tags_list = tagValue.split(',').map(t => t.trim()).filter(t => t.length > 0);
        tags_list.forEach(tag => {
          tags.push(['t', tag]);
        });
      } else {
        // Regular attribute -> [tagname, tagvalue]
        tags.push([tagName, tagValue]);
      }
    }
  }
  
  return tags;
}

/**
 * Extracts metadata from AsciiDoc document using Asciidoctor
 */
export function extractDocumentMetadata(inputContent: string): {
  metadata: AsciiDocMetadata;
  content: string;
} {
  const asciidoctor = createProcessor();
  const document = asciidoctor.load(inputContent, {
    standalone: false,
  }) as Document;

  const metadata: AsciiDocMetadata = {};
  const attributes = document.getAttributes();

  // Extract basic metadata
  const title = document.getTitle();
  if (title) metadata.title = decodeHtmlEntities(title);

  // Handle multiple authors - combine header line and attributes
  const authors = extractDocumentAuthors(document.getSource());

  // Get authors from attributes in the document header only (including multiple :author: lines)
  const lines = document.getSource().split(/\r?\n/);
  let inDocumentHeader = true;
  for (const line of lines) {
    // Stop scanning when we hit a section header
    if (line.match(/^==\s+/)) {
      inDocumentHeader = false;
      break;
    }
    
    // Process :author: attributes regardless of other content
    if (inDocumentHeader) {
      const match = line.match(/^:author:\s*(.+)$/);
      if (match) {
        const authorName = match[1].trim();
        if (authorName && !authors.includes(authorName)) {
          authors.push(authorName);
        }
      }
    }
  }

  if (authors.length > 0) {
    metadata.authors = [...new Set(authors)]; // Remove duplicates
  }

  // Extract revision info (only if it looks like valid revision data)
  const revisionNumber = document.getRevisionNumber();
  if (revisionNumber && revisionNumber !== 'Version' && !revisionNumber.includes('==')) {
    metadata.version = revisionNumber;
  }

  const revisionRemark = document.getRevisionRemark();
  if (revisionRemark && !revisionRemark.includes('[NOTE]') && !revisionRemark.includes('==')) {
    metadata.publishedBy = revisionRemark;
  }

  const revisionDate = document.getRevisionDate();
  if (revisionDate && !revisionDate.includes('[NOTE]') && !revisionDate.includes('==')) {
    metadata.publicationDate = revisionDate;
  }

  // Map attributes to metadata (but skip version and publishedBy if we already have them from revision)
  mapAttributesToMetadata(attributes, metadata, true);

  // If we got version from revision, don't override it with attribute
  if (revisionNumber) {
    metadata.version = revisionNumber;
  }

  // If we got publishedBy from revision, don't override it with attribute
  if (revisionRemark) {
    metadata.publishedBy = revisionRemark;
  }

  // Handle tags and keywords
  const tags = extractTagsFromAttributes(attributes);
  if (tags.length > 0) {
    metadata.tags = tags;
  }

  const content = stripDocumentHeader(document.getSource());
  return { metadata, content };
}

/**
 * Extracts metadata from a section using Asciidoctor
 */
export function extractSectionMetadata(inputSectionContent: string): {
  metadata: SectionMetadata;
  content: string;
  title: string;
} {
  // Extract title directly from the content using regex for more control
  const titleMatch = inputSectionContent.match(/^(=+)\s+(.+)$/m);
  let title = '';
  if (titleMatch) {
    title = titleMatch[2].trim();
  }
  
  const metadata: SectionMetadata = { title };
  
  // Extract authors from section content
  const authors = extractSectionAuthors(inputSectionContent);
  
  // Get authors from attributes (including multiple :author: lines)
  const lines = inputSectionContent.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^:author:\s*(.+)$/);
    if (match) {
      const authorName = match[1].trim();
      if (authorName && !authors.includes(authorName)) {
        authors.push(authorName);
      }
    }
  }
  
  if (authors.length > 0) {
    metadata.authors = authors;
  }

  // Extract tags using parseSimpleAttributes (which is what's used in generateNostrEvents)
  const simpleAttrs = parseSimpleAttributes(inputSectionContent);
  const tags = simpleAttrs.filter(attr => attr[0] === 't').map(attr => attr[1]);
  if (tags.length > 0) {
    metadata.tags = tags;
  }

  const content = stripSectionHeader(inputSectionContent);
  return { metadata, content, title };
}


/**
 * Converts metadata to Nostr event tags
 */
export function metadataToTags(
  metadata: AsciiDocMetadata | SectionMetadata,
): [string, string][] {
  const tags: [string, string][] = [];

  if (metadata.title) tags.push(["title", metadata.title]);
  if (metadata.authors?.length) {
    metadata.authors.forEach((author) => tags.push(["author", author]));
  }
  if (metadata.version) tags.push(["version", metadata.version]);
  if (metadata.edition) tags.push(["edition", metadata.edition]);
  if (metadata.publicationDate) {
    tags.push(["published_on", metadata.publicationDate]);
  }
  if (metadata.publishedBy) tags.push(["published_by", metadata.publishedBy]);
  if (metadata.summary) tags.push(["summary", metadata.summary]);
  if (metadata.coverImage) tags.push(["image", metadata.coverImage]);
  if (metadata.isbn) tags.push(["i", metadata.isbn]);
  if (metadata.source) tags.push(["source", metadata.source]);
  if (metadata.type) tags.push(["type", metadata.type]);
  if (metadata.autoUpdate) tags.push(["auto-update", metadata.autoUpdate]);
  if (metadata.tags?.length) {
    metadata.tags.forEach((tag) => tags.push(["t", tag]));
  }

  // Add custom attributes as tags, but filter out system attributes
  if (metadata.customAttributes) {
    Object.entries(metadata.customAttributes).forEach(([key, value]) => {
      if (!systemAttributes.includes(key)) {
        tags.push([key, value]);
      }
    });
  }

  return tags;
}

/**
 * Removes metadata from AsciiDoc content
 */
export function removeMetadataFromContent(content: string): string {
  const { content: cleanedContent } = extractDocumentMetadata(content);
  return cleanedContent;
}

/**
 * Extracts metadata from content that only contains sections (no document header)
 * This is useful when content flows from ZettelEditor to EventInput
 */
export function extractMetadataFromSectionsOnly(content: string): {
  metadata: AsciiDocMetadata;
  content: string;
} {
  const lines = content.split(/\r?\n/);
  const sections: Array<{
    metadata: SectionMetadata;
    content: string;
    title: string;
  }> = [];

  let currentSection: string | null = null;
  let currentSectionContent: string[] = [];

  // Parse sections from the content
  for (const line of lines) {
    if (line.match(/^==\s+/)) {
      // Save previous section if exists
      if (currentSection) {
        const sectionContent = currentSectionContent.join("\n");
        sections.push(extractSectionMetadata(sectionContent));
      }

      // Start new section
      currentSection = line;
      currentSectionContent = [line];
    } else if (currentSection) {
      currentSectionContent.push(line);
    }
  }

  // Save the last section
  if (currentSection) {
    const sectionContent = currentSectionContent.join("\n");
    sections.push(extractSectionMetadata(sectionContent));
  }

  // For section-only content, we don't have document metadata
  // Return the first section's title as the document title if available
  const metadata: AsciiDocMetadata = {};
  if (sections.length > 0 && sections[0].title) {
    metadata.title = sections[0].title;
  }

  return { metadata, content };
}






/**
 * Smart metadata extraction that handles both document headers and section-only content
 */
export function extractSmartMetadata(content: string): {
  metadata: AsciiDocMetadata;
  content: string;
} {
  // Check if content has a document header
  const hasDocumentHeader = content.match(/^=\s+/m);

  if (hasDocumentHeader) {
    // Check if it's a minimal document header (just title, no other metadata)
    const lines = content.split(/\r?\n/);
    const titleLine = lines.find((line) => line.match(/^=\s+/));
    const hasOtherMetadata = lines.some((line) =>
      line.includes("<") || // author line
      line.match(/^.+,\s*.+:\s*.+$/) // revision line
    );

    if (hasOtherMetadata) {
      // Full document with metadata - use standard extraction
      return extractDocumentMetadata(content);
    } else {
      // Minimal document header (just title) - preserve the title line for 30040 events
      const title = titleLine?.replace(/^=\s+/, "").trim();
      const metadata: AsciiDocMetadata = {};
      if (title) {
        metadata.title = title;
      }

      // Keep the title line in content for 30040 events
      return { metadata, content };
    }
  } else {
    return extractMetadataFromSectionsOnly(content);
  }
}
