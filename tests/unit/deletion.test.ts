import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canDeleteEvent,
  deleteEvent,
} from "../../src/lib/services/deletion.ts";
import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";

describe("Deletion Service", () => {
  let mockNdk: NDK;
  let mockEvent: NDKEvent;

  beforeEach(() => {
    // Create mock NDK instance
    mockNdk = {
      activeUser: {
        pubkey: "test-pubkey-123",
      },
      pool: {
        relays: new Map([
          ["wss://relay1.example.com", { url: "wss://relay1.example.com" }],
          ["wss://relay2.example.com", { url: "wss://relay2.example.com" }],
        ]),
      },
    } as unknown as NDK;

    // Create mock event
    mockEvent = {
      id: "event-id-123",
      kind: 30041,
      pubkey: "test-pubkey-123",
      tagAddress: () => "30041:test-pubkey-123:test-identifier",
    } as unknown as NDKEvent;
  });

  describe("canDeleteEvent", () => {
    it("should return true when user is the event author", () => {
      const result = canDeleteEvent(mockEvent, mockNdk);
      expect(result).toBe(true);
    });

    it("should return false when user is not the event author", () => {
      const differentUserEvent = {
        ...mockEvent,
        pubkey: "different-pubkey-456",
      } as unknown as NDKEvent;

      const result = canDeleteEvent(differentUserEvent, mockNdk);
      expect(result).toBe(false);
    });

    it("should return false when event is null", () => {
      const result = canDeleteEvent(null, mockNdk);
      expect(result).toBe(false);
    });

    it("should return false when ndk has no active user", () => {
      const ndkWithoutUser = {
        ...mockNdk,
        activeUser: undefined,
      } as unknown as NDK;

      const result = canDeleteEvent(mockEvent, ndkWithoutUser);
      expect(result).toBe(false);
    });
  });

  describe("deleteEvent", () => {
    it("should return error when no eventId or eventAddress provided", async () => {
      const result = await deleteEvent({}, mockNdk);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Either eventId or eventAddress must be provided",
      );
    });

    it("should return error when user is not logged in", async () => {
      const ndkWithoutUser = {
        ...mockNdk,
        activeUser: undefined,
      } as unknown as NDK;

      const result = await deleteEvent(
        { eventId: "test-id" },
        ndkWithoutUser,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Please log in first");
    });

    it("should create deletion event with correct tags", async () => {
      const mockSign = vi.fn();
      const mockPublish = vi.fn().mockResolvedValue(
        new Set(["wss://relay1.example.com"]),
      );

      // Mock NDKEvent constructor
      const MockNDKEvent = vi.fn().mockImplementation(function (this: any) {
        this.kind = 0;
        this.created_at = 0;
        this.tags = [];
        this.content = "";
        this.pubkey = "";
        this.sign = mockSign;
        this.publish = mockPublish;
        return this;
      });

      // Mock NDKRelaySet
      const mockRelaySet = {} as NDKRelaySet;
      vi.spyOn(NDKRelaySet, "fromRelayUrls").mockReturnValue(mockRelaySet);

      // Replace global NDKEvent temporarily
      const originalNDKEvent = (globalThis as any).NDKEvent;
      (global as any).NDKEvent = MockNDKEvent;

      const result = await deleteEvent(
        {
          eventId: "event-123",
          eventAddress: "30041:pubkey:identifier",
          eventKind: 30041,
          reason: "Test deletion",
        },
        mockNdk,
      );

      // Restore original
      (global as any).NDKEvent = originalNDKEvent;

      expect(MockNDKEvent).toHaveBeenCalled();
      expect(mockSign).toHaveBeenCalled();
      expect(mockPublish).toHaveBeenCalled();
    });
  });
});
