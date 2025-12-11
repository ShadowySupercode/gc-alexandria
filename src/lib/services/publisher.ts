import { getMimeTags } from "../utils/mime.ts";
import { metadataToTags } from "../utils/asciidoc_metadata.ts";
import { parseAsciiDocWithMetadata } from "../utils/asciidoc_parser.ts";
import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

export interface PublishResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface ProcessedPublishResults {
  successCount: number;
  total: number;
  errors: string[];
  successfulEvents: Array<{ eventId: string; title: string }>;
  failedEvents: Array<{ title: string; error: string; sectionIndex: number }>;
}

export interface PublishOptions {
  content: string;
  kind?: number;
  onSuccess?: (eventId: string) => void;
  onError?: (error: string) => void;
}

/**
 * Publishes AsciiDoc content as Nostr events
 * @param options - Publishing options
 * @returns Promise resolving to publish result
 */
export async function publishZettel(
  options: PublishOptions,
  ndk: NDK,
): Promise<PublishResult> {
  const { content, kind = 30041, onSuccess, onError } = options;

  if (!content.trim()) {
    const error = "Please enter some content";
    onError?.(error);
    return { success: false, error };
  }

  if (!ndk?.activeUser) {
    const error = "Please log in first";
    onError?.(error);
    return { success: false, error };
  }

  try {
    // Parse content into sections using the standardized parser
    const parsed = parseAsciiDocWithMetadata(content);

    if (parsed.sections.length === 0) {
      throw new Error("No valid sections found in content");
    }

    // For now, publish only the first section
    const firstSection = parsed.sections[0];
    const title = firstSection.title;
    const cleanContent = firstSection.content;
    const sectionTags = metadataToTags(firstSection.metadata);

    // Generate d-tag and create event
    const dTag = generateDTag(title);
    const [mTag, MTag] = getMimeTags(kind);

    const tags: string[][] = [["d", dTag], mTag, MTag, ["title", title]];
    if (sectionTags) {
      tags.push(...sectionTags);
    }

    // Create and sign NDK event
    const ndkEvent = new NDKEvent(ndk);
    ndkEvent.kind = kind;
    ndkEvent.created_at = Math.floor(Date.now() / 1000);
    ndkEvent.tags = tags;
    ndkEvent.content = cleanContent;
    ndkEvent.pubkey = ndk.activeUser.pubkey;

    await ndkEvent.sign();

    // Publish to relays
    const allRelayUrls = Array.from(ndk.pool?.relays.values() || []).map(
      (r) => r.url,
    );

    if (allRelayUrls.length === 0) {
      throw new Error("No relays available in NDK pool");
    }

    const relaySet = NDKRelaySet.fromRelayUrls(allRelayUrls, ndk);
    const publishedToRelays = await ndkEvent.publish(relaySet);

    if (publishedToRelays.size > 0) {
      const result = { success: true, eventId: ndkEvent.id };
      onSuccess?.(ndkEvent.id);
      return result;
    } else {
      // Try fallback publishing logic here...
      throw new Error("Failed to publish to any relays");
    }
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";
    onError?.(errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Publishes a single Nostr event directly
 * @param options - Publishing options for a single event
 * @returns Promise resolving to publish result
 */
export async function publishSingleEvent(
  options: {
    content: string;
    kind: number;
    tags: string[][];
    onError?: (error: string) => void;
  },
  ndk: NDK,
): Promise<PublishResult> {
  const { content, kind, tags, onError } = options;

  // Mock publishing mode for testing UI
  if (import.meta.env.VITE_MOCK_PUBLISH === "true") {
    console.log("[MOCK PUBLISH] Simulating event publish:", {
      kind,
      titleTag: tags.find((t) => t[0] === "title")?.[1],
      dTag: tags.find((t) => t[0] === "d")?.[1],
    });
    // Simulate network delay
    await new Promise((resolve) =>
      setTimeout(resolve, 300 + Math.random() * 200)
    );
    // Generate a fake event ID
    const fakeEventId = Array.from(
      { length: 64 },
      () => Math.floor(Math.random() * 16).toString(16),
    ).join("");
    return { success: true, eventId: fakeEventId };
  }

  if (!ndk?.activeUser) {
    const error = "Please log in first";
    onError?.(error);
    return { success: false, error };
  }

  try {
    const allRelayUrls = Array.from(ndk.pool?.relays.values() || []).map(
      (r) => r.url,
    );
    if (allRelayUrls.length === 0) {
      throw new Error("No relays available in NDK pool");
    }
    const relaySet = NDKRelaySet.fromRelayUrls(allRelayUrls, ndk);

    // Fix a-tags that have placeholder "pubkey" with actual pubkey
    const fixedTags = tags.map((tag) => {
      if (
        tag[0] === "a" &&
        tag[1] &&
        tag[1].includes(":pubkey:") &&
        ndk.activeUser
      ) {
        // Replace "pubkey" placeholder with actual pubkey
        const fixedATag = tag[1].replace(
          ":pubkey:",
          `:${ndk.activeUser.pubkey}:`,
        );
        return [tag[0], fixedATag, tag[2] || "", tag[3] || ""];
      }
      return tag;
    });

    // Auto-add author identity if not publishing on behalf of others
    const hasAuthorTag = fixedTags.some((tag) => tag[0] === "author");
    const hasPTag = fixedTags.some((tag) => tag[0] === "p");

    const finalTags = [...fixedTags];

    if (!hasAuthorTag && ndk.activeUser) {
      // Add display name as author
      const displayName = ndk.activeUser.profile?.displayName ||
        ndk.activeUser.profile?.name ||
        "Anonymous";
      finalTags.push(["author", displayName]);
    }

    if (!hasPTag && ndk.activeUser) {
      // Add pubkey as p-tag
      finalTags.push(["p", ndk.activeUser.pubkey]);
    }

    // Create and sign NDK event
    const ndkEvent = new NDKEvent(ndk);
    ndkEvent.kind = kind;
    ndkEvent.created_at = Math.floor(Date.now() / 1000);
    ndkEvent.tags = finalTags;
    ndkEvent.content = content;
    ndkEvent.pubkey = ndk.activeUser.pubkey;

    await ndkEvent.sign();

    // Publish to relays
    const publishedToRelays = await ndkEvent.publish(relaySet);

    if (publishedToRelays.size > 0) {
      return { success: true, eventId: ndkEvent.id };
    } else {
      throw new Error("Failed to publish to any relays");
    }
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";
    console.error(`Error publishing event: ${errorMessage}`);
    onError?.(errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Publishes all AsciiDoc sections as separate Nostr events
 * @param options - Publishing options
 * @returns Promise resolving to array of publish results
 */
export async function publishMultipleZettels(
  options: PublishOptions,
  ndk: NDK,
): Promise<PublishResult[]> {
  const { content, kind = 30041, onError } = options;

  if (!content.trim()) {
    const error = "Please enter some content";
    onError?.(error);
    return [{ success: false, error }];
  }

  if (!ndk?.activeUser) {
    const error = "Please log in first";
    onError?.(error);
    return [{ success: false, error }];
  }

  try {
    const parsed = parseAsciiDocWithMetadata(content);
    if (parsed.sections.length === 0) {
      throw new Error("No valid sections found in content");
    }

    const allRelayUrls = Array.from(ndk.pool?.relays.values() || []).map(
      (r) => r.url,
    );
    if (allRelayUrls.length === 0) {
      throw new Error("No relays available in NDK pool");
    }
    const relaySet = NDKRelaySet.fromRelayUrls(allRelayUrls, ndk);

    const results: PublishResult[] = [];
    const publishedEvents: NDKEvent[] = [];
    for (const section of parsed.sections) {
      const title = section.title;
      const cleanContent = section.content;
      const sectionTags = metadataToTags(section.metadata);
      const dTag = generateDTag(title);
      const [mTag, MTag] = getMimeTags(kind);
      const tags: string[][] = [["d", dTag], mTag, MTag, ["title", title]];
      if (sectionTags) {
        tags.push(...sectionTags);
      }
      const ndkEvent = new NDKEvent(ndk);
      ndkEvent.kind = kind;
      ndkEvent.created_at = Math.floor(Date.now() / 1000);
      ndkEvent.tags = tags;
      ndkEvent.content = cleanContent;
      ndkEvent.pubkey = ndk.activeUser.pubkey;
      try {
        await ndkEvent.sign();
        const publishedToRelays = await ndkEvent.publish(relaySet);
        if (publishedToRelays.size > 0) {
          results.push({ success: true, eventId: ndkEvent.id });
          publishedEvents.push(ndkEvent);
        } else {
          results.push({
            success: false,
            error: "Failed to publish to any relays",
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error
          ? err.message
          : "Unknown error";
        results.push({ success: false, error: errorMessage });
      }
    }
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";
    onError?.(errorMessage);
    return [{ success: false, error: errorMessage }];
  }
}

/**
 * Processes publish results and extracts success/failure information
 * @param results - Array of publish results
 * @param events - Event objects containing content and metadata
 * @param hasIndexEvent - Whether the events include an index event
 * @returns Processed results with counts and event details
 */
export function processPublishResults(
  results: PublishResult[],
  events: { indexEvent?: any; contentEvents: any[] },
  hasIndexEvent: boolean = false,
): ProcessedPublishResults {
  const successCount = results.filter((r) => r.success).length;
  const errors = results
    .filter((r) => !r.success && r.error)
    .map((r) => r.error!);

  // Extract successful events with their titles
  const successfulEvents = results
    .filter((r) => r.success && r.eventId)
    .map((r, index) => {
      let title: string;

      if (index === 0 && hasIndexEvent && events.indexEvent) {
        title = "Article Index";
      } else {
        const contentIndex = hasIndexEvent ? index - 1 : index;
        const contentEvent = events.contentEvents[contentIndex];
        title = contentEvent?.title ||
          contentEvent?.tags?.find((t: any) => t[0] === "title")?.[1] ||
          `Note ${contentIndex + 1}`;
      }

      return {
        eventId: r.eventId!,
        title,
      };
    });

  // Extract failed events with their titles and errors
  const failedEvents = results
    .map((r, index) => ({ result: r, index }))
    .filter(({ result }) => !result.success)
    .map(({ result, index }) => {
      let title: string;

      if (index === 0 && hasIndexEvent && events.indexEvent) {
        title = "Article Index";
      } else {
        const contentIndex = hasIndexEvent ? index - 1 : index;
        const contentEvent = events.contentEvents[contentIndex];
        title = contentEvent?.title ||
          contentEvent?.tags?.find((t: any) => t[0] === "title")?.[1] ||
          `Note ${contentIndex + 1}`;
      }

      return {
        title,
        error: result.error || "Unknown error",
        sectionIndex: index,
      };
    });

  return {
    successCount,
    total: results.length,
    errors,
    successfulEvents,
    failedEvents,
  };
}

function generateDTag(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}
