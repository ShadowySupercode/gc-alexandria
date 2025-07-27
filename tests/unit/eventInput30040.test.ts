import { describe, it, expect, vi, beforeEach } from "vitest";
import { build30040EventSet, validate30040EventSet } from "../../src/lib/utils/event_input_utils";
import { extractDocumentMetadata, parseAsciiDocWithMetadata } from "../../src/lib/utils/asciidoc_metadata";

// Mock NDK and other dependencies
vi.mock("@nostr-dev-kit/ndk", () => ({
  NDKEvent: vi.fn().mockImplementation((ndk, eventData) => ({
    ...eventData,
    id: "mock-event-id",
    sig: "mock-signature",
    kind: eventData.kind,
    content: eventData.content,
    tags: eventData.tags,
    pubkey: eventData.pubkey,
    created_at: eventData.created_at,
  })),
}));

vi.mock("../../src/lib/ndk", () => ({
  ndkInstance: {
    subscribe: vi.fn(),
  },
  getNdk: vi.fn(() => ({})),
}));

vi.mock("svelte/store", () => ({
  get: vi.fn(() => ({})),
}));

describe("EventInput 30040 Publishing", () => {
  const baseEvent = {
    pubkey: "test-pubkey",
    created_at: 1234567890,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Normal Structure with Preamble", () => {
    it("should build 30040 event set with preamble content", () => {
      const content = `= Test Document with Preamble
John Doe <john@example.com>
1.0, 2024-01-15, Alexandria Test
:summary: This is a test document with preamble
:keywords: test, preamble, asciidoc

This is the preamble content that should be included.

== First Section
:author: Section Author
:summary: This is the first section

This is the content of the first section.

== Second Section
:summary: This is the second section

This is the content of the second section.`;

      const tags: [string, string][] = [["type", "article"]];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      // Test index event
      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.content).toBe("");
      expect(indexEvent.tags).toContainEqual(["d", "test-document-with-preamble"]);
      expect(indexEvent.tags).toContainEqual(["title", "Test Document with Preamble"]);
      expect(indexEvent.tags).toContainEqual(["author", "John Doe"]);
      expect(indexEvent.tags).toContainEqual(["version", "1.0"]);
      expect(indexEvent.tags).toContainEqual(["summary", "This is a test document with preamble"]);
      expect(indexEvent.tags).toContainEqual(["t", "test"]);
      expect(indexEvent.tags).toContainEqual(["t", "preamble"]);
      expect(indexEvent.tags).toContainEqual(["t", "asciidoc"]);
      expect(indexEvent.tags).toContainEqual(["type", "article"]);

      // Test section events
      expect(sectionEvents).toHaveLength(2);

      // First section
      expect(sectionEvents[0].kind).toBe(30041);
      expect(sectionEvents[0].content).toBe("This is the content of the first section.");
      expect(sectionEvents[0].tags).toContainEqual(["d", "test-document-with-preamble-first-section"]);
      expect(sectionEvents[0].tags).toContainEqual(["title", "First Section"]);
      expect(sectionEvents[0].tags).toContainEqual(["author", "Section Author"]);
      expect(sectionEvents[0].tags).toContainEqual(["summary", "This is the first section"]);

      // Second section
      expect(sectionEvents[1].kind).toBe(30041);
      expect(sectionEvents[1].content).toBe("This is the content of the second section.");
      expect(sectionEvents[1].tags).toContainEqual(["d", "test-document-with-preamble-second-section"]);
      expect(sectionEvents[1].tags).toContainEqual(["title", "Second Section"]);
      expect(sectionEvents[1].tags).toContainEqual(["summary", "This is the second section"]);

      // Test a-tags in index event
      expect(indexEvent.tags).toContainEqual(["a", "30041:test-pubkey:test-document-with-preamble-first-section"]);
      expect(indexEvent.tags).toContainEqual(["a", "30041:test-pubkey:test-document-with-preamble-second-section"]);
    });
  });

  describe("Normal Structure without Preamble", () => {
    it("should build 30040 event set without preamble content", () => {
      const content = `= Test Document without Preamble
:summary: This is a test document without preamble
:keywords: test, no-preamble, asciidoc

== First Section
:author: Section Author
:summary: This is the first section

This is the content of the first section.

== Second Section
:summary: This is the second section

This is the content of the second section.`;

      const tags: [string, string][] = [["type", "article"]];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      // Test index event
      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.content).toBe("");
      expect(indexEvent.tags).toContainEqual(["d", "test-document-without-preamble"]);
      expect(indexEvent.tags).toContainEqual(["title", "Test Document without Preamble"]);
      expect(indexEvent.tags).toContainEqual(["summary", "This is a test document without preamble"]);

      // Test section events
      expect(sectionEvents).toHaveLength(2);

      // First section
      expect(sectionEvents[0].kind).toBe(30041);
      expect(sectionEvents[0].content).toBe("This is the content of the first section.");
      expect(sectionEvents[0].tags).toContainEqual(["d", "test-document-without-preamble-first-section"]);
      expect(sectionEvents[0].tags).toContainEqual(["title", "First Section"]);
      expect(sectionEvents[0].tags).toContainEqual(["author", "Section Author"]);
      expect(sectionEvents[0].tags).toContainEqual(["summary", "This is the first section"]);

      // Second section
      expect(sectionEvents[1].kind).toBe(30041);
      expect(sectionEvents[1].content).toBe("This is the content of the second section.");
      expect(sectionEvents[1].tags).toContainEqual(["d", "test-document-without-preamble-second-section"]);
      expect(sectionEvents[1].tags).toContainEqual(["title", "Second Section"]);
      expect(sectionEvents[1].tags).toContainEqual(["summary", "This is the second section"]);
    });
  });

  describe("Skeleton Structure with Preamble", () => {
    it("should build 30040 event set with skeleton structure and preamble", () => {
      const content = `= Skeleton Document with Preamble
:summary: This is a skeleton document with preamble
:keywords: skeleton, preamble, empty

This is the preamble content.

== Empty Section 1

== Empty Section 2

== Empty Section 3`;

      const tags: [string, string][] = [["type", "skeleton"]];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      // Test index event
      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.content).toBe("");
      expect(indexEvent.tags).toContainEqual(["d", "skeleton-document-with-preamble"]);
      expect(indexEvent.tags).toContainEqual(["title", "Skeleton Document with Preamble"]);
      expect(indexEvent.tags).toContainEqual(["summary", "This is a skeleton document with preamble"]);

      // Test section events
      expect(sectionEvents).toHaveLength(3);

      // All sections should have empty content
      sectionEvents.forEach((section, index) => {
        expect(section.kind).toBe(30041);
        expect(section.content).toBe("");
        expect(section.tags).toContainEqual(["d", `skeleton-document-with-preamble-empty-section-${index + 1}`]);
        expect(section.tags).toContainEqual(["title", `Empty Section ${index + 1}`]);
      });
    });
  });

  describe("Skeleton Structure without Preamble", () => {
    it("should build 30040 event set with skeleton structure without preamble", () => {
      const content = `= Skeleton Document without Preamble
:summary: This is a skeleton document without preamble
:keywords: skeleton, no-preamble, empty

== Empty Section 1

== Empty Section 2

== Empty Section 3`;

      const tags: [string, string][] = [["type", "skeleton"]];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      // Test index event
      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.content).toBe("");
      expect(indexEvent.tags).toContainEqual(["d", "skeleton-document-without-preamble"]);
      expect(indexEvent.tags).toContainEqual(["title", "Skeleton Document without Preamble"]);
      expect(indexEvent.tags).toContainEqual(["summary", "This is a skeleton document without preamble"]);

      // Test section events
      expect(sectionEvents).toHaveLength(3);

      // All sections should have empty content
      sectionEvents.forEach((section, index) => {
        expect(section.kind).toBe(30041);
        expect(section.content).toBe("");
        expect(section.tags).toContainEqual(["d", `skeleton-document-without-preamble-empty-section-${index + 1}`]);
        expect(section.tags).toContainEqual(["title", `Empty Section ${index + 1}`]);
      });
    });
  });

  describe("Index Card Format", () => {
    it("should build 30040 event set for index card format", () => {
      const content = `= Test Index Card
index card`;

      const tags: [string, string][] = [["type", "index-card"]];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      // Test index event
      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.content).toBe("");
      expect(indexEvent.tags).toContainEqual(["d", "test-index-card"]);
      expect(indexEvent.tags).toContainEqual(["title", "Test Index Card"]);
      expect(indexEvent.tags).toContainEqual(["type", "index-card"]);

      // Should have no section events for index card
      expect(sectionEvents).toHaveLength(0);
    });

    it("should build 30040 event set for index card with metadata", () => {
      const content = `= Test Index Card with Metadata
:summary: This is an index card with metadata
:keywords: index, card, metadata
index card`;

      const tags: [string, string][] = [["type", "index-card"]];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      // Test index event
      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.content).toBe("");
      expect(indexEvent.tags).toContainEqual(["d", "test-index-card-with-metadata"]);
      expect(indexEvent.tags).toContainEqual(["title", "Test Index Card with Metadata"]);
      expect(indexEvent.tags).toContainEqual(["summary", "This is an index card with metadata"]);
      expect(indexEvent.tags).toContainEqual(["t", "index"]);
      expect(indexEvent.tags).toContainEqual(["t", "card"]);
      expect(indexEvent.tags).toContainEqual(["t", "metadata"]);
      expect(indexEvent.tags).toContainEqual(["type", "index-card"]);

      // Should have no section events for index card
      expect(sectionEvents).toHaveLength(0);
    });
  });

  describe("Complex Metadata Structures", () => {
    it("should handle complex metadata with all attribute types", () => {
      const content = `= Complex Metadata Document
Jane Smith <jane@example.com>
2.0, 2024-02-20, Alexandria Complex
:summary: This is a complex document with all metadata types
:description: Alternative description field
:keywords: complex, metadata, all-types
:tags: additional, tags, here
:author: Override Author
:author: Third Author
:version: 3.0
:published_on: 2024-03-01
:published_by: Alexandria Complex
:type: book
:image: https://example.com/cover.jpg
:isbn: 978-0-123456-78-9
:source: https://github.com/alexandria/complex
:auto-update: yes

This is the preamble content.

== Section with Complex Metadata
:author: Section Author
:author: Section Co-Author
:summary: This section has complex metadata
:description: Alternative description for section
:keywords: section, complex, metadata
:tags: section, tags
:type: chapter
:image: https://example.com/section-image.jpg

This is the section content.`;

      const tags: [string, string][] = [["type", "complex"]];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      // Test index event metadata
      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.tags).toContainEqual(["d", "complex-metadata-document"]);
      expect(indexEvent.tags).toContainEqual(["title", "Complex Metadata Document"]);
      expect(indexEvent.tags).toContainEqual(["author", "Jane Smith"]); // Should use header line author
      expect(indexEvent.tags).toContainEqual(["author", "Override Author"]); // Additional author from attribute
      expect(indexEvent.tags).toContainEqual(["author", "Third Author"]); // Additional author from attribute
      expect(indexEvent.tags).toContainEqual(["version", "2.0"]); // Should use revision line version
      expect(indexEvent.tags).toContainEqual(["summary", "This is a complex document with all metadata types Alternative description field"]);
      expect(indexEvent.tags).toContainEqual(["published_on", "2024-03-01"]);
      expect(indexEvent.tags).toContainEqual(["published_by", "Alexandria Complex"]);
      expect(indexEvent.tags).toContainEqual(["type", "book"]);
      expect(indexEvent.tags).toContainEqual(["image", "https://example.com/cover.jpg"]);
      expect(indexEvent.tags).toContainEqual(["i", "978-0-123456-78-9"]);
      expect(indexEvent.tags).toContainEqual(["source", "https://github.com/alexandria/complex"]);
      expect(indexEvent.tags).toContainEqual(["auto-update", "yes"]);
      expect(indexEvent.tags).toContainEqual(["t", "complex"]);
      expect(indexEvent.tags).toContainEqual(["t", "metadata"]);
      expect(indexEvent.tags).toContainEqual(["t", "all-types"]);
      expect(indexEvent.tags).toContainEqual(["t", "additional"]);
      expect(indexEvent.tags).toContainEqual(["t", "tags"]);
      expect(indexEvent.tags).toContainEqual(["t", "here"]);

      // Test section metadata
      expect(sectionEvents).toHaveLength(1);
      expect(sectionEvents[0].kind).toBe(30041);
      expect(sectionEvents[0].content).toBe("This is the section content.");
      expect(sectionEvents[0].tags).toContainEqual(["d", "complex-metadata-document-section-with-complex-metadata"]);
      expect(sectionEvents[0].tags).toContainEqual(["title", "Section with Complex Metadata"]);
      expect(sectionEvents[0].tags).toContainEqual(["author", "Section Author"]);
      expect(sectionEvents[0].tags).toContainEqual(["author", "Section Co-Author"]);
      expect(sectionEvents[0].tags).toContainEqual(["summary", "This section has complex metadata Alternative description for section"]);
      expect(sectionEvents[0].tags).toContainEqual(["type", "chapter"]);
      expect(sectionEvents[0].tags).toContainEqual(["image", "https://example.com/section-image.jpg"]);
      expect(sectionEvents[0].tags).toContainEqual(["t", "section"]);
      expect(sectionEvents[0].tags).toContainEqual(["t", "complex"]);
      expect(sectionEvents[0].tags).toContainEqual(["t", "metadata"]);
      expect(sectionEvents[0].tags).toContainEqual(["t", "tags"]);
    });
  });

  describe("Validation Tests", () => {
    it("should validate normal structure correctly", () => {
      const content = `= Valid Document
:summary: This is a valid document

== Section 1

Content here.

== Section 2

More content.`;

      const validation = validate30040EventSet(content);
      expect(validation.valid).toBe(true);
    });

    it("should validate index card format correctly", () => {
      const content = `= Valid Index Card
index card`;

      const validation = validate30040EventSet(content);
      expect(validation.valid).toBe(true);
    });

    it("should validate skeleton structure correctly", () => {
      const content = `= Skeleton Document

== Empty Section 1

== Empty Section 2`;

      const validation = validate30040EventSet(content);
      expect(validation.valid).toBe(true);
    });

    it("should reject invalid structure", () => {
      const content = `This is not a valid AsciiDoc document.`;

      const validation = validate30040EventSet(content);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain("30040 events must have a document title");
    });
  });

  describe("Edge Cases", () => {
    it("should handle document with only title and no sections", () => {
      const content = `= Document with No Sections
:summary: This document has no sections

This is just preamble content.`;

      const tags: [string, string][] = [];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.tags).toContainEqual(["d", "document-with-no-sections"]);
      expect(indexEvent.tags).toContainEqual(["title", "Document with No Sections"]);
      expect(sectionEvents).toHaveLength(0);
    });

    it("should handle document with special characters in title", () => {
      const content = `= Document with Special Characters: Test & More!
:summary: This document has special characters in the title

== Section 1

Content here.`;

      const tags: [string, string][] = [];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.tags).toContainEqual(["d", "document-with-special-characters-test-more"]);
      expect(indexEvent.tags).toContainEqual(["title", "Document with Special Characters: Test & More!"]);
      expect(sectionEvents).toHaveLength(1);
    });

    it("should handle document with very long title", () => {
      const content = `= This is a very long document title that should be handled properly by the system and should not cause any issues with the d-tag generation or any other functionality
:summary: This document has a very long title

== Section 1

Content here.`;

      const tags: [string, string][] = [];

      const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);

      expect(indexEvent.kind).toBe(30040);
      expect(indexEvent.tags).toContainEqual(["title", "This is a very long document title that should be handled properly by the system and should not cause any issues with the d-tag generation or any other functionality"]);
      expect(sectionEvents).toHaveLength(1);
    });
  });
}); 