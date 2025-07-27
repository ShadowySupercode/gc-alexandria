/**
 * AsciiDoc Metadata Extraction Service
 * 
 * Extracts metadata from AsciiDoc document headers and section headers,
 * mapping them to Nostr event tags according to NKBIP-01 specification.
 * 
 * Document header structure:
 * = Document Title
 * Author Name <email@example.com>
 * version, date, revision info
 * :attribute: value
 * 
 * The first empty line marks the end of the header and start of the document body.
 */

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
}

// Sections use the same metadata structure as documents
export type SectionMetadata = AsciiDocMetadata;

export interface ParsedAsciiDoc {
  metadata: AsciiDocMetadata;
  content: string;
  sections: Array<{
    metadata: SectionMetadata;
    content: string;
    title: string;
  }>;
}

/**
 * Shared function to parse metadata from attribute entries
 * @param metadata The metadata object to populate
 * @param key The attribute key
 * @param value The attribute value
 */
function parseMetadataAttribute(metadata: AsciiDocMetadata, key: string, value: string): void {
  switch (key.toLowerCase()) {
    case 'author':
      // Accumulate multiple authors
      if (!metadata.authors) {
        metadata.authors = [];
      }
      metadata.authors.push(value);
      break;
    case 'version':
      // Only set version if not already set from revision line
      if (!metadata.version) {
        metadata.version = value;
      }
      break;
    case 'edition':
      metadata.edition = value;
      break;
    case 'published_on':
    case 'date':
      metadata.publicationDate = value;
      break;
    case 'published_by':
    case 'publisher':
      // Only set publishedBy if not already set from revision line
      if (!metadata.publishedBy) {
        metadata.publishedBy = value;
      }
      break;
    case 'summary':
    case 'description':
      // Accumulate multiple summaries/descriptions
      if (!metadata.summary) {
        metadata.summary = value;
      } else {
        // If we already have a summary, append this one
        metadata.summary = metadata.summary + ' ' + value;
      }
      break;
    case 'image':
    case 'cover':
      metadata.coverImage = value;
      break;
    case 'isbn':
      metadata.isbn = value;
      break;
    case 'source':
      metadata.source = value;
      break;
    case 'type':
      metadata.type = value;
      break;
    case 'auto-update':
      if (value === 'yes' || value === 'ask' || value === 'no') {
        metadata.autoUpdate = value;
      }
      break;
    case 'tags':
    case 'keywords':
      // Accumulate multiple tag sets
      if (!metadata.tags) {
        metadata.tags = [];
      }
      const newTags = value.split(',').map(tag => tag.trim());
      metadata.tags.push(...newTags);
      break;
  }
}

/**
 * Shared function to extract metadata from header lines
 * @param lines The lines to process
 * @param startLine The starting line index
 * @param metadata The metadata object to populate
 * @returns The index of the line after the header metadata
 */
function extractHeaderMetadata(lines: string[], startLine: number, metadata: AsciiDocMetadata): number {
  let currentLine = startLine;

  // Process the next two lines for author and revision info
  let processedLines = 0;
  for (let i = 0; i < 2 && currentLine + i < lines.length; i++) {
    const line = lines[currentLine + i];
    
    // Skip empty lines
    if (line.trim() === '') {
      continue;
    }

    // Skip attribute lines (they'll be processed later)
    if (line.startsWith(':')) {
      continue;
    }

    // Check if this is an author line (contains <email>)
    if (line.includes('<') && line.includes('>')) {
      const authorMatch = line.match(/^(.+?)\s*<(.+?)>$/);
      if (authorMatch) {
        const authorName = authorMatch[1].trim();
        metadata.authors = [authorName];
        processedLines++;
        continue;
      }
    }

    // Check if this is a revision line (contains version, date, revision info)
    const revisionMatch = line.match(/^(.+?),\s*(.+?),\s*(.+)$/);
    if (revisionMatch) {
      metadata.version = revisionMatch[1].trim();
      metadata.publicationDate = revisionMatch[2].trim();
      metadata.publishedBy = revisionMatch[3].trim();
      processedLines++;
      continue;
    }

    // If it's not author or revision, it might be a simple author name
    if (!metadata.authors) {
      metadata.authors = [line.trim()];
      processedLines++;
    }
  }

  // Move past the author/revision lines that were actually processed
  currentLine += processedLines;

  // Process attribute entries (lines starting with :)
  while (currentLine < lines.length) {
    const line = lines[currentLine];
    
    // Empty line marks the end of the header
    if (line.trim() === '') {
      break;
    }

    // Check for attribute entries
    const attrMatch = line.match(/^:([^:]+):\s*(.+)$/);
    if (attrMatch) {
      const key = attrMatch[1].trim();
      const value = attrMatch[2].trim();
      parseMetadataAttribute(metadata, key, value);
    }

    currentLine++;
  }

  return currentLine;
}

