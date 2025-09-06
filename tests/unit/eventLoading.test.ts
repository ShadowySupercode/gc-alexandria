/**
 * Unit tests for event loading and previewing functionality
 * Tests the loadEvent function and EventPreview component behavior
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadEvent } from "$lib/components/event_input/eventServices";
import type { NDKEvent } from "$lib/utils/nostrUtils";
import type { TagData } from "$lib/components/event_input/types";

// Mock NDK
const mockNDK = {
  pool: {
    relays: new Map([
      ["wss://relay1.com", { url: "wss://relay1.com" }],
      ["wss://relay2.com", { url: "wss://relay2.com" }]
    ])
  }
};

// Mock fetchEventWithFallback
vi.mock("$lib/utils/nostrUtils", () => ({
  fetchEventWithFallback: vi.fn(),
  prefixNostrAddresses: vi.fn((content) => content)
}));

// Mock stores
vi.mock("$lib/stores/userStore", () => ({
  userStore: {
    subscribe: vi.fn((callback) => {
      callback({ pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18" });
      return () => {};
    })
  }
}));

// Mock relay stores
vi.mock("$lib/ndk", () => ({
  activeInboxRelays: {
    subscribe: vi.fn((callback) => {
      callback(["wss://relay1.com"]);
      return () => {};
    })
  },
  activeOutboxRelays: {
    subscribe: vi.fn((callback) => {
      callback(["wss://relay2.com"]);
      return () => {};
    })
  }
}));

describe("Event Loading and Previewing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Profile Event (Kind 0) Loading", () => {
    it("should correctly load profile event with content and tags", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Mock the profile event
      const profileEvent: NDKEvent = {
        id: "3954174443415e229d9c5e1cb399c882f4dc44c00ed5c06859a736b597bb5544",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 0,
        content: '{"name":"Testerin2","about":"From @Silberengel","website":"https://next-alexandria.gitcitadel.eu/","display_name":"Testerin2","nip05":"testerin2@sovbit.host","banner":"","picture":"https://image.nostr.build/17c053bdf6e9f007172eaa182b8bc6c85cc07edb193785ea97ba7a5bff501285.jpg","lud16":"silberengel@minibits.cash"}',
        tags: [
          ["nip05", "testerin2@sovbit.host"],
          ["lud16", "gitcitadel@getalby.com"],
          ["website", "https://geyser.fund/project/gitcitadel"],
          ["website", "https://gitcitadel.com"]
        ],
        sig: "32307fd2664e1798f73664dbf25d3ad4d2e1e962db8da7feafa4979e7a341372476ad63f7b0ea82a5fbd3e889a916a0b7bf1816858c073ee3f282410d38d4691"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(profileEvent);

      const result = await loadEvent(mockNDK, "3954174443415e229d9c5e1cb399c882f4dc44c00ed5c06859a736b597bb5544");

      expect(result).not.toBeNull();
      expect(result!.eventData.kind).toBe(0);
      expect(result!.eventData.content).toBe(profileEvent.content);

      // Check that content entries appear first in tags
      const tags = result!.tags;
      expect(tags.length).toBeGreaterThan(0);

      // Find content-derived tags (should appear first)
      const nameTag = tags.find(tag => tag.key === "name");
      const websiteTag = tags.find(tag => tag.key === "website" && tag.values[0] === "https://next-alexandria.gitcitadel.eu/");
      const lud16Tag = tags.find(tag => tag.key === "lud16" && tag.values[0] === "silberengel@minibits.cash");

      expect(nameTag).toBeDefined();
      expect(nameTag!.values[0]).toBe("Testerin2");
      expect(websiteTag).toBeDefined();
      expect(lud16Tag).toBeDefined();

      // Check that original tags are also present
      const originalWebsiteTag = tags.find(tag => tag.key === "website" && tag.values[0] === "https://geyser.fund/project/gitcitadel");
      const originalLud16Tag = tags.find(tag => tag.key === "lud16" && tag.values[0] === "gitcitadel@getalby.com");

      expect(originalWebsiteTag).toBeDefined();
      expect(originalLud16Tag).toBeDefined();

      // Verify content entries appear before original tags
      const contentWebsiteIndex = tags.findIndex(tag => tag.key === "website" && tag.values[0] === "https://next-alexandria.gitcitadel.eu/");
      const originalWebsiteIndex = tags.findIndex(tag => tag.key === "website" && tag.values[0] === "https://geyser.fund/project/gitcitadel");
      
      expect(contentWebsiteIndex).toBeLessThan(originalWebsiteIndex);
    });

    it("should preserve content exactly as-is for loaded profile events", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      const originalContent = '{"name":"Testerin2","about":"From @Silberengel","website":"https://next-alexandria.gitcitadel.eu/","display_name":"Testerin2","nip05":"testerin2@sovbit.host","banner":"","picture":"https://image.nostr.build/17c053bdf6e9f007172eaa182b8bc6c85cc07edb193785ea97ba7a5bff501285.jpg","lud16":"silberengel@minibits.cash"}';
      
      const profileEvent: NDKEvent = {
        id: "3954174443415e229d9c5e1cb399c882f4dc44c00ed5c06859a736b597bb5544",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 0,
        content: originalContent,
        tags: [
          ["nip05", "testerin2@sovbit.host"],
          ["lud16", "gitcitadel@getalby.com"]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(profileEvent);

      const result = await loadEvent(mockNDK, "3954174443415e229d9c5e1cb399c882f4dc44c00ed5c06859a736b597bb5544");

      expect(result).not.toBeNull();
      expect(result!.eventData.content).toBe(originalContent);
    });
  });

  describe("Publication Event (Kind 30040) Loading", () => {
    it("should correctly load publication event with multi-value tags", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      const publicationEvent: NDKEvent = {
        id: "d985ecdfe8ae096e1fb9479c25999a7d9768ba8b68c376938e514eeef7b4769e",
        pubkey: "846ebf79a0a8813274ec9727490621ad423f16a3e474d7fd66e6a98bfe4e39a4",
        created_at: 1750519597,
        kind: 30040,
        content: "",
        tags: [
          ["d", "relay-test-thecitadel-by-unknown-v-1"],
          ["title", "Relay Test: TheCitadel"],
          ["author", "unknown"],
          ["version", "1"],
          ["m", "application/json"],
          ["M", "meta-data/index/replaceable"],
          ["a", "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:relay-test-thecitadel-purpose-1-by-unknown-v-1", "wss://thecitadel.nostr1.com", "84ad65f7a321404f55d97c2208dd3686c41724e6c347d3ee53cfe16f67cdfb7c"],
          ["a", "30040:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:document-test-by-unknown-v-1", "wss://thecitadel.nostr1.com", "71bedfb6b66888a0cadd53a26422744da942a95af4377928063f7e7b62416373"],
          ["image", "https://plsn.com/site/wp-content/uploads/fig-2.-1920px-SMPTE_Color_Bars_16x9.png"],
          ["t", "testfile"]
        ],
        sig: "69f7ddb2f7662a21888d6517a662585d4c0f34cff405f104fcb11ff9c9104357ddc65b94eb728b7687296f19de00a62646e53e6c5fd2971a75e1b9c40ed167d3"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(publicationEvent);

      const result = await loadEvent(mockNDK, "d985ecdfe8ae096e1fb9479c25999a7d9768ba8b68c376938e514eeef7b4769e");

      expect(result).not.toBeNull();
      expect(result!.eventData.kind).toBe(30040);
      expect(result!.eventData.content).toBe("");

      const tags = result!.tags;
      
      // Check that multi-value tags are preserved correctly
      const aTags = tags.filter(tag => tag.key === "a");
      expect(aTags).toHaveLength(2);
      
      // First a tag should have 3 values
      const firstATag = aTags.find(tag => tag.values[0] === "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:relay-test-thecitadel-purpose-1-by-unknown-v-1");
      expect(firstATag).toBeDefined();
      expect(firstATag!.values).toHaveLength(3);
      expect(firstATag!.values[0]).toBe("30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:relay-test-thecitadel-purpose-1-by-unknown-v-1");
      expect(firstATag!.values[1]).toBe("wss://thecitadel.nostr1.com");
      expect(firstATag!.values[2]).toBe("84ad65f7a321404f55d97c2208dd3686c41724e6c347d3ee53cfe16f67cdfb7c");

      // Second a tag should have 3 values
      const secondATag = aTags.find(tag => tag.values[0] === "30040:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:document-test-by-unknown-v-1");
      expect(secondATag).toBeDefined();
      expect(secondATag!.values).toHaveLength(3);

      // Check single-value tags
      const dTag = tags.find(tag => tag.key === "d");
      expect(dTag).toBeDefined();
      expect(dTag!.values[0]).toBe("relay-test-thecitadel-by-unknown-v-1");
    });
  });

  describe("Note Event (Kind 1) Loading", () => {
    it("should correctly load note event with multiple e and p tags", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      const noteEvent: NDKEvent = {
        id: "acdf3deb33049438f529b511776ad12a83fe692fb26c8e8cff739ac6a9bb5533",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1756056536,
        kind: 1,
        content: "#gallery",
        tags: [
          ["t", "gallery"],
          ["e", "c5bfb5eb9b341e1866800621769e79e0a34551eb3661ec86c43583e4f58b33f0", "wss://nostr.land", "root", "dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319"],
          ["e", "be95084fa0db37521daed74f82c74d8899ee1065d73662ba68a1ed32fc547fa7", "wss://nostr.mom/", "reply", "dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319"],
          ["p", "baeb862f3318390ec5af5c9db64ae5ddb2efc1a97db54c6550656bfa2dcc054b"],
          ["p", "a37183789c37348853b6ae7e4fb8c241b98313406ee225fd3bff1c91fa6ae16e"],
          ["p", "dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319"]
        ],
        sig: "45792f522b1a138d6467c8d2afb27946eb0478c4e2ef70ac53a373fc3b77eefeff9b8f9fde68e5e05836d7729ffef233594aeebc10fc1b6b9589dba32088f5cd"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(noteEvent);

      const result = await loadEvent(mockNDK, "acdf3deb33049438f529b511776ad12a83fe692fb26c8e8cff739ac6a9bb5533");

      expect(result).not.toBeNull();
      expect(result!.eventData.kind).toBe(1);
      expect(result!.eventData.content).toBe("#gallery");

      const tags = result!.tags;
      
      // Check multiple e tags with multiple values
      const eTags = tags.filter(tag => tag.key === "e");
      expect(eTags).toHaveLength(2);
      
      // First e tag should have 4 values
      const firstETag = eTags.find(tag => tag.values[0] === "c5bfb5eb9b341e1866800621769e79e0a34551eb3661ec86c43583e4f58b33f0");
      expect(firstETag).toBeDefined();
      expect(firstETag!.values).toHaveLength(4);
      expect(firstETag!.values[0]).toBe("c5bfb5eb9b341e1866800621769e79e0a34551eb3661ec86c43583e4f58b33f0");
      expect(firstETag!.values[1]).toBe("wss://nostr.land");
      expect(firstETag!.values[2]).toBe("root");
      expect(firstETag!.values[3]).toBe("dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319");

      // Check multiple p tags with single values
      const pTags = tags.filter(tag => tag.key === "p");
      expect(pTags).toHaveLength(3);
      
      // Each p tag should have exactly 1 value
      pTags.forEach(pTag => {
        expect(pTag.values).toHaveLength(1);
        expect(pTag.values[0]).toMatch(/^[a-f0-9]{64}$/); // Should be 64-char hex string
      });

      // Check t tag
      const tTag = tags.find(tag => tag.key === "t");
      expect(tTag).toBeDefined();
      expect(tTag!.values[0]).toBe("gallery");
    });
  });

  describe("Public Message Event (Kind 24) Loading", () => {
    it("should correctly load public message event with p tags containing empty values", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      const publicMessageEvent: NDKEvent = {
        id: "fb33f8a7b3632e1ca10c2dd51b4786690d5a8212bcb5a3cbdad7ab2b7a0f5ed9",
        pubkey: "dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319",
        created_at: 1756144261,
        kind: 24,
        content: "It's a public message. You can also see it in the new Amethyst replies.",
        tags: [
          ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""],
          ["p", "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9", "", ""],
          ["p", "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18", "", ""],
          ["q", "cebd54c9cb441661cbb5b9d0ec0d87acf4f411c8d2942be763ac90133379297d", "ws://localhost:4869", ""],
          ["expiration", "1758563461", "", ""]
        ],
        sig: "8017a1e43bbb802ba5fd355cb37b5b19db1b2259583ee9b533f2b8e4040062af15b5699e0eeceba24d7333f9f9462b9231e47d445840e303197cd2535279ba6f"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(publicMessageEvent);

      const result = await loadEvent(mockNDK, "fb33f8a7b3632e1ca10c2dd51b4786690d5a8212bcb5a3cbdad7ab2b7a0f5ed9");

      expect(result).not.toBeNull();
      expect(result!.eventData.kind).toBe(24);
      expect(result!.eventData.content).toBe("It's a public message. You can also see it in the new Amethyst replies.");

      const tags = result!.tags;
      
      // Check multiple p tags with empty values
      const pTags = tags.filter(tag => tag.key === "p");
      expect(pTags).toHaveLength(3);
      
      // Each p tag should have 3 values (including empty strings)
      pTags.forEach(pTag => {
        expect(pTag.values).toHaveLength(3);
        expect(pTag.values[0]).toMatch(/^[a-f0-9]{64}$/); // First value should be 64-char hex string
        expect(pTag.values[1]).toBe(""); // Second value should be empty
        expect(pTag.values[2]).toBe(""); // Third value should be empty
      });

      // Verify specific p tag values
      const pTag1 = pTags.find(tag => tag.values[0] === "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2");
      const pTag2 = pTags.find(tag => tag.values[0] === "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9");
      const pTag3 = pTags.find(tag => tag.values[0] === "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18");
      
      expect(pTag1).toBeDefined();
      expect(pTag2).toBeDefined();
      expect(pTag3).toBeDefined();

      // Check q tag with multiple values
      const qTag = tags.find(tag => tag.key === "q");
      expect(qTag).toBeDefined();
      expect(qTag!.values).toHaveLength(3);
      expect(qTag!.values[0]).toBe("cebd54c9cb441661cbb5b9d0ec0d87acf4f411c8d2942be763ac90133379297d");
      expect(qTag!.values[1]).toBe("ws://localhost:4869");
      expect(qTag!.values[2]).toBe("");

      // Check expiration tag
      const expirationTag = tags.find(tag => tag.key === "expiration");
      expect(expirationTag).toBeDefined();
      expect(expirationTag!.values).toHaveLength(3);
      expect(expirationTag!.values[0]).toBe("1758563461");
      expect(expirationTag!.values[1]).toBe("");
      expect(expirationTag!.values[2]).toBe("");
    });
  });

  describe("Edge Cases and Real-World Scenarios", () => {
    it("should handle profile content with multiple values for same field (only first should be in content)", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Profile event where content has multiple values for same field (shouldn't happen but could)
      const profileEventWithMultipleContent: NDKEvent = {
        id: "test-multiple-content",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 0,
        content: '{"name":"Testerin2","website":"https://first-website.com","website":"https://second-website.com","website":"https://third-website.com","nip05":"first@example.com","nip05":"second@example.com","nip05":"third@example.com"}',
        tags: [
          ["nip05", "tag-nip05@example.com"],
          ["website", "https://tag-website.com"]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(profileEventWithMultipleContent);

      const result = await loadEvent(mockNDK, "test-multiple-content");

      expect(result).not.toBeNull();
      expect(result!.eventData.kind).toBe(0);
      
      // Content should be preserved exactly as-is (even if malformed)
      expect(result!.eventData.content).toBe('{"name":"Testerin2","website":"https://first-website.com","website":"https://second-website.com","website":"https://third-website.com","nip05":"first@example.com","nip05":"second@example.com","nip05":"third@example.com"}');

      const tags = result!.tags;
      
      // Now we extract ALL values from malformed JSON content, not just the last one
      // This ensures clients using only tags get complete information from content
      const websiteTags = tags.filter(tag => tag.key === "website");
      expect(websiteTags.length).toBeGreaterThanOrEqual(4); // 3 from content + 1 from tags
      
      // Should have ALL content-derived website tags (all 3 values from malformed JSON)
      const contentWebsiteTag1 = websiteTags.find(tag => tag.values[0] === "https://first-website.com");
      const contentWebsiteTag2 = websiteTags.find(tag => tag.values[0] === "https://second-website.com");
      const contentWebsiteTag3 = websiteTags.find(tag => tag.values[0] === "https://third-website.com");
      expect(contentWebsiteTag1).toBeDefined();
      expect(contentWebsiteTag2).toBeDefined();
      expect(contentWebsiteTag3).toBeDefined();
      
      // Should have original tag website
      const tagWebsiteTag = websiteTags.find(tag => tag.values[0] === "https://tag-website.com");
      expect(tagWebsiteTag).toBeDefined();
      
      // Should have multiple nip05 entries
      const nip05Tags = tags.filter(tag => tag.key === "nip05");
      expect(nip05Tags.length).toBeGreaterThanOrEqual(4); // 3 from content + 1 from tags
      
      // Should have ALL content-derived nip05 tags (all 3 values from malformed JSON)
      const contentNip05Tag1 = nip05Tags.find(tag => tag.values[0] === "first@example.com");
      const contentNip05Tag2 = nip05Tags.find(tag => tag.values[0] === "second@example.com");
      const contentNip05Tag3 = nip05Tags.find(tag => tag.values[0] === "third@example.com");
      expect(contentNip05Tag1).toBeDefined();
      expect(contentNip05Tag2).toBeDefined();
      expect(contentNip05Tag3).toBeDefined();
      
      // Should have original tag nip05
      const tagNip05Tag = nip05Tags.find(tag => tag.values[0] === "tag-nip05@example.com");
      expect(tagNip05Tag).toBeDefined();
    });

    it("should deduplicate only identical tags (same key and ALL values)", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Event with some identical tags and some similar but different tags
      const eventWithMixedTags: NDKEvent = {
        id: "test-mixed-tags",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 0,
        content: '{"name":"Testerin2","nip05":"content-nip05@example.com"}',
        tags: [
          // Identical tags (should be deduplicated)
          ["nip05", "tag-nip05@example.com"],
          ["nip05", "tag-nip05@example.com"], // Identical - should be deduplicated
          ["website", "https://example.com"],
          ["website", "https://example.com"], // Identical - should be deduplicated
          
          // Similar but different tags (should be preserved)
          ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2"],
          ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "wss://relay1.com"], // Different - has relay
          ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "wss://relay2.com"], // Different - different relay
          
          // Multi-value tags that are identical
          ["e", "event1", "relay1", "reply"],
          ["e", "event1", "relay1", "reply"], // Identical - should be deduplicated
          
          // Multi-value tags that are different
          ["e", "event1", "relay1", "reply"],
          ["e", "event1", "relay2", "reply"], // Different - different relay
          ["e", "event2", "relay1", "reply"]  // Different - different event
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(eventWithMixedTags);

      const result = await loadEvent(mockNDK, "test-mixed-tags");

      expect(result).not.toBeNull();
      const tags = result!.tags;
      
      // Should deduplicate identical single-value tags
      const nip05Tags = tags.filter(tag => tag.key === "nip05");
      expect(nip05Tags).toHaveLength(2); // Content + 1 (deduplicated)
      expect(nip05Tags[0].values[0]).toBe("content-nip05@example.com"); // Content entry first
      expect(nip05Tags[1].values[0]).toBe("tag-nip05@example.com"); // One original tag
      
      const websiteTags = tags.filter(tag => tag.key === "website");
      expect(websiteTags).toHaveLength(1); // 1 (deduplicated, no content website)
      expect(websiteTags[0].values[0]).toBe("https://example.com");
      
      // Should preserve different multi-value tags
      const pTags = tags.filter(tag => tag.key === "p");
      expect(pTags).toHaveLength(3); // All 3 are different
      expect(pTags[0].values).toEqual(["0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2"]);
      expect(pTags[1].values).toEqual(["0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "wss://relay1.com"]);
      expect(pTags[2].values).toEqual(["0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "wss://relay2.com"]);
      
      // Should deduplicate identical multi-value tags but preserve different ones
      const eTags = tags.filter(tag => tag.key === "e");
      expect(eTags).toHaveLength(3); // 1 identical + 2 different
      // Find the identical one (should appear only once)
      const identicalETags = eTags.filter(tag => 
        tag.values.length === 3 && 
        tag.values[0] === "event1" && 
        tag.values[1] === "relay1" && 
        tag.values[2] === "reply"
      );
      expect(identicalETags).toHaveLength(1); // Should be deduplicated
      
      // Find the different ones
      const differentETag1 = eTags.find(tag => 
        tag.values.length === 3 && 
        tag.values[0] === "event1" && 
        tag.values[1] === "relay2" && 
        tag.values[2] === "reply"
      );
      const differentETag2 = eTags.find(tag => 
        tag.values.length === 3 && 
        tag.values[0] === "event2" && 
        tag.values[1] === "relay1" && 
        tag.values[2] === "reply"
      );
      expect(differentETag1).toBeDefined();
      expect(differentETag2).toBeDefined();
    });

    it("should handle tags with same key but different values (should be separate entries)", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Event with same key but different values
      const eventWithSameKeyDifferentValues: NDKEvent = {
        id: "test-same-key-different-values",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 0,
        content: '{"name":"Testerin2","nip05":"content-nip05@example.com"}',
        tags: [
          ["nip05", "tag-nip05-1@example.com"],
          ["nip05", "tag-nip05-2@example.com"],
          ["website", "https://website1.com"],
          ["website", "https://website2.com"],
          ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2"],
          ["p", "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9"]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(eventWithSameKeyDifferentValues);

      const result = await loadEvent(mockNDK, "test-same-key-different-values");

      expect(result).not.toBeNull();
      const tags = result!.tags;
      
      // Should have multiple nip05 entries (content + 2 tags)
      const nip05Tags = tags.filter(tag => tag.key === "nip05");
      expect(nip05Tags).toHaveLength(3);
      
      // Content entry should be first
      const contentNip05Tag = nip05Tags.find(tag => tag.values[0] === "content-nip05@example.com");
      expect(contentNip05Tag).toBeDefined();
      
      // Tag entries should be separate
      const tagNip05Tag1 = nip05Tags.find(tag => tag.values[0] === "tag-nip05-1@example.com");
      const tagNip05Tag2 = nip05Tags.find(tag => tag.values[0] === "tag-nip05-2@example.com");
      expect(tagNip05Tag1).toBeDefined();
      expect(tagNip05Tag2).toBeDefined();
      
      // Should have multiple website entries (2 tags, no content website)
      const websiteTags = tags.filter(tag => tag.key === "website");
      expect(websiteTags).toHaveLength(2);
      
      // Should have multiple p entries (2 tags)
      const pTags = tags.filter(tag => tag.key === "p");
      expect(pTags).toHaveLength(2);
    });

    it("should handle empty content field gracefully", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Profile event with empty content
      const profileEventWithEmptyContent: NDKEvent = {
        id: "test-empty-content",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 0,
        content: "",
        tags: [
          ["nip05", "test@example.com"],
          ["website", "https://example.com"],
          ["name", "Test User"]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(profileEventWithEmptyContent);

      const result = await loadEvent(mockNDK, "test-empty-content");

      expect(result).not.toBeNull();
      expect(result!.eventData.content).toBe("");
      
      const tags = result!.tags;
      
      // Should only have the original tags (no content-derived tags)
      expect(tags).toHaveLength(3);
      
      const nip05Tag = tags.find(tag => tag.key === "nip05");
      const websiteTag = tags.find(tag => tag.key === "website");
      const nameTag = tags.find(tag => tag.key === "name");
      
      expect(nip05Tag).toBeDefined();
      expect(nip05Tag!.values[0]).toBe("test@example.com");
      expect(websiteTag).toBeDefined();
      expect(websiteTag!.values[0]).toBe("https://example.com");
      expect(nameTag).toBeDefined();
      expect(nameTag!.values[0]).toBe("Test User");
    });

    it("should handle content with null/undefined values", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Profile event with null/undefined values in content
      const profileEventWithNullValues: NDKEvent = {
        id: "test-null-values",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 0,
        content: '{"name":"Testerin2","about":null,"website":"","banner":null,"picture":"https://example.com/image.jpg","nip05":"test@example.com"}',
        tags: [
          ["nip05", "tag-nip05@example.com"],
          ["website", "https://tag-website.com"]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(profileEventWithNullValues);

      const result = await loadEvent(mockNDK, "test-null-values");

      expect(result).not.toBeNull();
      const tags = result!.tags;
      
      // Should have valid fields from content
      const nameTag = tags.find(tag => tag.key === "name");
      const pictureTag = tags.find(tag => tag.key === "picture");
      const contentNip05Tag = tags.find(tag => tag.key === "nip05" && tag.values[0] === "test@example.com");
      
      expect(nameTag).toBeDefined();
      expect(nameTag!.values[0]).toBe("Testerin2");
      expect(pictureTag).toBeDefined();
      expect(pictureTag!.values[0]).toBe("https://example.com/image.jpg");
      expect(contentNip05Tag).toBeDefined();
      
      // Should not have null/undefined/empty fields from content
      const aboutTag = tags.find(tag => tag.key === "about");
      const bannerTag = tags.find(tag => tag.key === "banner");
      const emptyWebsiteTag = tags.find(tag => tag.key === "website" && tag.values[0] === "");
      
      expect(aboutTag).toBeUndefined();
      expect(bannerTag).toBeUndefined();
      expect(emptyWebsiteTag).toBeUndefined(); // Empty string from content should be filtered out
      
      // Should still have original tags
      const tagNip05Tag = tags.find(tag => tag.key === "nip05" && tag.values[0] === "tag-nip05@example.com");
      const tagWebsiteTag = tags.find(tag => tag.key === "website" && tag.values[0] === "https://tag-website.com");
      
      expect(tagNip05Tag).toBeDefined();
      expect(tagWebsiteTag).toBeDefined();
    });

    it("should handle tags with only empty strings", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Event with tags containing only empty strings
      const eventWithEmptyTagValues: NDKEvent = {
        id: "test-empty-tag-values",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 1,
        content: "Test content",
        tags: [
          ["p", "", "", ""],
          ["e", "", "", ""],
          ["t", ""],
          ["", ""], // Tag with empty key
          ["valid", "value"]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(eventWithEmptyTagValues);

      const result = await loadEvent(mockNDK, "test-empty-tag-values");

      expect(result).not.toBeNull();
      const tags = result!.tags;
      
      // Should preserve tags with empty values
      const pTag = tags.find(tag => tag.key === "p");
      const eTag = tags.find(tag => tag.key === "e");
      const tTag = tags.find(tag => tag.key === "t");
      const validTag = tags.find(tag => tag.key === "valid");
      
      expect(pTag).toBeDefined();
      expect(pTag!.values).toEqual(["", "", ""]);
      
      expect(eTag).toBeDefined();
      expect(eTag!.values).toEqual(["", "", ""]);
      
      expect(tTag).toBeDefined();
      expect(tTag!.values).toEqual([""]);
      
      expect(validTag).toBeDefined();
      expect(validTag!.values).toEqual(["value"]);
      
      // Should not include tags with empty keys
      const emptyKeyTag = tags.find(tag => tag.key === "");
      expect(emptyKeyTag).toBeUndefined();
    });

    it("should correctly handle Kind 24 event with p tags containing empty values", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Kind 24 event with p tags that have empty string values
      const kind24Event: NDKEvent = {
        id: "fb33f8a7b3632e1ca10c2dd51b4786690d5a8212bcb5a3cbdad7ab2b7a0f5ed9",
        pubkey: "dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319",
        created_at: 1756144261,
        kind: 24,
        content: "It's a public message. You can also see it in the new Amethyst replies.",
        tags: [
          ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""],
          ["p", "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9", "", ""],
          ["p", "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18", "", ""],
          ["q", "cebd54c9cb441661cbb5b9d0ec0d87acf4f411c8d2942be763ac90133379297d", "ws://localhost:4869", ""],
          ["expiration", "1758563461", "", ""]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(kind24Event);

      const result = await loadEvent(mockNDK, "fb33f8a7b3632e1ca10c2dd51b4786690d5a8212bcb5a3cbdad7ab2b7a0f5ed9");

      expect(result).not.toBeNull();
      const tags = result!.tags;
      
      // Should have 3 p tags, each with 3 values (pubkey + 2 empty strings)
      const pTags = tags.filter(tag => tag.key === "p");
      expect(pTags).toHaveLength(3);
      
      // Check each p tag has the correct values
      const pTag1 = pTags.find(tag => tag.values[0] === "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2");
      const pTag2 = pTags.find(tag => tag.values[0] === "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9");
      const pTag3 = pTags.find(tag => tag.values[0] === "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18");
      
      expect(pTag1).toBeDefined();
      expect(pTag1!.values).toEqual(["0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""]);
      
      expect(pTag2).toBeDefined();
      expect(pTag2!.values).toEqual(["70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9", "", ""]);
      
      expect(pTag3).toBeDefined();
      expect(pTag3!.values).toEqual(["645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18", "", ""]);
      
      // Should have 1 q tag with 3 values
      const qTags = tags.filter(tag => tag.key === "q");
      expect(qTags).toHaveLength(1);
      expect(qTags[0].values).toEqual(["cebd54c9cb441661cbb5b9d0ec0d87acf4f411c8d2942be763ac90133379297d", "ws://localhost:4869", ""]);
      
      // Should have 1 expiration tag with 3 values
      const expirationTags = tags.filter(tag => tag.key === "expiration");
      expect(expirationTags).toHaveLength(1);
      expect(expirationTags[0].values).toEqual(["1758563461", "", ""]);
    });

    it("should correctly convert loaded tags back to NDK format for display", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Kind 24 event with p tags that have empty string values
      const kind24Event: NDKEvent = {
        id: "fb33f8a7b3632e1ca10c2dd51b4786690d5a8212bcb5a3cbdad7ab2b7a0f5ed9",
        pubkey: "dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319",
        created_at: 1756144261,
        kind: 24,
        content: "It's a public message. You can also see it in the new Amethyst replies.",
        tags: [
          ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""],
          ["p", "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9", "", ""],
          ["p", "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18", "", ""],
          ["q", "cebd54c9cb441661cbb5b9d0ec0d87acf4f411c8d2942be763ac90133379297d", "ws://localhost:4869", ""],
          ["expiration", "1758563461", "", ""]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(kind24Event);

      const result = await loadEvent(mockNDK, "fb33f8a7b3632e1ca10c2dd51b4786690d5a8212bcb5a3cbdad7ab2b7a0f5ed9");

      expect(result).not.toBeNull();
      const tags = result!.tags;
      
      // Test the conversion directly
      const { convertTagsToNDKFormat } = await import("$lib/components/event_input/eventServices");
      
      // Convert the loaded tags back to NDK format
      const convertedTags = convertTagsToNDKFormat(tags);
      
      // Should have 3 p tags, each with 3 values
      const pTags = convertedTags.filter((tag: string[]) => tag[0] === "p");
      expect(pTags).toHaveLength(3);
      
      // Check each p tag has the correct structure
      const pTag1 = pTags.find((tag: string[]) => tag[1] === "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2");
      const pTag2 = pTags.find((tag: string[]) => tag[1] === "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9");
      const pTag3 = pTags.find((tag: string[]) => tag[1] === "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18");
      
      expect(pTag1).toBeDefined();
      expect(pTag1).toEqual(["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""]);
      
      expect(pTag2).toBeDefined();
      expect(pTag2).toEqual(["p", "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9", "", ""]);
      
      expect(pTag3).toBeDefined();
      expect(pTag3).toEqual(["p", "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18", "", ""]);
      
      // Should have 1 q tag with 3 values
      const qTags = convertedTags.filter((tag: string[]) => tag[0] === "q");
      expect(qTags).toHaveLength(1);
      expect(qTags[0]).toEqual(["q", "cebd54c9cb441661cbb5b9d0ec0d87acf4f411c8d2942be763ac90133379297d", "ws://localhost:4869", ""]);
      
      // Should have 1 expiration tag with 3 values
      const expirationTags = convertedTags.filter((tag: string[]) => tag[0] === "expiration");
      expect(expirationTags).toHaveLength(1);
      expect(expirationTags[0]).toEqual(["expiration", "1758563461", "", ""]);
    });

    it("should handle ALL tag types with multiple values (not just a and e tags)", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      // Event demonstrating that ALL tag types can have multiple values
      const eventWithMultiValueTags: NDKEvent = {
        id: "test-multi-value-all-tags",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 1,
        content: "Test content with multi-value tags",
        tags: [
          // Standard tags with multiple values
          ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "wss://relay1.com", "mention"],
          ["e", "c5bfb5eb9b341e1866800621769e79e0a34551eb3661ec86c43583e4f58b33f0", "wss://relay2.com", "reply"],
          ["t", "bitcoin", "nostr", "crypto"], // Multiple hashtags
          ["d", "document-id", "version-1", "draft"], // Multiple d values
          ["title", "My Title", "Subtitle", "Category"], // Multiple title values
          ["author", "Author Name", "Author Pubkey", "Author Role"], // Multiple author values
          ["image", "https://image1.com", "https://image2.com", "thumbnail"], // Multiple images
          ["summary", "Short summary", "Long summary", "Extended summary"], // Multiple summaries
          ["published_at", "1757073988", "1757074000", "1757074100"], // Multiple timestamps
          // Custom tags with multiple values
          ["custom", "value1", "value2", "value3"],
          ["location", "New York", "NYC", "USA", "North America"],
          ["tags", "important", "urgent", "review", "public"]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(eventWithMultiValueTags);

      const result = await loadEvent(mockNDK, "test-multi-value-all-tags");

      expect(result).not.toBeNull();
      const tags = result!.tags;
      
      // Verify that ALL tag types preserve their multiple values
      const pTag = tags.find(tag => tag.key === "p");
      expect(pTag).toBeDefined();
      expect(pTag!.values).toHaveLength(3);
      expect(pTag!.values[0]).toBe("0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2");
      expect(pTag!.values[1]).toBe("wss://relay1.com");
      expect(pTag!.values[2]).toBe("mention");
      
      const eTag = tags.find(tag => tag.key === "e");
      expect(eTag).toBeDefined();
      expect(eTag!.values).toHaveLength(3);
      expect(eTag!.values[0]).toBe("c5bfb5eb9b341e1866800621769e79e0a34551eb3661ec86c43583e4f58b33f0");
      expect(eTag!.values[1]).toBe("wss://relay2.com");
      expect(eTag!.values[2]).toBe("reply");
      
      const tTag = tags.find(tag => tag.key === "t");
      expect(tTag).toBeDefined();
      expect(tTag!.values).toHaveLength(3);
      expect(tTag!.values).toEqual(["bitcoin", "nostr", "crypto"]);
      
      const dTag = tags.find(tag => tag.key === "d");
      expect(dTag).toBeDefined();
      expect(dTag!.values).toHaveLength(3);
      expect(dTag!.values).toEqual(["document-id", "version-1", "draft"]);
      
      const titleTag = tags.find(tag => tag.key === "title");
      expect(titleTag).toBeDefined();
      expect(titleTag!.values).toHaveLength(3);
      expect(titleTag!.values).toEqual(["My Title", "Subtitle", "Category"]);
      
      const authorTag = tags.find(tag => tag.key === "author");
      expect(authorTag).toBeDefined();
      expect(authorTag!.values).toHaveLength(3);
      expect(authorTag!.values).toEqual(["Author Name", "Author Pubkey", "Author Role"]);
      
      const imageTag = tags.find(tag => tag.key === "image");
      expect(imageTag).toBeDefined();
      expect(imageTag!.values).toHaveLength(3);
      expect(imageTag!.values).toEqual(["https://image1.com", "https://image2.com", "thumbnail"]);
      
      const summaryTag = tags.find(tag => tag.key === "summary");
      expect(summaryTag).toBeDefined();
      expect(summaryTag!.values).toHaveLength(3);
      expect(summaryTag!.values).toEqual(["Short summary", "Long summary", "Extended summary"]);
      
      const publishedAtTag = tags.find(tag => tag.key === "published_at");
      expect(publishedAtTag).toBeDefined();
      expect(publishedAtTag!.values).toHaveLength(3);
      expect(publishedAtTag!.values).toEqual(["1757073988", "1757074000", "1757074100"]);
      
      const customTag = tags.find(tag => tag.key === "custom");
      expect(customTag).toBeDefined();
      expect(customTag!.values).toHaveLength(3);
      expect(customTag!.values).toEqual(["value1", "value2", "value3"]);
      
      const locationTag = tags.find(tag => tag.key === "location");
      expect(locationTag).toBeDefined();
      expect(locationTag!.values).toHaveLength(4);
      expect(locationTag!.values).toEqual(["New York", "NYC", "USA", "North America"]);
      
      const tagsTag = tags.find(tag => tag.key === "tags");
      expect(tagsTag).toBeDefined();
      expect(tagsTag!.values).toHaveLength(4);
      expect(tagsTag!.values).toEqual(["important", "urgent", "review", "public"]);
    });
  });

  describe("TagManager and EventPreview Integration", () => {
    it("should preserve all p tags with empty values in TagManager and EventPreview", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      const { convertTagsToNDKFormat } = await import("$lib/components/event_input/eventServices");
      
      // Kind 24 event with multiple p tags that have empty values
      const kind24Event: NDKEvent = {
        id: "fb33f8a7b3632e1ca10c2dd51b4786690d5a8212bcb5a3cbdad7ab2b7a0f5ed9",
        pubkey: "dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319",
        created_at: 1756144261,
        kind: 24,
        content: "It's a public message. You can also see it in the new Amethyst replies.",
        tags: [
          ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""],
          ["p", "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9", "", ""],
          ["p", "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18", "", ""],
          ["q", "cebd54c9cb441661cbb5b9d0ec0d87acf4f411c8d2942be763ac90133379297d", "ws://localhost:4869", ""],
          ["expiration", "1758563461", "", ""]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(kind24Event);

      // Test 1: loadEvent should preserve all tags
      const result = await loadEvent(mockNDK, "fb33f8a7b3632e1ca10c2dd51b4786690d5a8212bcb5a3cbdad7ab2b7a0f5ed9");
      expect(result).not.toBeNull();
      
      const tags = result!.tags;
      const pTags = tags.filter(tag => tag.key === "p");
      expect(pTags).toHaveLength(3);
      
      // Test 2: convertTagsToNDKFormat should preserve all tags
      const convertedTags = convertTagsToNDKFormat(tags);
      const convertedPTags = convertedTags.filter((tag: string[]) => tag[0] === "p");
      expect(convertedPTags).toHaveLength(3);
      
      // Test 3: Verify each p tag has the correct structure
      const expectedPTags = [
        ["p", "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""],
        ["p", "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9", "", ""],
        ["p", "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18", "", ""]
      ];
      
      for (const expectedTag of expectedPTags) {
        const foundTag = convertedPTags.find((tag: string[]) => tag[1] === expectedTag[1]);
        expect(foundTag).toBeDefined();
        expect(foundTag).toEqual(expectedTag);
      }
      
      // Test 4: Verify q and expiration tags are also preserved
      const qTags = convertedTags.filter((tag: string[]) => tag[0] === "q");
      const expirationTags = convertedTags.filter((tag: string[]) => tag[0] === "expiration");
      
      expect(qTags).toHaveLength(1);
      expect(qTags[0]).toEqual(["q", "cebd54c9cb441661cbb5b9d0ec0d87acf4f411c8d2942be763ac90133379297d", "ws://localhost:4869", ""]);
      
      expect(expirationTags).toHaveLength(1);
      expect(expirationTags[0]).toEqual(["expiration", "1758563461", "", ""]);
    });

    it("should handle TagManager duplicate detection correctly for tags with same key but different values", async () => {
      // This test simulates the TagManager behavior for tags with same key but different values
      const tagsWithSameKey: TagData[] = [
        { key: "p", values: ["0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""] },
        { key: "p", values: ["70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9", "", ""] },
        { key: "p", values: ["645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18", "", ""] },
        { key: "q", values: ["cebd54c9cb441661cbb5b9d0ec0d87acf4f411c8d2942be763ac90133379297d", "ws://localhost:4869", ""] }
      ];
      
      // Simulate the TagManager's duplicate detection logic
      const newTags: TagData[] = [];
      const presetTags: any[] = []; // No preset tags for this test
      
      for (const tag of tagsWithSameKey) {
        const isPresetKey = presetTags.some(p => p.key === tag.key);
        // This is the fixed logic that compares both key and values
        const alreadyAdded = newTags.some(t => 
          t.key === tag.key && 
          JSON.stringify(t.values) === JSON.stringify(tag.values)
        );
        
        if (!isPresetKey && !alreadyAdded) {
          newTags.push(tag);
        }
      }
      
      // Should preserve all tags since they have different values
      expect(newTags).toHaveLength(4);
      
      const pTags = newTags.filter(tag => tag.key === "p");
      expect(pTags).toHaveLength(3);
      
      const qTags = newTags.filter(tag => tag.key === "q");
      expect(qTags).toHaveLength(1);
    });

    it("should handle TagManager duplicate detection correctly for truly identical tags", async () => {
      // This test simulates the TagManager behavior for truly identical tags
      const tagsWithDuplicates: TagData[] = [
        { key: "p", values: ["0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""] },
        { key: "p", values: ["0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2", "", ""] }, // Duplicate
        { key: "p", values: ["70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9", "", ""] }
      ];
      
      // Simulate the TagManager's duplicate detection logic
      const newTags: TagData[] = [];
      const presetTags: any[] = []; // No preset tags for this test
      
      for (const tag of tagsWithDuplicates) {
        const isPresetKey = presetTags.some(p => p.key === tag.key);
        // This is the fixed logic that compares both key and values
        const alreadyAdded = newTags.some(t => 
          t.key === tag.key && 
          JSON.stringify(t.values) === JSON.stringify(tag.values)
        );
        
        if (!isPresetKey && !alreadyAdded) {
          newTags.push(tag);
        }
      }
      
      // Should deduplicate identical tags but preserve different ones
      expect(newTags).toHaveLength(2);
      
      const pTags = newTags.filter(tag => tag.key === "p");
      expect(pTags).toHaveLength(2);
      
      // Verify the correct tags are preserved
      const tag1 = pTags.find(tag => tag.values[0] === "0689df5847a8d3376892da29622d7c0fdc1ef1958f4bc4471d90966aa1eca9f2");
      const tag2 = pTags.find(tag => tag.values[0] === "70122128273bdc07af9be7725fa5c4bc0fc146866bec38d44360dc4bc6cc18b9");
      
      expect(tag1).toBeDefined();
      expect(tag2).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should return null when event is not found", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      vi.mocked(fetchEventWithFallback).mockResolvedValue(null);

      const result = await loadEvent(mockNDK, "nonexistent-event-id");

      expect(result).toBeNull();
    });

    it("should handle invalid JSON in profile content gracefully", async () => {
      const { fetchEventWithFallback } = await import("$lib/utils/nostrUtils");
      
      const profileEventWithInvalidJSON: NDKEvent = {
        id: "test-id",
        pubkey: "645eb808ac7689f08b5143fbe7aa7289baad2e3bf069c81d2a22a0d3b3589c18",
        created_at: 1757073988,
        kind: 0,
        content: "invalid json content",
        tags: [
          ["nip05", "test@example.com"]
        ],
        sig: "test_sig"
      } as any;

      vi.mocked(fetchEventWithFallback).mockResolvedValue(profileEventWithInvalidJSON);

      const result = await loadEvent(mockNDK, "test-id");

      expect(result).not.toBeNull();
      expect(result!.eventData.content).toBe("invalid json content");
      // Should still have the original tags even if content parsing fails
      expect(result!.tags).toHaveLength(1);
      expect(result!.tags[0].key).toBe("nip05");
    });
  });
});
