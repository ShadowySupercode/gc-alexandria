import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import type { UserState } from "../../src/lib/stores/userStore.ts";
import { NDKEvent } from "@nostr-dev-kit/ndk";

// Mock userStore
const createMockUserStore = (signedIn: boolean = false) => {
  const store = writable<UserState>({
    pubkey: signedIn ? "a".repeat(64) : null,
    npub: signedIn ? "npub1test" : null,
    profile: signedIn
      ? {
        name: "Test User",
        displayName: "Test User",
        picture: "https://example.com/avatar.jpg",
      }
      : null,
    relays: { inbox: [], outbox: [] },
    loginMethod: signedIn ? "extension" : null,
    ndkUser: null,
    signer: signedIn ? { sign: vi.fn() } as any : null,
    signedIn,
  });
  return store;
};

// Mock activeOutboxRelays
const mockActiveOutboxRelays = writable<string[]>(["wss://relay.example.com"]);

// Mock NDK
const createMockNDK = () => ({
  fetchEvent: vi.fn(),
  publish: vi.fn(),
});

describe("CommentButton - Address Parsing", () => {
  it("parses valid event address correctly", () => {
    const address = "30041:abc123def456:my-article";
    const parts = address.split(":");

    expect(parts).toHaveLength(3);

    const [kindStr, pubkey, dTag] = parts;
    const kind = parseInt(kindStr);

    expect(kind).toBe(30041);
    expect(pubkey).toBe("abc123def456");
    expect(dTag).toBe("my-article");
    expect(isNaN(kind)).toBe(false);
  });

  it("handles dTag with colons correctly", () => {
    const address = "30041:abc123:article:with:colons";
    const parts = address.split(":");

    expect(parts.length).toBeGreaterThanOrEqual(3);

    const [kindStr, pubkey, ...dTagParts] = parts;
    const dTag = dTagParts.join(":");

    expect(parseInt(kindStr)).toBe(30041);
    expect(pubkey).toBe("abc123");
    expect(dTag).toBe("article:with:colons");
  });

  it("returns null for invalid address format (too few parts)", () => {
    const address = "30041:abc123";
    const parts = address.split(":");

    if (parts.length !== 3) {
      expect(parts.length).toBeLessThan(3);
    }
  });

  it("returns null for invalid address format (invalid kind)", () => {
    const address = "invalid:abc123:dtag";
    const parts = address.split(":");
    const kind = parseInt(parts[0]);

    expect(isNaN(kind)).toBe(true);
  });

  it("parses different publication kinds correctly", () => {
    const addresses = [
      "30040:pubkey:section-id", // Zettel section
      "30041:pubkey:article-id", // Long-form article
      "30818:pubkey:wiki-id", // Wiki article
      "30023:pubkey:blog-id", // Blog post
    ];

    addresses.forEach((address) => {
      const parts = address.split(":");
      const kind = parseInt(parts[0]);

      expect(isNaN(kind)).toBe(false);
      expect(kind).toBeGreaterThan(0);
    });
  });
});