/**
 * Extracts metadata from AsciiDoc document header
 * @param content The full AsciiDoc content
 * @returns Object containing metadata and cleaned content
 */
export function extractDocumentMetadata(inputContent: string): {
  metadata: AsciiDocMetadata;
  content: string;
} {
  const lines = inputContent.split(/\r?\n/);
  const metadata: AsciiDocMetadata = {};
  let headerEndIndex = -1;
  let currentLine = 0;

  // Find the document title (first line starting with =)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const titleMatch = line.match(/^=\s+(.+)$/);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
      currentLine = i + 1;
      break;
    }
  }

  // If no document title found, return empty metadata
  if (!metadata.title) {
    return { metadata: {}, content: inputContent };
  }

  // Check if this is an index card format (title followed immediately by "index card")
  if (currentLine < lines.length && lines[currentLine].trim() === 'index card') {
    // This is index card format - content starts immediately after title
    headerEndIndex = currentLine;
  } else {
    // Extract header metadata using shared function
    currentLine = extractHeaderMetadata(lines, currentLine, metadata);

    // If we didn't find an empty line, the header ends at the first section
    if (currentLine < lines.length && lines[currentLine].trim() === '') {
      headerEndIndex = currentLine + 1; // Skip the empty line
    } else {
      for (let i = currentLine; i < lines.length; i++) {
        if (lines[i].match(/^==\s+/)) {
          headerEndIndex = i;
          break;
        }
      }
      // If no section found and no empty line, the header ends at the current line
      if (headerEndIndex === -1) {
        headerEndIndex = currentLine;
      }
    }
  }

  // If still no header end found, use the entire content
  if (headerEndIndex === -1) {
    headerEndIndex = lines.length;
  }

  // Extract the content (everything after the header)
  let content = lines.slice(headerEndIndex).join('\n');
  
  // Remove metadata attributes from sections in the content
  content = content.replace(/^:([^:]+):\s*(.+)$/gm, '');

  return { metadata, content };
}

/**
 * Extracts metadata from a section header
 * @param sectionContent The section content including its header
 * @returns Object containing section metadata and cleaned content
 */
export function extractSectionMetadata(inputSectionContent: string): {
  metadata: SectionMetadata;
  content: string;
  title: string;
} {
  const lines = inputSectionContent.split(/\r?\n/);
  const metadata: SectionMetadata = {};
  let title = '';
  let headerEndIndex = -1;
  let currentLine = 0;

  // Find the section title (first line starting with ==)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const titleMatch = line.match(/^==\s+(.+)$/);
    if (titleMatch) {
      title = titleMatch[1].trim();
      metadata.title = title;
      currentLine = i + 1;
      break;
    }
  }

  // If no section title found, return empty metadata
  if (!title) {
    return { metadata: {}, content: inputSectionContent, title: '' };
  }

  // Extract header metadata using shared function
  currentLine = extractHeaderMetadata(lines, currentLine, metadata);

  // If we didn't find an empty line, the header ends at the next section
  if (currentLine < lines.length && lines[currentLine].trim() === '') {
    headerEndIndex = currentLine + 1; // Skip the empty line
  } else {
    for (let i = currentLine; i < lines.length; i++) {
      if (lines[i].match(/^==\s+/)) {
        headerEndIndex = i;
        break;
      }
    }
  }

  // If still no header end found, use the entire content
  if (headerEndIndex === -1) {
    headerEndIndex = lines.length;
  }

  // Extract the content (everything after the header)
  const content = lines.slice(headerEndIndex).join('\n');

  return { metadata, content, title };
}

