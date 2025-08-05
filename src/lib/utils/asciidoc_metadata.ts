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

export interface ParsedAsciiDoc {
  metadata: AsciiDocMetadata;
  content: string;
  title: string;
  sections: Array<{
    metadata: SectionMetadata;
    content: string;
    title: string;
  }>;
}

// Shared attribute mapping based on Asciidoctor standard attributes
const ATTRIBUTE_MAP: Record<string, keyof AsciiDocMetadata> = {
  // Standard Asciidoctor attributes
  'author': 'authors',
  'description': 'summary',
  'keywords': 'tags',
  'revnumber': 'version',
  'revdate': 'publicationDate',
  'revremark': 'edition',
  'title': 'title',
  
  // Custom attributes for Alexandria
  'published_by': 'publishedBy',
  'publisher': 'publisher',
  'summary': 'summary',
  'image': 'coverImage',
  'cover': 'coverImage',
  'isbn': 'isbn',
  'source': 'source',
  'type': 'type',
  'auto-update': 'autoUpdate',
  'version': 'version',
  'edition': 'edition',
  'published_on': 'publicationDate',
  'date': 'publicationDate',
  'version-label': 'version',
};

/**
 * Creates an Asciidoctor processor instance
 */
function createProcessor() {
  return Processor();
}

/**
 * Extracts tags from attributes, combining tags and keywords
 */
function extractTagsFromAttributes(attributes: Record<string, any>): string[] {
  const tags: string[] = [];
  const attrTags = attributes['tags'];
  const attrKeywords = attributes['keywords'];
  
  if (attrTags && typeof attrTags === 'string') {
    tags.push(...attrTags.split(',').map(tag => tag.trim()));
  }
  
  if (attrKeywords && typeof attrKeywords === 'string') {
    tags.push(...attrKeywords.split(',').map(tag => tag.trim()));
  }
  
  return [...new Set(tags)]; // Remove duplicates
}

/**
 * Maps attributes to metadata with special handling for authors and tags
 */
