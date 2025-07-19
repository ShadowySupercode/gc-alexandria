import { nip19 } from "nostr-tools";
import { getEventHash, signEvent, prefixNostrAddresses } from "./nostrUtils.ts";
import { get } from "svelte/store";
import { goto } from "$app/navigation";
import { EVENT_KINDS, TIME_CONSTANTS } from "./search_constants.ts";
import { ndkInstance } from "../ndk.ts";
import { NDKRelaySet, NDKEvent } from "@nostr-dev-kit/ndk";

export interface RootEventInfo {
  rootId: string;
  rootPubkey: string;
  rootRelay: string;
  rootKind: number;
  rootAddress: string;
  rootIValue: string;
  rootIRelay: string;
  isRootA: boolean;
  isRootI: boolean;
}

export interface ParentEventInfo {
  parentId: string;
  parentPubkey: string;
  parentRelay: string;
  parentKind: number;
  parentAddress: string;
}

export interface EventPublishResult {
  success: boolean;
  relay?: string;
  eventId?: string;
  error?: string;
}

/**
 * Helper function to find a tag by its first element
 */
function findTag(tags: string[][], tagName: string): string[] | undefined {
  return tags?.find((t: string[]) => t[0] === tagName);
}

/**
 * Helper function to get tag value safely
 */
function getTagValue(
  tags: string[][],
  tagName: string,
  index: number = 1,
): string {
  const tag = findTag(tags, tagName);
  return tag?.[index] || "";
}

/**
 * Helper function to create a tag array
 */
function createTag(name: string, ...values: (string | number)[]): string[] {
  return [name, ...values.map((v) => String(v))];
}

/**
 * Helper function to add tags to an array
 */
function addTags(tags: string[][], ...newTags: string[][]): void {
  tags.push(...newTags);
}

/**
 * Extract root event information from parent event tags
 */
export function extractRootEventInfo(parent: NDKEvent): RootEventInfo {
  const rootInfo: RootEventInfo = {
    rootId: parent.id,
    rootPubkey: getPubkeyString(parent.pubkey),
    rootRelay: getRelayString(parent.relay),
    rootKind: parent.kind || 1,
    rootAddress: "",
    rootIValue: "",
    rootIRelay: "",
    isRootA: false,
    isRootI: false,
  };

  if (!parent.tags) return rootInfo;

  const rootE = findTag(parent.tags, "E");
  const rootA = findTag(parent.tags, "A");
  const rootI = findTag(parent.tags, "I");

  rootInfo.isRootA = !!rootA;
  rootInfo.isRootI = !!rootI;

  if (rootE) {
    rootInfo.rootId = rootE[1];
    rootInfo.rootRelay = getRelayString(rootE[2]);
    rootInfo.rootPubkey = getPubkeyString(rootE[3] || rootInfo.rootPubkey);
    rootInfo.rootKind =
      Number(getTagValue(parent.tags, "K")) || rootInfo.rootKind;
  } else if (rootA) {
    rootInfo.rootAddress = rootA[1];
    rootInfo.rootRelay = getRelayString(rootA[2]);
    rootInfo.rootPubkey = getPubkeyString(
      getTagValue(parent.tags, "P") || rootInfo.rootPubkey,
    );
    rootInfo.rootKind =
      Number(getTagValue(parent.tags, "K")) || rootInfo.rootKind;
  } else if (rootI) {
    rootInfo.rootIValue = rootI[1];
    rootInfo.rootIRelay = getRelayString(rootI[2]);
    rootInfo.rootKind =
      Number(getTagValue(parent.tags, "K")) || rootInfo.rootKind;
  }

  return rootInfo;
}

/**
 * Extract parent event information
 */
export function extractParentEventInfo(parent: NDKEvent): ParentEventInfo {
  const dTag = getTagValue(parent.tags || [], "d");
  const parentAddress = dTag
    ? `${parent.kind}:${getPubkeyString(parent.pubkey)}:${dTag}`
    : "";

  return {
    parentId: parent.id,
    parentPubkey: getPubkeyString(parent.pubkey),
    parentRelay: getRelayString(parent.relay),
    parentKind: parent.kind || 1,
    parentAddress,
  };
}

/**
 * Build root scope tags for NIP-22 threading
 */
function buildRootScopeTags(
  rootInfo: RootEventInfo,
): string[][] {
  const tags: string[][] = [];

  if (rootInfo.rootAddress) {
    const tagType = rootInfo.isRootA ? "A" : rootInfo.isRootI ? "I" : "E";
    addTags(
      tags,
      createTag(
        tagType,
        rootInfo.rootAddress || rootInfo.rootId,
        rootInfo.rootRelay,
      ),
    );
  } else if (rootInfo.rootIValue) {
    addTags(tags, createTag("I", rootInfo.rootIValue, rootInfo.rootIRelay));
  } else {
    addTags(tags, createTag("E", rootInfo.rootId, rootInfo.rootRelay));
  }

  addTags(tags, createTag("K", rootInfo.rootKind));

  if (rootInfo.rootPubkey && !rootInfo.rootIValue) {
    addTags(tags, createTag("P", rootInfo.rootPubkey, rootInfo.rootRelay));
  }

  return tags;
}