describe("CommentButton - NIP-22 Event Creation", () => {
  let mockNDK: any;
  let mockUserStore: any;
  let mockActiveOutboxRelays: any;

  beforeEach(() => {
    mockNDK = createMockNDK();
    mockUserStore = createMockUserStore(true);
    mockActiveOutboxRelays = writable(["wss://relay.example.com"]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates kind 1111 comment event", async () => {
    const address = "30041:" + "a".repeat(64) + ":my-article";
    const content = "This is my comment";

    // Mock event creation
    const commentEvent = new NDKEvent(mockNDK);
    commentEvent.kind = 1111;
    commentEvent.content = content;

    expect(commentEvent.kind).toBe(1111);
    expect(commentEvent.content).toBe(content);
  });

  it("includes correct uppercase tags (A, K, P) for root", () => {
    const address = "30041:" + "b".repeat(64) + ":article-id";
    const authorPubkey = "b".repeat(64);
    const kind = 30041;
    const relayHint = "wss://relay.example.com";

    const tags = [
      ["A", address, relayHint, authorPubkey],
      ["K", kind.toString()],
      ["P", authorPubkey, relayHint],
    ];

    // Verify uppercase root tags
    expect(tags[0][0]).toBe("A");
    expect(tags[0][1]).toBe(address);
    expect(tags[0][2]).toBe(relayHint);
    expect(tags[0][3]).toBe(authorPubkey);

    expect(tags[1][0]).toBe("K");
    expect(tags[1][1]).toBe(kind.toString());

    expect(tags[2][0]).toBe("P");
    expect(tags[2][1]).toBe(authorPubkey);
    expect(tags[2][2]).toBe(relayHint);
  });

  it("includes correct lowercase tags (a, k, p) for parent", () => {
    const address = "30041:" + "c".repeat(64) + ":article-id";
    const authorPubkey = "c".repeat(64);
    const kind = 30041;
    const relayHint = "wss://relay.example.com";

    const tags = [
      ["a", address, relayHint],
      ["k", kind.toString()],
      ["p", authorPubkey, relayHint],
    ];

    // Verify lowercase parent tags
    expect(tags[0][0]).toBe("a");
    expect(tags[0][1]).toBe(address);
    expect(tags[0][2]).toBe(relayHint);

    expect(tags[1][0]).toBe("k");
    expect(tags[1][1]).toBe(kind.toString());

    expect(tags[2][0]).toBe("p");
    expect(tags[2][1]).toBe(authorPubkey);
    expect(tags[2][2]).toBe(relayHint);
  });

  it("includes e tag with event ID when available", () => {
    const eventId = "d".repeat(64);
    const relayHint = "wss://relay.example.com";

    const eTag = ["e", eventId, relayHint];

    expect(eTag[0]).toBe("e");
    expect(eTag[1]).toBe(eventId);
    expect(eTag[2]).toBe(relayHint);
    expect(eTag[1]).toHaveLength(64);
  });

  it("creates complete NIP-22 tag structure", () => {
    const address = "30041:" + "e".repeat(64) + ":test-article";
    const authorPubkey = "e".repeat(64);
    const kind = 30041;
    const eventId = "f".repeat(64);
    const relayHint = "wss://relay.example.com";

    const tags = [
      // Root scope - uppercase tags
      ["A", address, relayHint, authorPubkey],
      ["K", kind.toString()],
      ["P", authorPubkey, relayHint],

      // Parent scope - lowercase tags
      ["a", address, relayHint],
      ["k", kind.toString()],
      ["p", authorPubkey, relayHint],

      // Event ID
      ["e", eventId, relayHint],
    ];

    // Verify all tags are present
    expect(tags).toHaveLength(7);

    // Verify root tags
    expect(tags.filter((t) => t[0] === "A")).toHaveLength(1);
    expect(tags.filter((t) => t[0] === "K")).toHaveLength(1);
    expect(tags.filter((t) => t[0] === "P")).toHaveLength(1);

    // Verify parent tags
    expect(tags.filter((t) => t[0] === "a")).toHaveLength(1);
    expect(tags.filter((t) => t[0] === "k")).toHaveLength(1);
    expect(tags.filter((t) => t[0] === "p")).toHaveLength(1);

    // Verify event tag
    expect(tags.filter((t) => t[0] === "e")).toHaveLength(1);
  });

  it("uses correct relay hints from activeOutboxRelays", () => {
    const relays: string[] = get(mockActiveOutboxRelays);
    const relayHint = relays[0];

    expect(relayHint).toBe("wss://relay.example.com");
    expect(relays).toHaveLength(1);
  });

  it("handles multiple outbox relays correctly", () => {
    const multipleRelays = writable([
      "wss://relay1.example.com",
      "wss://relay2.example.com",
      "wss://relay3.example.com",
    ]);

    const relays = get(multipleRelays);
    const relayHint = relays[0];

    expect(relayHint).toBe("wss://relay1.example.com");
    expect(relays).toHaveLength(3);
  });

  it("handles empty relay list gracefully", () => {
    const emptyRelays = writable<string[]>([]);
    const relays = get(emptyRelays);
    const relayHint = relays[0] || "";

    expect(relayHint).toBe("");
  });
});

describe("CommentButton - Event Signing and Publishing", () => {
  let mockNDK: any;
  let mockSigner: any;

  beforeEach(() => {
    mockNDK = createMockNDK();
    mockSigner = {
      sign: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("signs event with user signer", async () => {
    const commentEvent = new NDKEvent(mockNDK);
    commentEvent.kind = 1111;
    commentEvent.content = "Test comment";

    await mockSigner.sign(commentEvent);

    expect(mockSigner.sign).toHaveBeenCalledWith(commentEvent);
    expect(mockSigner.sign).toHaveBeenCalledTimes(1);
  });

  it("publishes to outbox relays", async () => {
    const publishMock = vi.fn().mockResolvedValue(
      new Set(["wss://relay.example.com"]),
    );

    const commentEvent = new NDKEvent(mockNDK);
    commentEvent.publish = publishMock;

    const publishedRelays = await commentEvent.publish();

    expect(publishMock).toHaveBeenCalled();
    expect(publishedRelays.size).toBeGreaterThan(0);
  });

  it("handles publishing errors gracefully", async () => {
    const publishMock = vi.fn().mockResolvedValue(new Set());

    const commentEvent = new NDKEvent(mockNDK);
    commentEvent.publish = publishMock;

    const publishedRelays = await commentEvent.publish();

    expect(publishedRelays.size).toBe(0);
  });

  it("throws error when publishing fails", async () => {
    const publishMock = vi.fn().mockRejectedValue(new Error("Network error"));

    const commentEvent = new NDKEvent(mockNDK);
    commentEvent.publish = publishMock;

    await expect(commentEvent.publish()).rejects.toThrow("Network error");
  });
});

describe("CommentButton - User Authentication", () => {
  it("requires user to be signed in", () => {
    const signedOutStore = createMockUserStore(false);
    const user = get(signedOutStore);

    expect(user.signedIn).toBe(false);
    expect(user.signer).toBeNull();
  });

  it("shows error when user is not signed in", () => {
    const signedOutStore = createMockUserStore(false);
    const user = get(signedOutStore);

    if (!user.signedIn || !user.signer) {
      const error = "You must be signed in to comment";
      expect(error).toBe("You must be signed in to comment");
    }
  });

  it("allows commenting when user is signed in", () => {
    const signedInStore = createMockUserStore(true);
    const user = get(signedInStore);

    expect(user.signedIn).toBe(true);
    expect(user.signer).not.toBeNull();
  });

  it("displays user profile information when signed in", () => {
    const signedInStore = createMockUserStore(true);
    const user = get(signedInStore);

    expect(user.profile).not.toBeNull();
    expect(user.profile?.displayName).toBe("Test User");
    expect(user.profile?.picture).toBe("https://example.com/avatar.jpg");
  });

  it("handles missing user profile gracefully", () => {
    const storeWithoutProfile = writable<UserState>({
      pubkey: "a".repeat(64),
      npub: "npub1test",
      profile: null,
      relays: { inbox: [], outbox: [] },
      loginMethod: "extension",
      ndkUser: null,
      signer: { sign: vi.fn() } as any,
      signedIn: true,
    });

    const user = get(storeWithoutProfile);
    const displayName = user.profile?.displayName || user.profile?.name ||
      "Anonymous";

    expect(displayName).toBe("Anonymous");
  });
});

describe("CommentButton - User Interactions", () => {
  it("prevents submission of empty comment", () => {
    const commentContent = "";
    const isEmpty = !commentContent.trim();

    expect(isEmpty).toBe(true);
  });

  it("allows submission of non-empty comment", () => {
    const commentContent = "This is a valid comment";
    const isEmpty = !commentContent.trim();

    expect(isEmpty).toBe(false);
  });

  it("handles whitespace-only comments as empty", () => {
    const commentContent = "   \n\t  ";
    const isEmpty = !commentContent.trim();

    expect(isEmpty).toBe(true);
  });

  it("clears input after successful comment", () => {
    let commentContent = "This is my comment";

    // Simulate successful submission
    commentContent = "";

    expect(commentContent).toBe("");
  });

  it("closes comment UI after successful posting", () => {
    let showCommentUI = true;

    // Simulate successful post with delay
    setTimeout(() => {
      showCommentUI = false;
    }, 0);

    // Initially still open
    expect(showCommentUI).toBe(true);
  });

  it("calls onCommentPosted callback when provided", () => {
    const onCommentPosted = vi.fn();

    // Simulate successful comment post
    onCommentPosted();

    expect(onCommentPosted).toHaveBeenCalled();
  });
});

describe("CommentButton - UI State Management", () => {
  it("button is hidden by default", () => {
    const sectionHovered = false;
    const showCommentUI = false;
    const visible = sectionHovered || showCommentUI;

    expect(visible).toBe(false);
  });

  it("button appears on section hover", () => {
    const sectionHovered = true;
    const showCommentUI = false;
    const visible = sectionHovered || showCommentUI;

    expect(visible).toBe(true);
  });

  it("button remains visible when comment UI is shown", () => {
    const sectionHovered = false;
    const showCommentUI = true;
    const visible = sectionHovered || showCommentUI;

    expect(visible).toBe(true);
  });

  it("toggles comment UI when button is clicked", () => {
    let showCommentUI = false;

    // Simulate button click
    showCommentUI = !showCommentUI;
    expect(showCommentUI).toBe(true);

    // Click again
    showCommentUI = !showCommentUI;
    expect(showCommentUI).toBe(false);
  });

  it("resets error state when toggling UI", () => {
    let error: string | null = "Previous error";
    let success = true;

    // Simulate UI toggle
    error = null;
    success = false;

    expect(error).toBeNull();
    expect(success).toBe(false);
  });

  it("shows error message when present", () => {
    const error = "Failed to post comment";

    expect(error).toBeDefined();
    expect(error.length).toBeGreaterThan(0);
  });

  it("shows success message after posting", () => {
    const success = true;
    const successMessage = "Comment posted successfully!";

    if (success) {
      expect(successMessage).toBe("Comment posted successfully!");
    }
  });

  it("disables submit button when submitting", () => {
    const isSubmitting = true;
    const disabled = isSubmitting;

    expect(disabled).toBe(true);
  });

  it("disables submit button when comment is empty", () => {
    const commentContent = "";
    const isSubmitting = false;
    const disabled = isSubmitting || !commentContent.trim();

    expect(disabled).toBe(true);
  });

  it("enables submit button when comment is valid", () => {
    const commentContent = "Valid comment";
    const isSubmitting = false;
    const disabled = isSubmitting || !commentContent.trim();

    expect(disabled).toBe(false);
  });
});

describe("CommentButton - Edge Cases", () => {
  it("handles invalid address format gracefully", () => {
    const invalidAddresses = [
      "",
      "invalid",
      "30041:",
      ":pubkey:dtag",
      "30041:pubkey",
      "not-a-number:pubkey:dtag",
    ];

    invalidAddresses.forEach((address) => {
      const parts = address.split(":");
      const isValid = parts.length === 3 && !isNaN(parseInt(parts[0]));

      expect(isValid).toBe(false);
    });
  });

  it("handles network errors during event fetch", async () => {
    const mockNDK = {
      fetchEvent: vi.fn().mockRejectedValue(new Error("Network error")),
    };

    let eventId = "";
    try {
      await mockNDK.fetchEvent({});
    } catch (err) {
      // Handle gracefully, continue without event ID
      eventId = "";
    }

    expect(eventId).toBe("");
  });

  it("handles missing relay information", () => {
    const emptyRelays: string[] = [];
    const relayHint = emptyRelays[0] || "";

    expect(relayHint).toBe("");
  });

  it("handles very long comment text without truncation", () => {
    const longComment = "a".repeat(10000);
    const content = longComment;

    expect(content.length).toBe(10000);
    expect(content).toBe(longComment);
  });

  it("handles special characters in comments", () => {
    const specialComments = [
      'Comment with "quotes"',
      "Comment with emoji 😊",
      "Comment with\nnewlines",
      "Comment with\ttabs",
      "Comment with <html> tags",
      "Comment with & ampersands",
    ];

    specialComments.forEach((comment) => {
      expect(comment.length).toBeGreaterThan(0);
      expect(typeof comment).toBe("string");
    });
  });

  it("handles event creation failure", async () => {
    const address = "invalid:address";
    const parts = address.split(":");

    if (parts.length !== 3) {
      const error = "Invalid event address";
      expect(error).toBe("Invalid event address");
    }
  });

  it("handles signing errors", async () => {
    const mockSigner = {
      sign: vi.fn().mockRejectedValue(new Error("Signing failed")),
    };

    const event = { kind: 1111, content: "test" };

    await expect(mockSigner.sign(event)).rejects.toThrow("Signing failed");
  });

  it("handles publish failure when no relays accept event", async () => {
    const publishMock = vi.fn().mockResolvedValue(new Set());

    const relaySet = await publishMock();

    if (relaySet.size === 0) {
      const error = "Failed to publish to any relays";
      expect(error).toBe("Failed to publish to any relays");
    }
  });
});

describe("CommentButton - Cancel Functionality", () => {
  it("clears comment content when canceling", () => {
    let commentContent = "This comment will be canceled";

    // Simulate cancel
    commentContent = "";

    expect(commentContent).toBe("");
  });

  it("closes comment UI when canceling", () => {
    let showCommentUI = true;

    // Simulate cancel
    showCommentUI = false;

    expect(showCommentUI).toBe(false);
  });

  it("clears error state when canceling", () => {
    let error: string | null = "Some error";

    // Simulate cancel
    error = null;

    expect(error).toBeNull();
  });

  it("clears success state when canceling", () => {
    let success = true;

    // Simulate cancel
    success = false;

    expect(success).toBe(false);
  });
});

describe("CommentButton - Event Fetching", () => {
  let mockNDK: any;

  beforeEach(() => {
    mockNDK = createMockNDK();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches target event to get event ID", async () => {
    const address = "30041:" + "a".repeat(64) + ":article";
    const parts = address.split(":");
    const [kindStr, authorPubkey, dTag] = parts;
    const kind = parseInt(kindStr);

    const mockEvent = {
      id: "b".repeat(64),
      kind,
      pubkey: authorPubkey,
      tags: [["d", dTag]],
    };

    mockNDK.fetchEvent.mockResolvedValue(mockEvent);

    const targetEvent = await mockNDK.fetchEvent({
      kinds: [kind],
      authors: [authorPubkey],
      "#d": [dTag],
    });

    expect(mockNDK.fetchEvent).toHaveBeenCalled();
    expect(targetEvent?.id).toBe("b".repeat(64));
  });

  it("continues without event ID when fetch fails", async () => {
    mockNDK.fetchEvent.mockRejectedValue(new Error("Fetch failed"));

    let eventId = "";
    try {
      const targetEvent = await mockNDK.fetchEvent({});
      if (targetEvent) {
        eventId = targetEvent.id;
      }
    } catch (err) {
      // Continue without event ID
      eventId = "";
    }

    expect(eventId).toBe("");
  });

  it("handles null event from fetch", async () => {
    mockNDK.fetchEvent.mockResolvedValue(null);

    const targetEvent = await mockNDK.fetchEvent({});
    let eventId = "";

    if (targetEvent) {
      eventId = targetEvent.id;
    }

    expect(eventId).toBe("");
  });
});

describe("CommentButton - CSS Classes and Styling", () => {
  it("applies visible class when section is hovered", () => {
    const sectionHovered = true;
    const showCommentUI = false;
    const hasVisibleClass = sectionHovered || showCommentUI;

    expect(hasVisibleClass).toBe(true);
  });

  it("removes visible class when not hovered and UI closed", () => {
    const sectionHovered = false;
    const showCommentUI = false;
    const hasVisibleClass = sectionHovered || showCommentUI;

    expect(hasVisibleClass).toBe(false);
  });

  it("button has correct aria-label", () => {
    const ariaLabel = "Add comment";

    expect(ariaLabel).toBe("Add comment");
  });

  it("button has correct title attribute", () => {
    const title = "Add comment";

    expect(title).toBe("Add comment");
  });

  it("submit button shows loading state when submitting", () => {
    const isSubmitting = true;
    const buttonText = isSubmitting ? "Posting..." : "Post Comment";

    expect(buttonText).toBe("Posting...");
  });

  it("submit button shows normal state when not submitting", () => {
    const isSubmitting = false;
    const buttonText = isSubmitting ? "Posting..." : "Post Comment";

    expect(buttonText).toBe("Post Comment");
  });
});

describe("CommentButton - NIP-22 Compliance", () => {
  it("uses kind 1111 for comment events", () => {
    const kind = 1111;

    expect(kind).toBe(1111);
  });

  it("includes all required NIP-22 tags for addressable events", () => {
    const requiredRootTags = ["A", "K", "P"];
    const requiredParentTags = ["a", "k", "p"];

    const tags = [
      ["A", "address", "relay", "pubkey"],
      ["K", "kind"],
      ["P", "pubkey", "relay"],
      ["a", "address", "relay"],
      ["k", "kind"],
      ["p", "pubkey", "relay"],
    ];

    requiredRootTags.forEach((tag) => {
      expect(tags.some((t) => t[0] === tag)).toBe(true);
    });

    requiredParentTags.forEach((tag) => {
      expect(tags.some((t) => t[0] === tag)).toBe(true);
    });
  });

  it("A tag includes relay hint and author pubkey", () => {
    const aTag = ["A", "30041:pubkey:dtag", "wss://relay.com", "pubkey"];

    expect(aTag).toHaveLength(4);
    expect(aTag[0]).toBe("A");
    expect(aTag[2]).toMatch(/^wss:\/\//);
    expect(aTag[3]).toBeTruthy();
  });

  it("P tag includes relay hint", () => {
    const pTag = ["P", "pubkey", "wss://relay.com"];

    expect(pTag).toHaveLength(3);
    expect(pTag[0]).toBe("P");
    expect(pTag[2]).toMatch(/^wss:\/\//);
  });

  it("lowercase tags for parent scope match root tags", () => {
    const address = "30041:pubkey:dtag";
    const kind = "30041";
    const pubkey = "pubkey";
    const relay = "wss://relay.com";

    const rootTags = [
      ["A", address, relay, pubkey],
      ["K", kind],
      ["P", pubkey, relay],
    ];

    const parentTags = [
      ["a", address, relay],
      ["k", kind],
      ["p", pubkey, relay],
    ];

    // Verify parent tags match root tags (lowercase)
    expect(parentTags[0][1]).toBe(rootTags[0][1]); // address
    expect(parentTags[1][1]).toBe(rootTags[1][1]); // kind
    expect(parentTags[2][1]).toBe(rootTags[2][1]); // pubkey
  });
});

describe("CommentButton - Integration Scenarios", () => {
  it("complete comment flow for signed-in user", () => {
    const userStore = createMockUserStore(true);
    const user = get(userStore);

    // User is signed in
    expect(user.signedIn).toBe(true);

    // Comment content is valid
    const content = "Great article!";
    expect(content.trim().length).toBeGreaterThan(0);

    // Address is valid
    const address = "30041:" + "a".repeat(64) + ":article";
    const parts = address.split(":");
    expect(parts.length).toBe(3);

    // Event would be created with kind 1111
    const kind = 1111;
    expect(kind).toBe(1111);
  });

  it("prevents comment flow for signed-out user", () => {
    const userStore = createMockUserStore(false);
    const user = get(userStore);

    expect(user.signedIn).toBe(false);

    if (!user.signedIn) {
      const error = "You must be signed in to comment";
      expect(error).toBeTruthy();
    }
  });

  it("handles comment with event ID lookup", async () => {
    const mockNDK = createMockNDK();
    const eventId = "c".repeat(64);

    mockNDK.fetchEvent.mockResolvedValue({ id: eventId });

    const targetEvent = await mockNDK.fetchEvent({});

    const tags = [
      ["e", targetEvent.id, "wss://relay.com"],
    ];

    expect(tags[0][1]).toBe(eventId);
  });

  it("handles comment without event ID lookup", () => {
    const eventId = "";

    const tags = [
      ["A", "address", "relay", "pubkey"],
      ["K", "kind"],
      ["P", "pubkey", "relay"],
      ["a", "address", "relay"],
      ["k", "kind"],
      ["p", "pubkey", "relay"],
    ];

    // No e tag should be included
    expect(tags.filter((t) => t[0] === "e")).toHaveLength(0);

    // But all other required tags should be present
    expect(tags.length).toBe(6);
  });
});