/**
 * Splits AsciiDoc content into sections and extracts metadata from each
 * @param content The full AsciiDoc content
 * @returns Object containing document metadata and sections with their metadata
 */
export function parseAsciiDocWithMetadata(content: string): ParsedAsciiDoc {
  // First extract document metadata
  const { metadata: docMetadata } = extractDocumentMetadata(content);
  
  // Find the document header end to get the content after the header
  const lines = content.split(/\r?\n/);
  let currentLine = 0;
  
  // Find the document title
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const titleMatch = line.match(/^=\s+(.+)$/);
    if (titleMatch) {
      currentLine = i + 1;
      break;
    }
  }
  
  // Extract header metadata to find where content starts
  const tempMetadata: AsciiDocMetadata = {};
  currentLine = extractHeaderMetadata(lines, currentLine, tempMetadata);
  
  // Get the content after the header (including sections with metadata)
  const docContent = lines.slice(currentLine).join('\n');
  
  // Split into sections
  const sections = splitAsciiDocSections(docContent);
  
  // Extract metadata from each section
  const sectionsWithMetadata = sections.map(section => {
    return extractSectionMetadata(section);
  });

  return {
    metadata: docMetadata,
    content: docContent,
    sections: sectionsWithMetadata
  };
}

/**
 * Splits AsciiDoc content into sections at each '==' header
 * @param content The AsciiDoc content (without document header)
 * @returns Array of section strings
 */
function splitAsciiDocSections(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const sections: string[] = [];
  let currentSection: string[] = [];
  let inSection = false;

  for (const line of lines) {
    // Check if this is a section header
    if (line.match(/^==\s+/)) {
      // Save the previous section if we have one
      if (inSection && currentSection.length > 0) {
        sections.push(currentSection.join('\n').trim());
        currentSection = [];
      }
      
      // Start new section
      currentSection = [line];
      inSection = true;
    } else if (inSection) {
      // Add line to current section
      currentSection.push(line);
    }
  }

  // Add the last section
  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n').trim());
  }

  return sections;
}

/**
 * Converts metadata to Nostr event tags
 * @param metadata The metadata object
 * @returns Array of [tag, value] pairs
 */
export function metadataToTags(metadata: AsciiDocMetadata | SectionMetadata): [string, string][] {
  const tags: [string, string][] = [];

  if (metadata.title) {
    tags.push(['title', metadata.title]);
  }

  if (metadata.authors && metadata.authors.length > 0) {
    metadata.authors.forEach(author => {
      tags.push(['author', author]);
    });
  }

  if (metadata.version) {
    tags.push(['version', metadata.version]);
  }

  if (metadata.edition) {
    tags.push(['edition', metadata.edition]);
  }

  if (metadata.publicationDate) {
    tags.push(['published_on', metadata.publicationDate]);
  }

  if (metadata.publishedBy) {
    tags.push(['published_by', metadata.publishedBy]);
  }

  if (metadata.summary) {
    tags.push(['summary', metadata.summary]);
  }

  if (metadata.coverImage) {
    tags.push(['image', metadata.coverImage]);
  }

  if (metadata.isbn) {
    tags.push(['i', metadata.isbn]);
  }

  if (metadata.source) {
    tags.push(['source', metadata.source]);
  }

  if (metadata.type) {
    tags.push(['type', metadata.type]);
  }

  if (metadata.autoUpdate) {
    tags.push(['auto-update', metadata.autoUpdate]);
  }

  if (metadata.tags && metadata.tags.length > 0) {
    metadata.tags.forEach(tag => {
      tags.push(['t', tag]);
    });
  }

  return tags;
}

/**
 * Removes metadata from AsciiDoc content, leaving only the actual content
 * @param content The full AsciiDoc content
 * @returns Cleaned content without metadata
 */
export function removeMetadataFromContent(content: string): string {
  const { content: docContent } = extractDocumentMetadata(content);
  
  // Remove metadata attributes from sections in the content
  const cleanedContent = docContent.replace(/^:([^:]+):\s*(.+)$/gm, '');
  
  return cleanedContent;
} 