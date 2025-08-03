import { describe, it, expect } from "vitest";
import { 
  extractDocumentMetadata, 
  extractSectionMetadata, 
  parseAsciiDocWithMetadata,
  metadataToTags,
  extractSmartMetadata
} from "../../src/lib/utils/asciidoc_metadata.ts";

describe("AsciiDoc Metadata Extraction", () => {
  const testContent = `= Test Document with Metadata
John Doe <john@example.com>
1.0, 2024-01-15: Alexandria Test
:summary: This is a test document for metadata extraction
:author: Jane Smith
:published_on: 2024-01-15
:published_by: Alexandria Project
:type: article
:keywords: test, metadata, asciidoc
:image: https://example.com/cover.jpg
:isbn: 978-0-123456-78-9
:source: https://github.com/alexandria/test
:auto-update: yes

This is the preamble content that should be included in the document body.

== First Section
:author: Section Author
:summary: This is the first section
:keywords: section1, content

This is the content of the first section.

== Second Section
:summary: This is the second section
:type: chapter

This is the content of the second section.`;

  it("extractDocumentMetadata should extract document metadata correctly", () => {
    const { metadata, content } = extractDocumentMetadata(testContent);
    
    expect(metadata.title).toBe("Test Document with Metadata");
    expect(metadata.authors).toEqual(["John Doe", "Jane Smith"]);
    expect(metadata.version).toBe("1.0");
    expect(metadata.publicationDate).toBe("2024-01-15");
    expect(metadata.publishedBy).toBe("Alexandria Test");
    expect(metadata.summary).toBe("This is a test document for metadata extraction");
    expect(metadata.authors).toEqual(["John Doe", "Jane Smith"]);
    expect(metadata.type).toBe("article");
    expect(metadata.tags).toEqual(["test", "metadata", "asciidoc"]);
    expect(metadata.coverImage).toBe("https://example.com/cover.jpg");
    expect(metadata.isbn).toBe("978-0-123456-78-9");
    expect(metadata.source).toBe("https://github.com/alexandria/test");
    expect(metadata.autoUpdate).toBe("yes");
    
    // Content should not include the header metadata
    expect(content).toContain("This is the preamble content");
    expect(content).toContain("== First Section");
    expect(content).not.toContain("= Test Document with Metadata");
    expect(content).not.toContain(":summary:");
  });

  it("extractSectionMetadata should extract section metadata correctly", () => {
    const sectionContent = `== First Section
:author: Section Author
:description: This is the first section
:tags: section1, content

This is the content of the first section.`;

    const { metadata, content, title } = extractSectionMetadata(sectionContent);
    
    expect(title).toBe("First Section");
    expect(metadata.authors).toEqual(["Section Author"]);
    expect(metadata.summary).toBe("This is the first section");
    expect(metadata.tags).toEqual(["section1", "content"]);
    expect(content).toBe("This is the content of the first section.");
  });

  it("extractSectionMetadata should extract standalone author names and remove them from content", () => {
    const sectionContent = `== Section Header1
Stella
:description: Some summary

Some context text`;

    const { metadata, content, title } = extractSectionMetadata(sectionContent);
    
    expect(title).toBe("Section Header1");
    expect(metadata.authors).toEqual(["Stella"]);
    expect(metadata.summary).toBe("Some summary");
    expect(content.trim()).toBe("Some context text");
  });

  it("extractSectionMetadata should handle multiple standalone author names", () => {
    const sectionContent = `== Section Header1
Stella
:author: John Doe
:description: Some summary

Some context text`;

    const { metadata, content, title } = extractSectionMetadata(sectionContent);
    
    expect(title).toBe("Section Header1");
    expect(metadata.authors).toEqual(["Stella", "John Doe"]);
    expect(metadata.summary).toBe("Some summary");
    expect(content.trim()).toBe("Some context text");
  });

  it("extractSectionMetadata should not extract non-author lines as authors", () => {
    const sectionContent = `== Section Header1
Stella
This is not an author line
:description: Some summary

Some context text`;

    const { metadata, content, title } = extractSectionMetadata(sectionContent);
    
    expect(title).toBe("Section Header1");
    expect(metadata.authors).toEqual(["Stella"]);
    expect(metadata.summary).toBe("Some summary");
    expect(content.trim()).toBe("This is not an author line\nSome context text");
  });

  it("parseAsciiDocWithMetadata should parse complete document", () => {
    const parsed = parseAsciiDocWithMetadata(testContent);
    
    expect(parsed.metadata.title).toBe("Test Document with Metadata");
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0].title).toBe("First Section");
    expect(parsed.sections[1].title).toBe("Second Section");
    expect(parsed.sections[0].metadata.authors).toEqual(["Section Author"]);
    expect(parsed.sections[1].metadata.summary).toBe("This is the second section");
  });

  it("metadataToTags should convert metadata to Nostr tags", () => {
    const metadata = {
      title: "Test Title",
      authors: ["Author 1", "Author 2"],
      version: "1.0",
      summary: "Test summary",
      tags: ["tag1", "tag2"]
    };
    
    const tags = metadataToTags(metadata);
    
    expect(tags).toContainEqual(["title", "Test Title"]);
    expect(tags).toContainEqual(["author", "Author 1"]);
    expect(tags).toContainEqual(["author", "Author 2"]);
    expect(tags).toContainEqual(["version", "1.0"]);
    expect(tags).toContainEqual(["summary", "Test summary"]);
    expect(tags).toContainEqual(["t", "tag1"]);
    expect(tags).toContainEqual(["t", "tag2"]);
  });

  it("should handle index card format correctly", () => {
    const indexCardContent = `= Test Index Card
index card`;

    const { metadata, content } = extractDocumentMetadata(indexCardContent);
    
    expect(metadata.title).toBe("Test Index Card");
    expect(content.trim()).toBe("index card");
  });

  it("should handle empty content gracefully", () => {
    const emptyContent = "";
    
    const { metadata, content } = extractDocumentMetadata(emptyContent);
    
    expect(metadata.title).toBeUndefined();
    expect(content).toBe("");
  });

  it("should handle keywords as tags", () => {
    const contentWithKeywords = `= Test Document
:keywords: keyword1, keyword2, keyword3

Some content here.`;

    const { metadata } = extractDocumentMetadata(contentWithKeywords);
    
    expect(metadata.tags).toEqual(["keyword1", "keyword2", "keyword3"]);
  });

  it("should handle both tags and keywords", () => {
    const contentWithBoth = `= Test Document
:tags: tag1, tag2
:keywords: keyword1, keyword2

Some content here.`;

    const { metadata } = extractDocumentMetadata(contentWithBoth);
    
    // Both tags and keywords are valid, both should be accumulated
    expect(metadata.tags).toEqual(["tag1", "tag2", "keyword1", "keyword2"]);
  });

  it("should handle tags only", () => {
    const contentWithTags = `= Test Document
:tags: tag1, tag2, tag3

Content here.`;

    const { metadata } = extractDocumentMetadata(contentWithTags);
    
    expect(metadata.tags).toEqual(["tag1", "tag2", "tag3"]);
  });

  it("should handle both summary and description", () => {
    const contentWithSummary = `= Test Document
:summary: This is a summary

Content here.`;

    const contentWithDescription = `= Test Document
:description: This is a description

Content here.`;

    const { metadata: summaryMetadata } = extractDocumentMetadata(contentWithSummary);
    const { metadata: descriptionMetadata } = extractDocumentMetadata(contentWithDescription);
    
    expect(summaryMetadata.summary).toBe("This is a summary");
    expect(descriptionMetadata.summary).toBe("This is a description");
  });

  describe('Smart metadata extraction', () => {
    it('should handle section-only content correctly', () => {
      const sectionOnlyContent = `== First Section
:author: Section Author
:description: This is the first section
:tags: section1, content

This is the content of the first section.

== Second Section
:summary: This is the second section
:type: chapter

This is the content of the second section.`;

      const { metadata, content } = extractSmartMetadata(sectionOnlyContent);
      
      // Should extract title from first section
      expect(metadata.title).toBe('First Section');
      
      // Should not have document-level metadata since there's no document header
      expect(metadata.authors).toBeUndefined();
      expect(metadata.version).toBeUndefined();
      expect(metadata.publicationDate).toBeUndefined();
      
      // Content should be preserved
      expect(content).toBe(sectionOnlyContent);
    });

    it('should handle minimal document header (just title) correctly', () => {
      const minimalDocumentHeader = `= Test Document

== First Section
:author: Section Author
:description: This is the first section

This is the content of the first section.

== Second Section
:summary: This is the second section
:type: chapter

This is the content of the second section.`;

      const { metadata, content } = extractSmartMetadata(minimalDocumentHeader);
      
      // Should extract title from document header
      expect(metadata.title).toBe('Test Document');
      
      // Should not have document-level metadata since there's no other metadata
      expect(metadata.authors).toBeUndefined();
      // Note: version might be set from section attributes like :type: chapter
      expect(metadata.publicationDate).toBeUndefined();
      
      // Content should preserve the title line for 30040 events
      expect(content).toContain('= Test Document');
      expect(content).toContain('== First Section');
      expect(content).toContain('== Second Section');
    });

    it('should handle document with full header correctly', () => {
      const documentWithHeader = `= Test Document
John Doe <john@example.com>
1.0, 2024-01-15: Alexandria Test
:summary: This is a test document
:author: Jane Smith

== First Section
:author: Section Author
:description: This is the first section

This is the content.`;

      const { metadata, content } = extractSmartMetadata(documentWithHeader);
      
      // Should extract document-level metadata
      expect(metadata.title).toBe('Test Document');
      expect(metadata.authors).toEqual(['John Doe', 'Jane Smith']);
      expect(metadata.version).toBe('1.0');
      expect(metadata.publishedBy).toBe('Alexandria Test');
      expect(metadata.publicationDate).toBe('2024-01-15');
      expect(metadata.summary).toBe('This is a test document');
      
      // Content should be cleaned
      expect(content).not.toContain('= Test Document');
      expect(content).not.toContain('John Doe <john@example.com>');
      expect(content).not.toContain('1.0, 2024-01-15: Alexandria Test');
      expect(content).not.toContain(':summary: This is a test document');
      expect(content).not.toContain(':author: Jane Smith');
    });
  });
}); 