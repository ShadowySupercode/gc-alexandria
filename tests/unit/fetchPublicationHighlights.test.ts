import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { fetchHighlightsForPublication } from "../../src/lib/utils/fetch_publication_highlights.ts";

// Mock NDKEvent class
class MockNDKEvent {
  kind: number;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
  id: string;
  sig: string;

  constructor(event: {
    kind: number;
    pubkey: string;
    content: string;
    tags: string[][];
    created_at?: number;
    id?: string;
    sig?: string;
  }) {
    this.kind = event.kind;
    this.pubkey = event.pubkey;
    this.content = event.content;
    this.tags = event.tags;
    this.created_at = event.created_at || Date.now() / 1000;
    this.id = event.id || "mock-id";
    this.sig = event.sig || "mock-sig";
  }

  getMatchingTags(tagName: string): string[][] {
    return this.tags.filter((tag) => tag[0] === tagName);
  }

  tagValue(tagName: string): string | undefined {
    const tag = this.tags.find((tag) => tag[0] === tagName);
    return tag ? tag[1] : undefined;
  }
}

describe("fetchHighlightsForPublication", () => {
  let mockNDK: NDK;
  let publicationEvent: NDKEvent;
  let mockHighlights: MockNDKEvent[];

  beforeEach(() => {
    // Create the sample 30040 publication event from the user's example
    publicationEvent = new MockNDKEvent({
      kind: 30040,
      pubkey:
        "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1",
      content: "",
      tags: [
        ["d", "document-test"],
        ["title", "Document Test"],
        ["author", "unknown"],
        ["version", "1"],
        ["m", "application/json"],
        ["M", "meta-data/index/replaceable"],
        [
          "a",
          "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:first-level-heading",
        ],
        [
          "a",
          "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:another-first-level-heading",
        ],
        [
          "a",
          "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:a-third-first-level-heading",
        ],
        [
          "a",
          "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:asciimath-test-document",
        ],
        ["t", "a-tags"],
        ["t", "testfile"],
        ["t", "asciimath"],
        ["t", "latexmath"],
        ["image", "https://i.nostr.build/5kWwbDR04joIASVx.png"],
      ],
      created_at: 1744910311,
      id: "4585ed74a0be37655aa887340d239f0bbb9df5476165d912f098c55a71196fef",
      sig:
        "e6a832dcfc919c913acee62cb598211544bc8e03a3f61c016eb3bf6c8cb4fb333eff8fecc601517604c7a8029dfa73591f3218465071a532f4abfe8c0bf3662d",
    }) as unknown as NDKEvent;

    // Create mock highlight events for different sections
    mockHighlights = [
      new MockNDKEvent({
        kind: 9802,
        pubkey: "user-pubkey-1",
        content: "This is an interesting point",
        tags: [
          [
            "a",
            "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:first-level-heading",
          ],
          ["context", "surrounding text here"],
          [
            "p",
            "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1",
            "",
            "author",
          ],
        ],
        id: "highlight-1",
      }),
      new MockNDKEvent({
        kind: 9802,
        pubkey: "user-pubkey-2",
        content: "Another highlight on same section",
        tags: [
          [
            "a",
            "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:first-level-heading",
          ],
          ["context", "more surrounding text"],
          [
            "p",
            "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1",
            "",
            "author",
          ],
        ],
        id: "highlight-2",
      }),
      new MockNDKEvent({
        kind: 9802,
        pubkey: "user-pubkey-3",
        content: "Highlight on different section",
        tags: [
          [
            "a",
            "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:another-first-level-heading",
          ],
          ["context", "different section text"],
          [
            "p",
            "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1",
            "",
            "author",
          ],
        ],
        id: "highlight-3",
      }),
    ];

    // Mock NDK instance
    mockNDK = {
      fetchEvents: vi.fn(async (filter) => {
        // Return highlights that match the filter
        const aTagFilter = filter["#a"];
        if (aTagFilter) {
          return new Set(
            mockHighlights.filter((highlight) =>
              aTagFilter.includes(highlight.tagValue("a") || "")
            ),
          );
        }
        return new Set();
      }),
    } as unknown as NDK;
  });

  it("should extract section references from 30040 publication event", async () => {
    const result = await fetchHighlightsForPublication(
      publicationEvent,
      mockNDK,
    );

    // Should have results for the sections that have highlights
    expect(result.size).toBeGreaterThan(0);
    expect(
      result.has(
        "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:first-level-heading",
      ),
    ).toBe(true);
  });

  it("should fetch highlights for each section reference", async () => {
    const result = await fetchHighlightsForPublication(
      publicationEvent,
      mockNDK,
    );

    // First section should have 2 highlights
    const firstSectionHighlights = result.get(
      "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:first-level-heading",
    );
    expect(firstSectionHighlights?.length).toBe(2);

    // Second section should have 1 highlight
    const secondSectionHighlights = result.get(
      "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:another-first-level-heading",
    );
    expect(secondSectionHighlights?.length).toBe(1);
  });

  it("should group highlights by section address", async () => {
    const result = await fetchHighlightsForPublication(
      publicationEvent,
      mockNDK,
    );

    const firstSectionHighlights = result.get(
      "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:first-level-heading",
    );

    // Verify the highlights are correctly grouped
    expect(firstSectionHighlights?.[0].content).toBe(
      "This is an interesting point",
    );
    expect(firstSectionHighlights?.[1].content).toBe(
      "Another highlight on same section",
    );
  });

  it("should not include sections without highlights", async () => {
    const result = await fetchHighlightsForPublication(
      publicationEvent,
      mockNDK,
    );

    // Sections without highlights should not be in the result
    expect(
      result.has(
        "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:a-third-first-level-heading",
      ),
    ).toBe(false);
    expect(
      result.has(
        "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:asciimath-test-document",
      ),
    ).toBe(false);
  });

  it("should handle publication with no section references", async () => {
    const emptyPublication = new MockNDKEvent({
      kind: 30040,
      pubkey: "test-pubkey",
      content: "",
      tags: [
        ["d", "empty-doc"],
        ["title", "Empty Document"],
      ],
    }) as unknown as NDKEvent;

    const result = await fetchHighlightsForPublication(
      emptyPublication,
      mockNDK,
    );

    expect(result.size).toBe(0);
  });

  it("should only process 30041 kind references, ignoring other a-tags", async () => {
    const mixedPublication = new MockNDKEvent({
      kind: 30040,
      pubkey: "test-pubkey",
      content: "",
      tags: [
        ["d", "mixed-doc"],
        [
          "a",
          "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:first-level-heading",
        ],
        ["a", "30023:some-pubkey:blog-post"], // Different kind, should be ignored
        ["a", "1:some-pubkey"], // Different kind, should be ignored
      ],
    }) as unknown as NDKEvent;

    const result = await fetchHighlightsForPublication(
      mixedPublication,
      mockNDK,
    );

    // Should call fetchEvents with only the 30041 reference
    expect(mockNDK.fetchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        kinds: [9802],
        "#a": [
          "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:first-level-heading",
        ],
      }),
    );
  });

  it("should handle d-tags with colons correctly", async () => {
    const colonPublication = new MockNDKEvent({
      kind: 30040,
      pubkey: "test-pubkey",
      content: "",
      tags: [
        ["d", "colon-doc"],
        [
          "a",
          "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section:with:colons",
        ],
      ],
    }) as unknown as NDKEvent;

    const result = await fetchHighlightsForPublication(
      colonPublication,
      mockNDK,
    );

    // Should correctly parse the section address with colons
    expect(mockNDK.fetchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        "#a": [
          "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:section:with:colons",
        ],
      }),
    );
  });
});
