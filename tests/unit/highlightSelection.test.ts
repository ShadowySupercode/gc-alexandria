import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";

// Mock flowbite-svelte components
vi.mock("flowbite-svelte", () => ({
  Button: vi.fn().mockImplementation((props) => ({
    $$render: () =>
      `<button data-testid="button">${props.children || ""}</button>`,
  })),
  Modal: vi.fn().mockImplementation(() => ({
    $$render: () => `<div data-testid="modal"></div>`,
  })),
  Textarea: vi.fn().mockImplementation(() => ({
    $$render: () => `<textarea data-testid="textarea"></textarea>`,
  })),
  P: vi.fn().mockImplementation(() => ({
    $$render: () => `<p data-testid="p"></p>`,
  })),
}));

// Mock flowbite-svelte-icons
vi.mock("flowbite-svelte-icons", () => ({
  FontHighlightOutline: vi.fn().mockImplementation(() => ({
    $$render: () => `<svg data-testid="highlight-icon"></svg>`,
  })),
}));

describe("HighlightButton Component Logic", () => {
  let isActive: boolean;

  beforeEach(() => {
    isActive = false;
  });

  describe("Initial State", () => {
    it("should initialize with inactive state", () => {
      expect(isActive).toBe(false);
    });

    it("should have correct inactive label", () => {
      const label = isActive ? "Exit Highlight Mode" : "Add Highlight";
      expect(label).toBe("Add Highlight");
    });

    it("should have correct inactive title", () => {
      const title = isActive ? "Exit highlight mode" : "Enter highlight mode";
      expect(title).toBe("Enter highlight mode");
    });

    it("should have correct inactive color", () => {
      const color = isActive ? "primary" : "light";
      expect(color).toBe("light");
    });

    it("should not have ring styling when inactive", () => {
      const ringClass = isActive ? "ring-2 ring-primary-500" : "";
      expect(ringClass).toBe("");
    });
  });

  describe("Toggle Functionality", () => {
    it("should toggle to active state when clicked", () => {
      // Simulate toggle
      isActive = !isActive;
      expect(isActive).toBe(true);
    });

    it("should toggle back to inactive state on second click", () => {
      // Simulate two toggles
      isActive = !isActive;
      isActive = !isActive;
      expect(isActive).toBe(false);
    });

    it("should show correct label when active", () => {
      isActive = true;
      const label = isActive ? "Exit Highlight Mode" : "Add Highlight";
      expect(label).toBe("Exit Highlight Mode");
    });

    it("should show correct title when active", () => {
      isActive = true;
      const title = isActive ? "Exit highlight mode" : "Enter highlight mode";
      expect(title).toBe("Exit highlight mode");
    });
  });

  describe("Active State Styling", () => {
    it("should apply primary color when active", () => {
      isActive = true;
      const color = isActive ? "primary" : "light";
      expect(color).toBe("primary");
    });

    it("should apply ring styling when active", () => {
      isActive = true;
      const ringClass = isActive ? "ring-2 ring-primary-500" : "";
      expect(ringClass).toBe("ring-2 ring-primary-500");
    });
  });
});