function mapAttributesToMetadata(attributes: Record<string, any>, metadata: AsciiDocMetadata, isDocument: boolean = false): void {
  // List of AsciiDoc system attributes to ignore
  const systemAttributes = [
    'attribute-undefined', 'attribute-missing', 'appendix-caption', 'appendix-refsig',
    'caution-caption', 'chapter-refsig', 'example-caption', 'figure-caption',
    'important-caption', 'last-update-label', 'note-caption', 'part-refsig',
    'section-refsig', 'table-caption', 'tip-caption', 'toc-placement',
    'toc-title', 'untitled-label', 'warning-caption', 'asciidoctor-version',
    'safe-mode-name', 'backend', 'user-home', 'doctype', 'htmlsyntax',
    'outfilesuffix', 'filetype', 'basebackend', 'stylesdir', 'iconsdir',
    'localdate', 'localyear', 'localtime', 'localdatetime', 'docdate',
    'docyear', 'doctime', 'docdatetime', 'doctitle', 'language',
    'firstname', 'authorinitials', 'authors'
  ];

  for (const [key, value] of Object.entries(attributes)) {
    const metadataKey = ATTRIBUTE_MAP[key.toLowerCase()];
    if (metadataKey && value && typeof value === 'string') {
      if (metadataKey === 'authors' && isDocument) {
        // Skip author mapping for documents since it's handled manually
        continue;
      } else if (metadataKey === 'authors' && !isDocument) {
        // For sections, append author to existing authors array
        if (!metadata.authors) {
          metadata.authors = [];
        }
        metadata.authors.push(value);
      } else if (metadataKey === 'tags') {
        // Skip tags mapping since it's handled by extractTagsFromAttributes
        continue;
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
 * Extracts authors from header line (document or section)
 */
function extractAuthorsFromHeader(sourceContent: string, isSection: boolean = false): string[] {
  const authors: string[] = [];
  const lines = sourceContent.split(/\r?\n/);
  const headerPattern = isSection ? /^==\s+/ : /^=\s+/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(headerPattern)) {
      // Found title line, check subsequent lines for authors
      let j = i + 1;
      while (j < lines.length) {
        const authorLine = lines[j];
        
        // Stop if we hit a blank line or content that's not an author
        if (authorLine.trim() === '') {
          break;
        }
        
        // Skip section headers at any level (they start with ==, ===, etc.)
        if (authorLine.match(/^==+\s+/)) {
          // This is a section header, stop looking for authors
          break;
        }
        
        if (authorLine.includes('<') && !authorLine.startsWith(':')) {
          // This is an author line like "John Doe <john@example.com>"
          const authorName = authorLine.split('<')[0].trim();
          if (authorName) {
            authors.push(authorName);
          }
        } else if (isSection && authorLine.match(/^[A-Za-z\s]+$/) && authorLine.trim() !== '' && 
                   authorLine.trim().split(/\s+/).length <= 2) {
          // This is a simple author name without email (for sections)
          authors.push(authorLine.trim());
        } else if (authorLine.startsWith(':')) {
          // This is an attribute line, skip it - attributes are handled by mapAttributesToMetadata
          // Don't break here, continue to next line
        } else {
          // Not an author line, stop looking
          break;
        }
        
        j++;
      }
      break;
    }
  }
  
  return authors;
}

/**
 * Strips header and attribute lines from content
 */
function stripHeaderAndAttributes(content: string, isSection: boolean = false): string {
  const lines = content.split(/\r?\n/);
  let contentStart = 0;
  const headerPattern = isSection ? /^==\s+/ : /^=\s+/;
  
  // Find the first line that is actual content (not header, author, or attribute)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip title line, author line, revision line, and attribute lines
    if (!line.match(headerPattern) && !line.includes('<') && !line.match(/^.+,\s*.+:\s*.+$/) && 
        !line.match(/^:[^:]+:\s*.+$/) && line.trim() !== '') {
      contentStart = i;
      break;
    }
  }

  // Filter out all attribute lines and author lines from the content
  const contentLines = lines.slice(contentStart);
  const filteredLines = contentLines.filter(line => {
    // Skip attribute lines
    if (line.match(/^:[^:]+:\s*.+$/)) {
      return false;
    }
    // Skip author lines (simple names without email)
    if (isSection && line.match(/^[A-Za-z\s]+$/) && line.trim() !== '' && line.trim().split(/\s+/).length <= 2) {
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
function parseSimpleAttributes(content: string): [string, string][] {
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
  const document = asciidoctor.load(inputContent, { standalone: false }) as Document;

  const metadata: AsciiDocMetadata = {};
  const attributes = document.getAttributes();

  // Extract basic metadata
  const title = document.getTitle();
  if (title) metadata.title = title;

  // Handle multiple authors - combine header line and attributes
  const authors = extractAuthorsFromHeader(document.getSource());
  
  // Get authors from attributes (but avoid duplicates)
  const attrAuthor = attributes['author'];
  if (attrAuthor && typeof attrAuthor === 'string' && !authors.includes(attrAuthor)) {
    authors.push(attrAuthor);
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

  const content = stripHeaderAndAttributes(document.getSource());
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
  const asciidoctor = createProcessor();
  const document = asciidoctor.load(`= Temp\n\n${inputSectionContent}`, { standalone: false }) as Document;
  const sections = document.getSections();
  
  if (sections.length === 0) {
    return { metadata: {}, content: inputSectionContent, title: '' };
  }

  const section = sections[0];
  const title = section.getTitle() || '';
  const metadata: SectionMetadata = { title };
  
  // Parse attributes from the section content (no longer used - we use simple parsing in generateNostrEvents)
  const attributes = {};

  // Extract authors from section content
  const authors = extractAuthorsFromHeader(inputSectionContent, true);
  if (authors.length > 0) {
    metadata.authors = authors;
  }

  // Map attributes to metadata (sections can have authors)
  mapAttributesToMetadata(attributes, metadata, false);

  // Handle tags and keywords
  const tags = extractTagsFromAttributes(attributes);
  if (tags.length > 0) {
    metadata.tags = tags;
  }

  const content = stripHeaderAndAttributes(inputSectionContent, true);
  return { metadata, content, title };
}

/**
 * Parses AsciiDoc content into sections with metadata
 */
export function parseAsciiDocWithMetadata(content: string): ParsedAsciiDoc {
  const asciidoctor = createProcessor();
  const document = asciidoctor.load(content, { standalone: false }) as Document;
  const { metadata: docMetadata } = extractDocumentMetadata(content);
  
  // Parse the original content to find section attributes
  const lines = content.split(/\r?\n/);
  const sectionsWithMetadata: Array<{
    metadata: SectionMetadata;
    content: string;
    title: string;
  }> = [];
  let currentSection: string | null = null;
  let currentSectionContent: string[] = [];
  
  for (const line of lines) {
    if (line.match(/^==\s+/)) {
      // Save previous section if exists
      if (currentSection) {
        const sectionContent = currentSectionContent.join('\n');
        sectionsWithMetadata.push(extractSectionMetadata(sectionContent));
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
    const sectionContent = currentSectionContent.join('\n');
    sectionsWithMetadata.push(extractSectionMetadata(sectionContent));
  }

  return {
    metadata: docMetadata,
    content: document.getSource(),
    title: docMetadata.title || '',
    sections: sectionsWithMetadata
  };
}

/**
 * Converts metadata to Nostr event tags
 */
export function metadataToTags(metadata: AsciiDocMetadata | SectionMetadata): [string, string][] {
  const tags: [string, string][] = [];

  if (metadata.title) tags.push(['title', metadata.title]);
  if (metadata.authors?.length) {
    metadata.authors.forEach(author => tags.push(['author', author]));
  }
  if (metadata.version) tags.push(['version', metadata.version]);
  if (metadata.edition) tags.push(['edition', metadata.edition]);
  if (metadata.publicationDate) tags.push(['published_on', metadata.publicationDate]);
  if (metadata.publishedBy) tags.push(['published_by', metadata.publishedBy]);
  if (metadata.summary) tags.push(['summary', metadata.summary]);
  if (metadata.coverImage) tags.push(['image', metadata.coverImage]);
  if (metadata.isbn) tags.push(['i', metadata.isbn]);
  if (metadata.source) tags.push(['source', metadata.source]);
  if (metadata.type) tags.push(['type', metadata.type]);
  if (metadata.autoUpdate) tags.push(['auto-update', metadata.autoUpdate]);
  if (metadata.tags?.length) {
    metadata.tags.forEach(tag => tags.push(['t', tag]));
  }

  // Add custom attributes as tags, but filter out system attributes
  if (metadata.customAttributes) {
    const systemAttributes = [
      'attribute-undefined', 'attribute-missing', 'appendix-caption', 'appendix-refsig',
      'caution-caption', 'chapter-refsig', 'example-caption', 'figure-caption',
      'important-caption', 'last-update-label', 'note-caption', 'part-refsig',
      'section-refsig', 'table-caption', 'tip-caption', 'toc-placement',
      'toc-title', 'untitled-label', 'warning-caption', 'asciidoctor-version',
      'safe-mode-name', 'backend', 'user-home', 'doctype', 'htmlsyntax',
      'outfilesuffix', 'filetype', 'basebackend', 'stylesdir', 'iconsdir',
      'localdate', 'localyear', 'localtime', 'localdatetime', 'docdate',
      'docyear', 'doctime', 'docdatetime', 'doctitle', 'language',
      'firstname', 'authorinitials', 'authors'
    ];
    
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
        const sectionContent = currentSectionContent.join('\n');
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
    const sectionContent = currentSectionContent.join('\n');
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
 * Iterative AsciiDoc parsing based on specified level
 * Level 2: Only == sections become events (containing all subsections)
 * Level 3: == sections become indices, === sections become events
 * Level 4: === sections become indices, ==== sections become events, etc.
 */
export function parseAsciiDocIterative(content: string, parseLevel: number = 2): ParsedAsciiDoc {
  const asciidoctor = createProcessor();
  const document = asciidoctor.load(content, { standalone: false }) as Document;
  const { metadata: docMetadata } = extractDocumentMetadata(content);
  
  const lines = content.split(/\r?\n/);
  const targetHeaderPattern = new RegExp(`^${'='.repeat(parseLevel)}\\s+`);
  const sections: Array<{
    metadata: SectionMetadata;
    content: string;
    title: string;
  }> = [];
  
  let currentSection: string | null = null;
  let currentSectionContent: string[] = [];
  let documentContent: string[] = [];
  let inDocumentHeader = true;
  
  for (const line of lines) {
    // Check if we've hit the first section at our target level
    if (line.match(targetHeaderPattern)) {
      inDocumentHeader = false;
      
      // Save previous section if exists
      if (currentSection) {
        const sectionContent = currentSectionContent.join('\n');
        sections.push(extractSectionMetadata(sectionContent));
      }
      
      // Start new section
      currentSection = line;
      currentSectionContent = [line];
    } else if (currentSection) {
      // We're in a section - add content
      currentSectionContent.push(line);
    } else if (inDocumentHeader) {
      // We're still in document content (before first section)
      documentContent.push(line);
    }
  }
  
  // Save the last section
  if (currentSection) {
    const sectionContent = currentSectionContent.join('\n');
    sections.push(extractSectionMetadata(sectionContent));
  }
  
  // Extract document content (everything before first section at target level)
  // Keep the original content with attributes for simple parsing
  const docContent = documentContent.join('\n');
  
  return {
    metadata: docMetadata,
    content: docContent,
    title: docMetadata.title || '',
    sections: sections
  };
}

/**
 * Generates Nostr events from parsed AsciiDoc
 * Based on docreference.md specifications
 */
export function generateNostrEvents(parsed: ParsedAsciiDoc, parseLevel: number = 2, pubkey?: string): {
  indexEvent?: any;
  contentEvents: any[];
} {
  const events: any[] = [];
  
  // Create content events for each section (30041)
  const contentEvents = parsed.sections.map(section => {
    const sectionId = section.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    
    // Extract tags directly from section content using simple regex
    const sectionTags = parseSimpleAttributes(section.content);
    
    return {
      id: '', // Will be generated by Nostr client
      pubkey: '', // Will be set by client  
      created_at: Math.floor(Date.now() / 1000),
      kind: 30041,
      tags: [
        ['d', sectionId],
        ['title', section.title],
        ...sectionTags
      ],
      content: section.content,
      sig: '' // Will be generated by client
    };
  });
  
  // Only create index event if we have a document title (article format)
  if (parsed.title && parsed.title.trim() !== '') {
    // Generate document identifier from title
    const documentId = parsed.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .trim();
    
    // Extract tags directly from document content using simple regex  
    const documentTags = parseSimpleAttributes(parsed.content);
    
    // Create main index event (30040)
    const indexEvent = {
      id: '', // Will be generated by Nostr client
      pubkey: '', // Will be set by client
      created_at: Math.floor(Date.now() / 1000),
      kind: 30040,
      tags: [
        ['d', documentId],
        ['title', parsed.title],
        ...documentTags,
        // Add a-tags for each section
        ...parsed.sections.map(section => {
          const sectionId = section.title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '-')
            .trim();
          const actualPubkey = pubkey || 'pubkey'; // Use actual pubkey if provided, fallback for compatibility
          return ['a', `30041:${actualPubkey}:${sectionId}`, '', '']; // relay will be filled by client
        })
      ],
      content: '', // Index events have empty content
      sig: '' // Will be generated by client
    };
    
    return {
      indexEvent,
      contentEvents
    };
  }
  
  // For scattered notes, return only content events
  return {
    contentEvents
  };
}

/**
 * Detects content type for smart publishing
 */
export function detectContentType(content: string): 'article' | 'scattered-notes' | 'none' {
  const hasDocTitle = content.trim().startsWith('=') && !content.trim().startsWith('==');
  const hasSections = content.includes('==');
  
  if (hasDocTitle) {
    return 'article';
  } else if (hasSections) {
    return 'scattered-notes'; 
  } else {
    return 'none';
  }
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
    const titleLine = lines.find(line => line.match(/^=\s+/));
    const hasOtherMetadata = lines.some(line => 
      line.includes('<') || // author line
      line.match(/^.+,\s*.+:\s*.+$/) // revision line
    );
    
    if (hasOtherMetadata) {
      // Full document with metadata - use standard extraction
      return extractDocumentMetadata(content);
         } else {
       // Minimal document header (just title) - preserve the title line for 30040 events
       const title = titleLine?.replace(/^=\s+/, '').trim();
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