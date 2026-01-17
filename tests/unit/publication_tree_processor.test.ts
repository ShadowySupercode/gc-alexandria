/**
 * TDD Tests for NKBIP-01 Publication Tree Processor
 *
 * Tests the iterative parsing function at different hierarchy levels
 * using deep_hierarchy_test.adoc to verify NKBIP-01 compliance.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import {
  getSupportedParseLevels,
  parseAsciiDocWithTree,
  validateParseLevel,
} from "../../src/lib/utils/asciidoc_publication_parser.js";

// Mock NDK for testing
const mockNDK = {
  activeUser: {
    pubkey: "test-pubkey-12345",
  },
} as any;

// Read the test document
const testDocumentPath = "./test_data/AsciidocFiles/deep_hierarchy_test.adoc";
let testContent: string;

try {
  testContent = readFileSync(testDocumentPath, "utf-8");
} catch (error) {
  console.error("Failed to read test document:", error);
  testContent = `= Deep Hierarchical Document Test
:tags: testing, hierarchy, structure
:author: Test Author
:type: technical

This document tests all 6 levels of AsciiDoc hierarchy to validate our parse level system.

== Level 2: Main Sections
:tags: level2, main

This is a level 2 section that should appear in all parse levels.

=== Level 3: Subsections  
:tags: level3, subsection

This is a level 3 section that should appear in parse levels 3-6.

==== Level 4: Sub-subsections
:tags: level4, detailed

This is a level 4 section that should appear in parse levels 4-6.

===== Level 5: Deep Subsections
:tags: level5, deep

This is a level 5 section that should only appear in parse levels 5-6.

====== Level 6: Deepest Level
:tags: level6, deepest

This is a level 6 section that should only appear in parse level 6.

Content at the deepest level of our hierarchy.

== Level 2: Second Main Section
:tags: level2, main, second

A second main section to ensure we have balanced content at the top level.`;
}

describe("NKBIP-01 Publication Tree Processor", () => {
  it("should validate parse levels correctly", () => {
    // Test valid parse levels
    expect(validateParseLevel(2)).toBe(true);
    expect(validateParseLevel(3)).toBe(true);
    expect(validateParseLevel(5)).toBe(true);

    // Test invalid parse levels
    expect(validateParseLevel(1)).toBe(false);
    expect(validateParseLevel(6)).toBe(false);
    expect(validateParseLevel(7)).toBe(false);
    expect(validateParseLevel(2.5)).toBe(false);
    expect(validateParseLevel(-1)).toBe(false);

    // Test supported levels array
    const supportedLevels = getSupportedParseLevels();
    expect(supportedLevels).toEqual([2, 3, 4, 5]);
  });

  it("should parse Level 2 with NKBIP-01 minimal structure", async () => {
    const result = await parseAsciiDocWithTree(testContent, mockNDK, 2);

    // Should be detected as article (has title and sections)
    expect(result.metadata.contentType).toBe("article");
    expect(result.metadata.parseLevel).toBe(2);
    expect(result.metadata.title).toBe("Deep Hierarchical Document Test");

    // Should have 1 index event (30040) + 2 content events (30041) for level 2 sections
    expect(result.indexEvent).toBeDefined();
    expect(result.indexEvent?.kind).toBe(30040);
    expect(result.contentEvents.length).toBe(2);

    // All content events should be kind 30041
    result.contentEvents.forEach((event) => {
      expect(event.kind).toBe(30041);
    });

    // Check titles of level 2 sections
    const contentTitles = result.contentEvents.map((e) =>
      e.tags.find((t: string[]) => t[0] === "title")?.[1]
    );
    expect(contentTitles).toContain("Level 2: Main Sections");
    expect(contentTitles).toContain("Level 2: Second Main Section");

    // Content should include all nested subsections as AsciiDoc
    const firstSectionContent = result.contentEvents[0].content;
    expect(firstSectionContent).toBeDefined();
    // Should contain level 3, 4, 5 content as nested AsciiDoc markup
    expect(firstSectionContent.includes("=== Level 3: Subsections")).toBe(true);
    expect(firstSectionContent.includes("==== Level 4: Sub-subsections")).toBe(
      true,
    );
    expect(firstSectionContent.includes("===== Level 5: Deep Subsections"))
      .toBe(true);
  });

  it("should parse Level 3 with NKBIP-01 intermediate structure", async () => {
    const result = await parseAsciiDocWithTree(testContent, mockNDK, 3);

    expect(result.metadata.contentType).toBe("article");
    expect(result.metadata.parseLevel).toBe(3);

    // Should have hierarchical structure
    expect(result.indexEvent).toBeDefined();
    expect(result.indexEvent?.kind).toBe(30040);

    // Should have mix of 30040 (for level 2 sections with children) and 30041 (for content)
    const kinds = result.contentEvents.map((e) => e.kind);
    expect(kinds).toContain(30040); // Level 2 sections with children
    expect(kinds).toContain(30041); // Level 3 content sections

    // Level 2 sections with children should be 30040 index events
    const level2WithChildrenEvents = result.contentEvents.filter((e) =>
      e.kind === 30040 &&
      e.tags.find((t: string[]) => t[0] === "title")?.[1]?.includes("Level 2:")
    );
    expect(level2WithChildrenEvents.length).toBe(2); // Both level 2 sections have children

    // Should have 30041 events for level 3 content
    const level3ContentEvents = result.contentEvents.filter((e) =>
      e.kind === 30041 &&
      e.tags.find((t: string[]) => t[0] === "title")?.[1]?.includes("Level 3:")
    );
    expect(level3ContentEvents.length).toBeGreaterThan(0);
  });

  it("should parse Level 4 with NKBIP-01 detailed structure", async () => {
    const result = await parseAsciiDocWithTree(testContent, mockNDK, 4);

    expect(result.metadata.contentType).toBe("article");
    expect(result.metadata.parseLevel).toBe(4);

    // Should have hierarchical structure with mix of 30040 and 30041 events
    expect(result.indexEvent).toBeDefined();
    expect(result.indexEvent?.kind).toBe(30040);

    const kinds = result.contentEvents.map((e) => e.kind);
    expect(kinds).toContain(30040); // Level 2 sections with children
    expect(kinds).toContain(30041); // Content sections

    // Check that we have level 4 content sections
    const contentTitles = result.contentEvents.map((e) =>
      e.tags.find((t: string[]) => t[0] === "title")?.[1]
    );
    expect(contentTitles).toContain("Level 4: Sub-subsections");
  });

  it("should parse Level 5 with NKBIP-01 maximum depth", async () => {
    const result = await parseAsciiDocWithTree(testContent, mockNDK, 5);

    expect(result.metadata.contentType).toBe("article");
    expect(result.metadata.parseLevel).toBe(5);

    // Should have hierarchical structure
    expect(result.indexEvent).toBeDefined();
    expect(result.indexEvent?.kind).toBe(30040);

    // Should include level 5 sections as content events
    const contentTitles = result.contentEvents.map((e) =>
      e.tags.find((t: string[]) => t[0] === "title")?.[1]
    );
    expect(contentTitles).toContain("Level 5: Deep Subsections");
  });

  it("should validate event structure correctly", async () => {
    const result = await parseAsciiDocWithTree(testContent, mockNDK, 3);

    // Test index event structure
    expect(result.indexEvent).toBeDefined();
    expect(result.indexEvent?.kind).toBe(30040);
    expect(result.indexEvent?.tags).toBeDefined();

    // Check required tags
    const indexTags = result.indexEvent!.tags;
    const dTag = indexTags.find((t: string[]) => t[0] === "d");
    const titleTag = indexTags.find((t: string[]) => t[0] === "title");

    expect(dTag).toBeDefined();
    expect(titleTag).toBeDefined();
    expect(titleTag![1]).toBe("Deep Hierarchical Document Test");

    // Test content events structure - mix of 30040 and 30041
    result.contentEvents.forEach((event) => {
      expect([30040, 30041]).toContain(event.kind);
      expect(event.tags).toBeDefined();
      expect(event.content).toBeDefined();

      const eventTitleTag = event.tags.find((t: string[]) => t[0] === "title");
      expect(eventTitleTag).toBeDefined();
    });
  });

  it("should preserve content as AsciiDoc", async () => {
    const result = await parseAsciiDocWithTree(testContent, mockNDK, 2);

    // Content should be preserved as original AsciiDoc, not converted to HTML
    const firstEvent = result.contentEvents[0];
    expect(firstEvent.content).toBeDefined();

    // Should contain AsciiDoc markup, not HTML
    expect(firstEvent.content.includes("<")).toBe(false);
    expect(firstEvent.content.includes("===")).toBe(true);
  });

  it("should handle attributes correctly", async () => {
    const result = await parseAsciiDocWithTree(testContent, mockNDK, 2);

    // Document-level attributes should be in index event
    expect(result.indexEvent).toBeDefined();
    const indexTags = result.indexEvent!.tags;

    // Check for document attributes
    const authorTag = indexTags.find((t: string[]) => t[0] === "author");
    const typeTag = indexTags.find((t: string[]) => t[0] === "type");
    const tagsTag = indexTags.find((t: string[]) => t[0] === "t");

    expect(authorTag?.[1]).toBe("Test Author");
    expect(typeTag?.[1]).toBe("technical");
    expect(tagsTag).toBeDefined(); // Should have at least one t-tag
  });

  it("should handle scattered notes mode", async () => {
    // Test with content that has no document title (scattered notes)
    const scatteredContent = `== First Note
:tags: note1

Content of first note.

== Second Note  
:tags: note2

Content of second note.`;

    const result = await parseAsciiDocWithTree(scatteredContent, mockNDK, 2);

    expect(result.metadata.contentType).toBe("scattered-notes");
    expect(result.indexEvent).toBeNull(); // No index event for scattered notes
    expect(result.contentEvents.length).toBe(2);

    // All events should be 30041 content events
    result.contentEvents.forEach((event) => {
      expect(event.kind).toBe(30041);
    });
  });

  it("should integrate with PublicationTree structure", async () => {
    const result = await parseAsciiDocWithTree(testContent, mockNDK, 2);

    // Should have a PublicationTree instance
    expect(result.tree).toBeDefined();

    // Tree should have methods for event management
    expect(typeof result.tree.addEvent).toBe("function");

    // Event structure should be populated
    expect(result.metadata.eventStructure).toBeDefined();
    expect(Array.isArray(result.metadata.eventStructure)).toBe(true);
  });
});
