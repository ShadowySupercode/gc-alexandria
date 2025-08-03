import { get } from "svelte/store";
import { ndkInstance } from "../ndk.ts";
import { getMimeTags } from "../utils/mime.ts";
import { parseAsciiDocWithMetadata, metadataToTags } from "../utils/asciidoc_metadata.ts";
import { NDKRelaySet, NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

export interface PublishResult {
  success: boolean;
  eventId?: string;
  error?: string;
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
): Promise<PublishResult> {
  const { content, kind = 30041, onSuccess, onError } = options;

  if (!content.trim()) {
    const error = "Please enter some content";
    onError?.(error);
    return { success: false, error };
  }

  // Get the current NDK instance from the store
  const ndk = get(ndkInstance);

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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
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
): Promise<PublishResult[]> {
  const { content, kind = 30041, onError } = options;

  if (!content.trim()) {
    const error = 'Please enter some content';
    onError?.(error);
    return [{ success: false, error }];
  }

  const ndk = get(ndkInstance);
  if (!ndk?.activeUser) {
    const error = 'Please log in first';
    onError?.(error);
    return [{ success: false, error }];
  }

  try {
    const parsed = parseAsciiDocWithMetadata(content);
    if (parsed.sections.length === 0) {
      throw new Error('No valid sections found in content');
    }

    const allRelayUrls = Array.from(ndk.pool?.relays.values() || []).map((r) => r.url);
    if (allRelayUrls.length === 0) {
      throw new Error('No relays available in NDK pool');
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
          results.push({ success: false, error: 'Failed to publish to any relays' });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.push({ success: false, error: errorMessage });
      }
    }
    // Debug: extract and log 'e' and 'a' tags from all published events
    publishedEvents.forEach(ev => {
      // Extract d-tag from tags
      const dTagEntry = ev.tags.find(t => t[0] === 'd');
      const dTag = dTagEntry ? dTagEntry[1] : '';
      const aTag = `${ev.kind}:${ev.pubkey}:${dTag}`;
      console.log(`Event ${ev.id} tags:`);
      console.log('  e:', ev.id);
      console.log('  a:', aTag);
      // Print nevent and naddr using nip19
      const nevent = nip19.neventEncode({ id: ev.id });
      const naddr = nip19.naddrEncode({ kind: ev.kind, pubkey: ev.pubkey, identifier: dTag });
      console.log('  nevent:', nevent);
      console.log('  naddr:', naddr);
    });
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    onError?.(errorMessage);
    return [{ success: false, error: errorMessage }];
  }
}

function generateDTag(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}
