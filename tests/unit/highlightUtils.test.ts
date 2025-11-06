import { describe, it, expect } from "vitest";
import {
	groupHighlightsByAuthor,
	truncateHighlight,
	shortenNpub,
	getAuthorDisplayName,
	sortHighlightsByTime,
	getRelaysFromHighlight,
} from "../../src/lib/utils/highlightUtils";
import { mockHighlights, mockProfiles, getMockProfileByPubkey } from "../fixtures/highlights";
import type { NDKEvent } from "@nostr-dev-kit/ndk";

describe("highlightUtils", () => {
	describe("groupHighlightsByAuthor", () => {
		it("should group highlights by pubkey", () => {
			const grouped = groupHighlightsByAuthor(mockHighlights as unknown as NDKEvent[]);

			// Should have 4 unique authors (alice, bob, carol, unknown)
			expect(grouped.size).toBe(4);

			// Alice should have 3 highlights
			const aliceHighlights = grouped.get(mockProfiles[0].pubkey);
			expect(aliceHighlights?.length).toBe(3);

			// Bob should have 2 highlights
			const bobHighlights = grouped.get(mockProfiles[1].pubkey);
			expect(bobHighlights?.length).toBe(2);

			// Carol should have 1 highlight
			const carolHighlights = grouped.get(mockProfiles[2].pubkey);
			expect(carolHighlights?.length).toBe(1);

			// Unknown user should have 1 highlight
			const unknownHighlights = grouped.get(mockProfiles[3].pubkey);
			expect(unknownHighlights?.length).toBe(1);
		});

		it("should handle empty highlights array", () => {
			const grouped = groupHighlightsByAuthor([]);
			expect(grouped.size).toBe(0);
		});

		it("should handle single highlight", () => {
			const singleHighlight = [mockHighlights[0]];
			const grouped = groupHighlightsByAuthor(singleHighlight as unknown as NDKEvent[]);
			expect(grouped.size).toBe(1);
		});
	});

	describe("truncateHighlight", () => {
		it("should not truncate text shorter than max length", () => {
			const short = "Short text";
			expect(truncateHighlight(short, 50)).toBe("Short text");
		});

		it("should truncate at word boundary", () => {
			const long = "This is a very long text that should be truncated at a word boundary";
			const result = truncateHighlight(long, 50);

			expect(result.length).toBeLessThanOrEqual(53); // 50 + "..."
			expect(result.endsWith("...")).toBe(true);
			expect(result).not.toContain("boun..."); // Should not break mid-word
		});

		it("should use default max length of 50", () => {
			const long = "This is a very long text that should be truncated at a word boundary to test the default max length parameter";
			const result = truncateHighlight(long);

			expect(result.length).toBeLessThanOrEqual(53); // 50 + "..."
			expect(result.endsWith("...")).toBe(true);
		});

		it("should handle text with no spaces within max length", () => {
			const noSpaces = "x".repeat(100);
			const result = truncateHighlight(noSpaces, 50);

			expect(result.length).toBe(53); // 50 + "..."
			expect(result.endsWith("...")).toBe(true);
		});

		it("should handle empty string", () => {
			expect(truncateHighlight("")).toBe("");
		});

		it("should handle exact max length", () => {
			const exact = "x".repeat(50);
			expect(truncateHighlight(exact, 50)).toBe(exact);
		});
	});

	describe("shortenNpub", () => {
		it("should create shortened npub with default length", () => {
			const pubkey = mockProfiles[0].pubkey;
			const shortened = shortenNpub(pubkey);

			expect(shortened).toContain("npub1");
			expect(shortened).toContain("...");
			expect(shortened.length).toBeLessThan(70); // Full npub is longer
		});

		it("should create shortened npub with custom length", () => {
			const pubkey = mockProfiles[0].pubkey;
			const shortened = shortenNpub(pubkey, 12);

			expect(shortened).toContain("npub1");
			expect(shortened).toContain("...");
		});

		it("should handle different pubkeys", () => {
			const npub1 = shortenNpub(mockProfiles[0].pubkey);
			const npub2 = shortenNpub(mockProfiles[1].pubkey);

			expect(npub1).not.toBe(npub2);
		});
	});

	describe("getAuthorDisplayName", () => {
		it("should prefer displayName over name", () => {
			const profile = getMockProfileByPubkey(mockProfiles[0].pubkey);
			const name = getAuthorDisplayName(profile, mockProfiles[0].pubkey);

			expect(name).toBe("Alice Johnson"); // displayName
		});

		it("should use name if displayName is not available", () => {
			const profile = { name: "test_user" };
			const name = getAuthorDisplayName(profile, mockProfiles[0].pubkey);

			expect(name).toBe("test_user");
		});

		it("should use display_name (snake_case) if available", () => {
			const profile = { display_name: "Display Name" };
			const name = getAuthorDisplayName(profile, mockProfiles[0].pubkey);

			expect(name).toBe("Display Name");
		});

		it("should fall back to shortened npub if no profile", () => {
			const name = getAuthorDisplayName(null, mockProfiles[0].pubkey);

			expect(name).toContain("npub1");
			expect(name).toContain("...");
		});

		it("should fall back to shortened npub if profile has no name fields", () => {
			const emptyProfile = {};
			const name = getAuthorDisplayName(emptyProfile, mockProfiles[0].pubkey);

			expect(name).toContain("npub1");
			expect(name).toContain("...");
		});
	});

	describe("sortHighlightsByTime", () => {
		it("should sort highlights by created_at (newest first)", () => {
			const highlights = [
				mockHighlights[0], // created_at: 1704067200
				mockHighlights[2], // created_at: 1704067400
				mockHighlights[1], // created_at: 1704067300
			];

			const sorted = sortHighlightsByTime(highlights as unknown as NDKEvent[]);

			expect(sorted[0].created_at).toBe(1704067400); // Newest
			expect(sorted[1].created_at).toBe(1704067300);
			expect(sorted[2].created_at).toBe(1704067200); // Oldest
		});

		it("should handle highlights with missing created_at", () => {
			const highlights = [
				{ ...mockHighlights[0], created_at: undefined },
				mockHighlights[1],
			];

			const sorted = sortHighlightsByTime(highlights as unknown as NDKEvent[]);

			expect(sorted.length).toBe(2);
			// Should not throw error
		});

		it("should not mutate original array", () => {
			const original = [mockHighlights[0], mockHighlights[1]];
			const originalOrder = [...original];

			sortHighlightsByTime(original as unknown as NDKEvent[]);

			expect(original).toEqual(originalOrder);
		});
	});

	describe("getRelaysFromHighlight", () => {
		it("should extract relay URLs from event tags", () => {
			const mockEvent = {
				tags: [
					["a", "30041:pubkey:id", "wss://relay1.com"],
					["e", "event-id", "wss://relay2.com"],
					["p", "pubkey", "wss://relay3.com", "author"],
				],
				relay: null,
			} as unknown as NDKEvent;

			const relays = getRelaysFromHighlight(mockEvent);

			expect(relays).toContain("wss://relay1.com");
			expect(relays).toContain("wss://relay2.com");
			expect(relays).toContain("wss://relay3.com");
			expect(relays.length).toBe(3);
		});

		it("should include relay from event.relay if available", () => {
			const mockEvent = {
				tags: [["a", "30041:pubkey:id", "wss://relay1.com"]],
				relay: { url: "wss://event-relay.com" },
			} as unknown as NDKEvent;

			const relays = getRelaysFromHighlight(mockEvent);

			expect(relays).toContain("wss://relay1.com");
			expect(relays).toContain("wss://event-relay.com");
		});

		it("should deduplicate relay URLs", () => {
			const mockEvent = {
				tags: [
					["a", "30041:pubkey:id", "wss://relay.com"],
					["e", "event-id", "wss://relay.com"],
					["p", "pubkey", "wss://relay.com"],
				],
				relay: { url: "wss://relay.com" },
			} as unknown as NDKEvent;

			const relays = getRelaysFromHighlight(mockEvent);

			expect(relays.length).toBe(1);
			expect(relays[0]).toBe("wss://relay.com");
		});

		it("should handle tags without relay hints", () => {
			const mockEvent = {
				tags: [
					["a", "30041:pubkey:id"], // No relay hint
					["content", "some content"],
				],
				relay: null,
			} as unknown as NDKEvent;

			const relays = getRelaysFromHighlight(mockEvent);

			expect(relays.length).toBe(0);
		});
	});
});