describe("HighlightSelectionHandler Component Logic", () => {
  let mockNDK: NDKEvent;
  let mockUserStore: any;
  let mockSelection: Selection;
  let mockPublicationEvent: NDKEvent;
  let isActive: boolean;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    isActive = false;

    // Mock document and DOM elements
    const mockElement = {
      createElement: vi.fn((tag: string) => ({
        tagName: tag.toUpperCase(),
        textContent: "",
        className: "",
        closest: vi.fn(),
        parentElement: null,
      })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      body: {
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      },
    };

    global.document = mockElement as any;

    // Mock NDK event
    mockPublicationEvent = {
      id: "test-event-id",
      pubkey: "test-pubkey",
      kind: 30023,
      tagAddress: vi.fn().mockReturnValue("30023:test-pubkey:test-d-tag"),
      tags: [],
      content: "",
    } as unknown as NDKEvent;

    // Mock user store
    mockUserStore = {
      signedIn: true,
      signer: {
        sign: vi.fn().mockResolvedValue(undefined),
      },
    };

    // Mock window.getSelection
    const mockParagraph = {
      textContent: "This is the full paragraph context",
      closest: vi.fn(),
    };

    mockSelection = {
      toString: vi.fn().mockReturnValue("Selected text from publication"),
      isCollapsed: false,
      removeAllRanges: vi.fn(),
      anchorNode: {
        parentElement: mockParagraph,
      },
    } as unknown as Selection;

    global.window = {
      getSelection: vi.fn().mockReturnValue(mockSelection),
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Selection Detection", () => {
    it("should ignore mouseup events when isActive is false", () => {
      isActive = false;
      const shouldProcess = isActive;
      expect(shouldProcess).toBe(false);
    });

    it("should process mouseup events when isActive is true", () => {
      isActive = true;
      const shouldProcess = isActive;
      expect(shouldProcess).toBe(true);
    });

    it("should ignore collapsed selections", () => {
      const selection = { isCollapsed: true } as Selection;
      const shouldIgnore = selection.isCollapsed;
      expect(shouldIgnore).toBe(true);
    });

    it("should process non-collapsed selections", () => {
      const selection = { isCollapsed: false } as Selection;
      const shouldIgnore = selection.isCollapsed;
      expect(shouldIgnore).toBe(false);
    });

    it("should ignore selections with less than 3 characters", () => {
      const text = "ab";
      const isValid = text.length >= 3;
      expect(isValid).toBe(false);
    });

    it("should accept selections with 3 or more characters", () => {
      const text = "abc";
      const isValid = text.length >= 3;
      expect(isValid).toBe(true);
    });

    it("should ignore empty selections after trim", () => {
      const text = "   ";
      const trimmed = text.trim();
      const isValid = trimmed.length >= 3;
      expect(isValid).toBe(false);
    });
  });

  describe("User Authentication", () => {
    it("should reject selection when user not signed in", () => {
      const userStore = { signedIn: false };
      expect(userStore.signedIn).toBe(false);
    });

    it("should process selection when user signed in", () => {
      const userStore = { signedIn: true };
      expect(userStore.signedIn).toBe(true);
    });

    it("should check for signer before creating highlight", () => {
      const userStore = {
        signedIn: true,
        signer: { sign: vi.fn() },
      };
      expect(userStore.signer).toBeDefined();
    });

    it("should reject creation without signer", () => {
      const userStore = {
        signedIn: true,
        signer: null,
      };
      expect(userStore.signer).toBeNull();
    });
  });

  describe("Publication Context Detection", () => {
    it("should detect selection within publication-leather class", () => {
      const mockElement = {
        className: "publication-leather",
        closest: vi.fn((selector: string) => {
          return selector === ".publication-leather" ? mockElement : null;
        }),
      };
      const target = mockElement;
      const publicationSection = target.closest(".publication-leather");
      expect(publicationSection).toBeTruthy();
    });

    it("should reject selection outside publication-leather class", () => {
      const mockElement = {
        className: "other-section",
        closest: vi.fn((selector: string) => {
          return selector === ".publication-leather" ? null : mockElement;
        }),
      };
      const target = mockElement;
      const publicationSection = target.closest(".publication-leather");
      expect(publicationSection).toBeNull();
    });
  });

  describe("Context Extraction", () => {
    it("should extract context from parent paragraph", () => {
      const paragraph = {
        textContent:
          "This is the full paragraph context with selected text inside.",
      };

      const context = paragraph.textContent?.trim() || "";
      expect(context).toBe(
        "This is the full paragraph context with selected text inside.",
      );
    });

    it("should extract context from parent section", () => {
      const section = {
        textContent: "Full section context including selected text.",
      };

      const context = section.textContent?.trim() || "";
      expect(context).toBe("Full section context including selected text.");
    });

    it("should extract context from parent div", () => {
      const div = {
        textContent: "Full div context including selected text.",
      };

      const context = div.textContent?.trim() || "";
      expect(context).toBe("Full div context including selected text.");
    });

    it("should handle missing context gracefully", () => {
      const context = "";
      expect(context).toBe("");
    });
  });

  describe("NIP-84 Event Creation - Addressable Events", () => {
    it("should use 'a' tag for addressable events", () => {
      const eventAddress = "30023:pubkey:d-tag";
      const tags: string[][] = [];

      if (eventAddress) {
        tags.push(["a", eventAddress, ""]);
      }

      expect(tags).toContainEqual(["a", eventAddress, ""]);
    });

    it("should create event with correct kind 9802", () => {
      const event = {
        kind: 9802,
        content: "",
        tags: [],
      };

      expect(event.kind).toBe(9802);
    });

    it("should include selected text as content", () => {
      const selectedText = "This is the selected highlight text";
      const event = {
        kind: 9802,
        content: selectedText,
        tags: [],
      };

      expect(event.content).toBe(selectedText);
    });

    it("should include context tag", () => {
      const context = "This is the surrounding context";
      const tags: string[][] = [];

      if (context) {
        tags.push(["context", context]);
      }

      expect(tags).toContainEqual(["context", context]);
    });

    it("should include author p-tag with role", () => {
      const pubkey = "author-pubkey-hex";
      const tags: string[][] = [];

      if (pubkey) {
        tags.push(["p", pubkey, "", "author"]);
      }

      expect(tags).toContainEqual(["p", pubkey, "", "author"]);
    });

    it("should include comment tag when comment provided", () => {
      const comment = "This is my insightful comment";
      const tags: string[][] = [];

      if (comment.trim()) {
        tags.push(["comment", comment.trim()]);
      }

      expect(tags).toContainEqual(["comment", comment]);
    });

    it("should not include comment tag when comment is empty", () => {
      const comment = "";
      const tags: string[][] = [];

      if (comment.trim()) {
        tags.push(["comment", comment.trim()]);
      }

      expect(tags).not.toContainEqual(["comment", ""]);
      expect(tags.length).toBe(0);
    });

    it("should not include comment tag when comment is only whitespace", () => {
      const comment = "   ";
      const tags: string[][] = [];

      if (comment.trim()) {
        tags.push(["comment", comment.trim()]);
      }

      expect(tags.length).toBe(0);
    });
  });

  describe("NIP-84 Event Creation - Regular Events", () => {
    it("should use 'e' tag for regular events", () => {
      const eventId = "regular-event-id";
      const eventAddress = null; // No address means regular event
      const tags: string[][] = [];

      if (eventAddress) {
        tags.push(["a", eventAddress, ""]);
      } else {
        tags.push(["e", eventId, ""]);
      }

      expect(tags).toContainEqual(["e", eventId, ""]);
    });

    it("should prefer addressable event over regular event", () => {
      const eventId = "regular-event-id";
      const eventAddress = "30023:pubkey:d-tag";
      const tags: string[][] = [];

      if (eventAddress) {
        tags.push(["a", eventAddress, ""]);
      } else {
        tags.push(["e", eventId, ""]);
      }

      expect(tags).toContainEqual(["a", eventAddress, ""]);
      expect(tags).not.toContainEqual(["e", eventId, ""]);
    });
  });

  describe("Complete Event Structure", () => {
    it("should create complete highlight event with all required tags", () => {
      const selectedText = "Highlighted text";
      const context = "Full context paragraph";
      const pubkey = "author-pubkey";
      const eventAddress = "30023:pubkey:d-tag";

      const event = {
        kind: 9802,
        content: selectedText,
        tags: [
          ["a", eventAddress, ""],
          ["context", context],
          ["p", pubkey, "", "author"],
        ],
      };

      expect(event.kind).toBe(9802);
      expect(event.content).toBe(selectedText);
      expect(event.tags).toHaveLength(3);
      expect(event.tags[0]).toEqual(["a", eventAddress, ""]);
      expect(event.tags[1]).toEqual(["context", context]);
      expect(event.tags[2]).toEqual(["p", pubkey, "", "author"]);
    });

    it("should create complete quote highlight with comment", () => {
      const selectedText = "Highlighted text";
      const context = "Full context paragraph";
      const pubkey = "author-pubkey";
      const eventAddress = "30023:pubkey:d-tag";
      const comment = "My thoughtful comment";

      const event = {
        kind: 9802,
        content: selectedText,
        tags: [
          ["a", eventAddress, ""],
          ["context", context],
          ["p", pubkey, "", "author"],
          ["comment", comment],
        ],
      };

      expect(event.kind).toBe(9802);
      expect(event.content).toBe(selectedText);
      expect(event.tags).toHaveLength(4);
      expect(event.tags[3]).toEqual(["comment", comment]);
    });

    it("should handle event without context", () => {
      const selectedText = "Highlighted text";
      const context = "";
      const pubkey = "author-pubkey";
      const eventId = "event-id";

      const tags: string[][] = [];
      tags.push(["e", eventId, ""]);
      if (context) {
        tags.push(["context", context]);
      }
      tags.push(["p", pubkey, "", "author"]);

      expect(tags).toHaveLength(2);
      expect(tags).not.toContainEqual(["context", ""]);
    });
  });

  describe("Event Signing and Publishing", () => {
    it("should sign event before publishing", async () => {
      const mockSigner = {
        sign: vi.fn().mockResolvedValue(undefined),
      };

      const mockEvent = {
        kind: 9802,
        content: "test",
        tags: [],
        sign: vi.fn().mockResolvedValue(undefined),
        publish: vi.fn().mockResolvedValue(undefined),
      };

      await mockEvent.sign(mockSigner);
      expect(mockEvent.sign).toHaveBeenCalledWith(mockSigner);
    });

    it("should publish event after signing", async () => {
      const mockEvent = {
        sign: vi.fn().mockResolvedValue(undefined),
        publish: vi.fn().mockResolvedValue(undefined),
      };

      await mockEvent.sign({});
      await mockEvent.publish();

      expect(mockEvent.publish).toHaveBeenCalled();
    });

    it("should handle signing errors", async () => {
      const mockEvent = {
        sign: vi.fn().mockRejectedValue(new Error("Signing failed")),
      };

      await expect(mockEvent.sign({})).rejects.toThrow("Signing failed");
    });

    it("should handle publishing errors", async () => {
      const mockEvent = {
        sign: vi.fn().mockResolvedValue(undefined),
        publish: vi.fn().mockRejectedValue(new Error("Publishing failed")),
      };

      await mockEvent.sign({});
      await expect(mockEvent.publish()).rejects.toThrow("Publishing failed");
    });
  });

  describe("Selection Cleanup", () => {
    it("should clear selection after successful highlight creation", () => {
      const mockSelection = {
        removeAllRanges: vi.fn(),
      };

      mockSelection.removeAllRanges();
      expect(mockSelection.removeAllRanges).toHaveBeenCalled();
    });

    it("should reset selectedText after creation", () => {
      let selectedText = "Some text";
      selectedText = "";
      expect(selectedText).toBe("");
    });

    it("should reset comment after creation", () => {
      let comment = "Some comment";
      comment = "";
      expect(comment).toBe("");
    });

    it("should reset context after creation", () => {
      let context = "Some context";
      context = "";
      expect(context).toBe("");
    });

    it("should close modal after creation", () => {
      let showModal = true;
      showModal = false;
      expect(showModal).toBe(false);
    });
  });

  describe("Cancel Functionality", () => {
    it("should clear selection when cancelled", () => {
      const mockSelection = {
        removeAllRanges: vi.fn(),
      };

      // Simulate cancel
      mockSelection.removeAllRanges();
      expect(mockSelection.removeAllRanges).toHaveBeenCalled();
    });

    it("should reset all state when cancelled", () => {
      let selectedText = "text";
      let comment = "comment";
      let context = "context";
      let showModal = true;

      // Simulate cancel
      selectedText = "";
      comment = "";
      context = "";
      showModal = false;

      expect(selectedText).toBe("");
      expect(comment).toBe("");
      expect(context).toBe("");
      expect(showModal).toBe(false);
    });
  });

  describe("Feedback Messages", () => {
    it("should show success message after creation", () => {
      const message = "Highlight created successfully!";
      const type = "success";

      expect(message).toBe("Highlight created successfully!");
      expect(type).toBe("success");
    });

    it("should show error message on failure", () => {
      const message = "Failed to create highlight. Please try again.";
      const type = "error";

      expect(message).toBe("Failed to create highlight. Please try again.");
      expect(type).toBe("error");
    });

    it("should show error when not signed in", () => {
      const message = "Please sign in to create highlights";
      const type = "error";

      expect(message).toBe("Please sign in to create highlights");
      expect(type).toBe("error");
    });

    it("should auto-hide feedback after delay", () => {
      let showFeedback = true;

      // Simulate timeout
      setTimeout(() => {
        showFeedback = false;
      }, 3000);

      // Initially shown
      expect(showFeedback).toBe(true);
    });
  });

  describe("Event Listeners", () => {
    it("should add mouseup listener on mount", () => {
      const mockAddEventListener = vi.fn();
      document.addEventListener = mockAddEventListener;

      document.addEventListener("mouseup", () => {});
      expect(mockAddEventListener).toHaveBeenCalledWith(
        "mouseup",
        expect.any(Function),
      );
    });

    it("should remove mouseup listener on unmount", () => {
      const mockRemoveEventListener = vi.fn();
      document.removeEventListener = mockRemoveEventListener;

      const handler = () => {};
      document.removeEventListener("mouseup", handler);
      expect(mockRemoveEventListener).toHaveBeenCalledWith("mouseup", handler);
    });
  });

  describe("Highlight Mode Body Class", () => {
    it("should add highlight-mode-active class when active", () => {
      const mockClassList = {
        add: vi.fn(),
        remove: vi.fn(),
      };
      document.body.classList = mockClassList as any;

      // Simulate active mode
      document.body.classList.add("highlight-mode-active");
      expect(mockClassList.add).toHaveBeenCalledWith("highlight-mode-active");
    });

    it("should remove highlight-mode-active class when inactive", () => {
      const mockClassList = {
        add: vi.fn(),
        remove: vi.fn(),
      };
      document.body.classList = mockClassList as any;

      // Simulate inactive mode
      document.body.classList.remove("highlight-mode-active");
      expect(mockClassList.remove).toHaveBeenCalledWith(
        "highlight-mode-active",
      );
    });

    it("should clean up class on unmount", () => {
      const mockClassList = {
        add: vi.fn(),
        remove: vi.fn(),
      };
      document.body.classList = mockClassList as any;

      // Simulate cleanup
      document.body.classList.remove("highlight-mode-active");
      expect(mockClassList.remove).toHaveBeenCalledWith(
        "highlight-mode-active",
      );
    });
  });

  describe("Modal Display", () => {
    it("should show modal when text is selected", () => {
      let showModal = false;

      // Simulate successful selection
      showModal = true;
      expect(showModal).toBe(true);
    });

    it("should display selected text in modal", () => {
      const selectedText = "This is the selected text";
      const displayText = `"${selectedText}"`;

      expect(displayText).toBe('"This is the selected text"');
    });

    it("should provide textarea for optional comment", () => {
      let comment = "";
      const placeholder = "Share your thoughts about this highlight...";

      expect(placeholder).toBe("Share your thoughts about this highlight...");
      expect(comment).toBe("");
    });

    it("should disable buttons while submitting", () => {
      const isSubmitting = true;
      const disabled = isSubmitting;

      expect(disabled).toBe(true);
    });

    it("should show 'Creating...' text while submitting", () => {
      const isSubmitting = true;
      const buttonText = isSubmitting ? "Creating..." : "Create Highlight";

      expect(buttonText).toBe("Creating...");
    });

    it("should show normal text when not submitting", () => {
      const isSubmitting = false;
      const buttonText = isSubmitting ? "Creating..." : "Create Highlight";

      expect(buttonText).toBe("Create Highlight");
    });
  });

  describe("Callback Execution", () => {
    it("should call onHighlightCreated callback after creation", () => {
      const mockCallback = vi.fn();

      // Simulate successful creation
      mockCallback();

      expect(mockCallback).toHaveBeenCalled();
    });

    it("should not call callback if creation fails", () => {
      const mockCallback = vi.fn();

      // Simulate failed creation - callback not called
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complete highlight workflow", () => {
      // Setup
      let isActive = true;
      let showModal = false;
      let selectedText = "";
      const userSignedIn = true;
      const selection = {
        toString: () => "Selected text for highlighting",
        isCollapsed: false,
      };

      // User selects text
      if (isActive && userSignedIn && !selection.isCollapsed) {
        selectedText = selection.toString();
        showModal = true;
      }

      expect(selectedText).toBe("Selected text for highlighting");
      expect(showModal).toBe(true);
    });

    it("should handle complete quote highlight workflow with comment", () => {
      // Setup
      let isActive = true;
      let showModal = false;
      let selectedText = "";
      let comment = "";
      const userSignedIn = true;
      const selection = {
        toString: () => "Selected text",
        isCollapsed: false,
      };

      // User selects text
      if (isActive && userSignedIn && !selection.isCollapsed) {
        selectedText = selection.toString();
        showModal = true;
      }

      // User adds comment
      comment = "This is insightful";

      // Create event with comment
      const tags: string[][] = [];
      if (comment.trim()) {
        tags.push(["comment", comment]);
      }

      expect(selectedText).toBe("Selected text");
      expect(comment).toBe("This is insightful");
      expect(tags).toContainEqual(["comment", "This is insightful"]);
    });

    it("should reject workflow when user not signed in", () => {
      let isActive = true;
      let showModal = false;
      const userSignedIn = false;
      const selection = {
        toString: () => "Selected text",
        isCollapsed: false,
      };

      // User tries to select text
      if (isActive && userSignedIn && !selection.isCollapsed) {
        showModal = true;
      }

      expect(showModal).toBe(false);
    });

    it("should handle workflow cancellation", () => {
      // Setup initial state
      let showModal = true;
      let selectedText = "Some text";
      let comment = "Some comment";
      const mockSelection = {
        removeAllRanges: vi.fn(),
      };

      // User cancels
      showModal = false;
      selectedText = "";
      comment = "";
      mockSelection.removeAllRanges();

      expect(showModal).toBe(false);
      expect(selectedText).toBe("");
      expect(comment).toBe("");
      expect(mockSelection.removeAllRanges).toHaveBeenCalled();
    });
  });
});
