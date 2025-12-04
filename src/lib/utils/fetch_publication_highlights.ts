import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent } from "@nostr-dev-kit/ndk";

/**
 * Fetches all highlight events (kind 9802) for sections referenced in a publication event (kind 30040).
 *
 * @param publicationEvent - The kind 30040 event containing "a" tags referencing sections (kind 30041)
 * @param ndk - The NDK instance to use for fetching events
 * @returns A Map of section addresses to arrays of highlight events
 *
 * @example
 * ```typescript
 * const highlights = await fetchHighlightsForPublication(publicationEvent, ndk);
 * // Returns: Map {
 * //   "30041:pubkey:section-id" => [highlightEvent1, highlightEvent2],
 * //   "30041:pubkey:another-section" => [highlightEvent3]
 * // }
 * ```
 */
export async function fetchHighlightsForPublication(
  publicationEvent: NDKEvent,
  ndk: NDK
): Promise<Map<string, NDKEvent[]>> {
  // Extract all "a" tags from the publication event
  const aTags = publicationEvent.getMatchingTags("a");

  // Filter for only 30041 (section) references
  const sectionAddresses: string[] = [];
  aTags.forEach((tag: string[]) => {
    if (tag[1]) {
      const parts = tag[1].split(":");
      // Check if it's a 30041 kind reference and has the correct format
      if (parts.length >= 3 && parts[0] === "30041") {
        // Handle d-tags with colons by joining everything after the pubkey
        const sectionAddress = tag[1];
        sectionAddresses.push(sectionAddress);
      }
    }
  });

  // If no section references found, return empty map
  if (sectionAddresses.length === 0) {
    return new Map();
  }

  // Fetch all highlight events (kind 9802) that reference these sections
  const highlightEvents = await ndk.fetchEvents({
    kinds: [9802],
    "#a": sectionAddresses,
  });

  // Group highlights by section address
  const highlightsBySection = new Map<string, NDKEvent[]>();

  highlightEvents.forEach((highlight: NDKEvent) => {
    const highlightATags = highlight.getMatchingTags("a");
    highlightATags.forEach((tag: string[]) => {
      const sectionAddress = tag[1];
      // Only include if this section is in our original list
      if (sectionAddress && sectionAddresses.includes(sectionAddress)) {
        if (!highlightsBySection.has(sectionAddress)) {
          highlightsBySection.set(sectionAddress, []);
        }
        highlightsBySection.get(sectionAddress)!.push(highlight);
      }
    });
  });

  return highlightsBySection;
}