/**
 * Build parent scope tags for NIP-22 threading
 */
function buildParentScopeTags(
  parent: NDKEvent,
  parentInfo: ParentEventInfo,
  rootInfo: RootEventInfo,
): string[][] {
  const tags: string[][] = [];

  if (parentInfo.parentAddress) {
    const tagType = rootInfo.isRootA ? "a" : rootInfo.isRootI ? "i" : "e";
    addTags(
      tags,
      createTag(tagType, parentInfo.parentAddress, parentInfo.parentRelay),
    );
  }

  addTags(
    tags,
    createTag("e", parent.id, parentInfo.parentRelay),
    createTag("k", parentInfo.parentKind),
    createTag("p", parentInfo.parentPubkey, parentInfo.parentRelay),
  );

  return tags;
}

/**
 * Build tags for a reply event based on parent and root information
 */
export function buildReplyTags(
  parent: NDKEvent,
  rootInfo: RootEventInfo,
  parentInfo: ParentEventInfo,
  kind: number,
): string[][] {
  const tags: string[][] = [];

  const isParentReplaceable =
    parentInfo.parentKind >= EVENT_KINDS.ADDRESSABLE.MIN &&
    parentInfo.parentKind < EVENT_KINDS.ADDRESSABLE.MAX;
  const isParentComment = parentInfo.parentKind === EVENT_KINDS.COMMENT;
  const isReplyToComment = isParentComment && rootInfo.rootId !== parent.id;

  if (kind === 1) {
    // Kind 1 replies use simple e/p tags
    addTags(
      tags,
      createTag("e", parent.id, parentInfo.parentRelay, "root"),
      createTag("p", parentInfo.parentPubkey),
    );

    // Add address for replaceable events
    if (isParentReplaceable) {
      const dTag = getTagValue(parent.tags || [], "d");
      if (dTag) {
        const parentAddress = `${parentInfo.parentKind}:${parentInfo.parentPubkey}:${dTag}`;
        addTags(tags, createTag("a", parentAddress, "", "root"));
      }
    }
  } else {
    // Kind 1111 (comment) uses NIP-22 threading format
    if (isParentReplaceable) {
      const dTag = getTagValue(parent.tags || [], "d");
      if (dTag) {
        const parentAddress = `${parentInfo.parentKind}:${parentInfo.parentPubkey}:${dTag}`;

        if (isReplyToComment) {
          // Root scope (uppercase) - use the original article
          addTags(
            tags,
            createTag("A", parentAddress, parentInfo.parentRelay),
            createTag("K", rootInfo.rootKind),
            createTag("P", rootInfo.rootPubkey, rootInfo.rootRelay),
          );
          // Parent scope (lowercase) - the comment we're replying to
          addTags(
            tags,
            createTag("e", parent.id, parentInfo.parentRelay),
            createTag("k", parentInfo.parentKind),
            createTag("p", parentInfo.parentPubkey, parentInfo.parentRelay),
          );
        } else {
          // Top-level comment - root and parent are the same
          addTags(
            tags,
            createTag("A", parentAddress, parentInfo.parentRelay),
            createTag("K", rootInfo.rootKind),
            createTag("P", rootInfo.rootPubkey, rootInfo.rootRelay),
            createTag("a", parentAddress, parentInfo.parentRelay),
            createTag("e", parent.id, parentInfo.parentRelay),
            createTag("k", parentInfo.parentKind),
            createTag("p", parentInfo.parentPubkey, parentInfo.parentRelay),
          );
        }
      } else {
        // Fallback to E/e tags if no d-tag found
        if (isReplyToComment) {
          addTags(
            tags,
            createTag("E", rootInfo.rootId, rootInfo.rootRelay),
            createTag("K", rootInfo.rootKind),
            createTag("P", rootInfo.rootPubkey, rootInfo.rootRelay),
            createTag("e", parent.id, parentInfo.parentRelay),
            createTag("k", parentInfo.parentKind),
            createTag("p", parentInfo.parentPubkey, parentInfo.parentRelay),
          );
        } else {
          addTags(
            tags,
            createTag("E", parent.id, rootInfo.rootRelay),
            createTag("K", rootInfo.rootKind),
            createTag("P", rootInfo.rootPubkey, rootInfo.rootRelay),
            createTag("e", parent.id, parentInfo.parentRelay),
            createTag("k", parentInfo.parentKind),
            createTag("p", parentInfo.parentPubkey, parentInfo.parentRelay),
          );
        }
      }
    } else {
      // For regular events, use E/e tags
      if (isReplyToComment) {
        // Reply to a comment - distinguish root from parent
        addTags(tags, ...buildRootScopeTags(rootInfo));
        addTags(
          tags,
          createTag("e", parent.id, parentInfo.parentRelay),
          createTag("k", parentInfo.parentKind),
          createTag("p", parentInfo.parentPubkey, parentInfo.parentRelay),
        );
      } else {
        // Top-level comment or regular event
        addTags(tags, ...buildRootScopeTags(rootInfo));
        addTags(tags, ...buildParentScopeTags(parent, parentInfo, rootInfo));
      }
    }
  }

  return tags;
}

/**
 * Create and sign a Nostr event
 */
export async function createSignedEvent(
  content: string,
  pubkey: string,
  kind: number,
  tags: string[][],
// deno-lint-ignore no-explicit-any
): Promise<{ id: string; sig: string; event: any }> {
  const prefixedContent = prefixNostrAddresses(content);

  const eventToSign = {
    kind: Number(kind),
    created_at: Number(
      Math.floor(Date.now() / TIME_CONSTANTS.UNIX_TIMESTAMP_FACTOR),
    ),
    tags: tags.map((tag) => [
      String(tag[0]),
      String(tag[1]),
      String(tag[2] || ""),
      String(tag[3] || ""),
    ]),
    content: String(prefixedContent),
    pubkey: pubkey,
  };

  let sig, id;
  if (typeof window !== "undefined" && globalThis.nostr && globalThis.nostr.signEvent) {
    const signed = await globalThis.nostr.signEvent(eventToSign);
    sig = signed.sig as string;
    id = "id" in signed ? (signed.id as string) : getEventHash(eventToSign);
  } else {
    id = getEventHash(eventToSign);
    sig = await signEvent(eventToSign);
  }

  return {
    id,
    sig,
    event: {
      ...eventToSign,
      id,
      sig,
    },
  };
}

/**
 * Publishes an event to relays using the new relay management system
 * @param event The event to publish (can be NDKEvent or plain event object)
 * @param relayUrls Array of relay URLs to publish to
 * @returns Promise that resolves to array of successful relay URLs
 */
export async function publishEvent(
  event: NDKEvent,
  relayUrls: string[],
): Promise<string[]> {
  const successfulRelays: string[] = [];
  const ndk = get(ndkInstance);

  if (!ndk) {
    throw new Error("NDK instance not available");
  }

  // Create relay set from URLs
  const relaySet = NDKRelaySet.fromRelayUrls(relayUrls, ndk);

  try {
    // If event is a plain object, create an NDKEvent from it
    let ndkEvent: NDKEvent;
    if (event.publish && typeof event.publish === 'function') {
      // It's already an NDKEvent
      ndkEvent = event;
    } else {
      // It's a plain event object, create NDKEvent
      ndkEvent = new NDKEvent(ndk, event);
    }

    // Publish with timeout
    await ndkEvent.publish(relaySet).withTimeout(5000);
    
    // For now, assume all relays were successful
    // In a more sophisticated implementation, you'd track individual relay responses
    successfulRelays.push(...relayUrls);
    
    console.debug("[nostrEventService] Published event successfully:", {
      eventId: ndkEvent.id,
      relayCount: relayUrls.length,
      successfulRelays
    });
  } catch (error) {
    console.error("[nostrEventService] Failed to publish event:", error);
    throw new Error(`Failed to publish event: ${error}`);
  }

  return successfulRelays;
}

/**
 * Navigate to the published event
 */
export function navigateToEvent(eventId: string): void {
  try {
    // Validate that eventId is a valid hex string
    if (!/^[0-9a-fA-F]{64}$/.test(eventId)) {
      console.warn("Invalid event ID format:", eventId);
      return;
    }

    const nevent = nip19.neventEncode({ id: eventId });
    goto(`/events?id=${nevent}`);
  } catch (error) {
    console.error("Failed to encode event ID for navigation:", eventId, error);
  }
}

// Helper functions to ensure relay and pubkey are always strings
// deno-lint-ignore no-explicit-any
function getRelayString(relay: any): string {
  if (!relay) return "";
  if (typeof relay === "string") return relay;
  if (typeof relay.url === "string") return relay.url;
  return "";
}

// deno-lint-ignore no-explicit-any
function getPubkeyString(pubkey: any): string {
  if (!pubkey) return "";
  if (typeof pubkey === "string") return pubkey;
  if (typeof pubkey.hex === "function") return pubkey.hex();
  if (typeof pubkey.pubkey === "string") return pubkey.pubkey;
  return "";
}
