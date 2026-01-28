import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { getMatchingTags } from "$lib/utils/nostrUtils";
import { NDKRelaySetFromNDK } from "$lib/utils/nostrUtils";

/**
 * LabelManager handles fetching and managing kind 1985 label events.
 * It provides efficient lookups to check if a 30040 event has associated labels.
 */
export class LabelManager {
  private allLabel1985Events: NDKEvent[] = [];
  private label1985EventMap = new Map<string, boolean>();
  private label1985EventIdMap = new Map<string, boolean>();

  /**
   * Fetch ALL kind 1985 label events from the given relays.
   * This should be called before fetching 30040 events to enable proper filtering/sorting.
   *
   * @param relays - Array of relay URLs to fetch labels from
   * @param ndk - NDK instance to use for fetching
   * @returns Promise that resolves when labels are fetched and maps are built
   */
  async fetchLabels(relays: string[], ndk: NDK): Promise<void> {
    if (!ndk || relays.length === 0) {
      console.debug('[LabelManager] No NDK or relays available');
      return;
    }

    console.debug('[LabelManager] Fetching ALL kind 1985 label events from relay set');

    try {
      const startTime = Date.now();
      const relaySet = NDKRelaySetFromNDK.fromRelayUrls(relays, ndk);
      console.debug(`[LabelManager] Created relay set with ${relaySet.relays.size} relays for label fetching`);

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const labelEvents = await Promise.race([
        ndk.fetchEvents(
          {
            kinds: [1985],
          },
          {
            groupable: true,
            skipVerification: false,
            skipValidation: false,
            closeOnEose: true,
          },
          relaySet
        ).then(events => {
          // Clear timeout on success
          if (timeoutId !== null) clearTimeout(timeoutId);
          return events;
        }),
        new Promise<Set<NDKEvent>>((resolve) => {
          timeoutId = setTimeout(() => {
            console.debug('[LabelManager] Label fetch timed out after 30s');
            resolve(new Set<NDKEvent>());
          }, 30000); // 30s timeout for all relays
        })
      ]);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.allLabel1985Events = Array.from(labelEvents);
      console.debug(`[LabelManager] Fetched ${this.allLabel1985Events.length} label events in ${elapsed}s`);

      // Build maps of which 30040 events have 1985 labels (by address and event ID)
      this.buildLabelMaps();

      console.debug(`[LabelManager] Label maps built: ${this.label1985EventMap.size} addresses, ${this.label1985EventIdMap.size} event IDs`);
    } catch (err) {
      console.error('[LabelManager] Error fetching label 1985 events:', err);
    }
  }

  /**
   * Build internal maps from the fetched label events.
   * Maps track which 30040 events (by address and event ID) have associated labels.
   */
  private buildLabelMaps(): void {
    this.label1985EventMap = new Map();
    this.label1985EventIdMap = new Map();

    for (const labelEvent of this.allLabel1985Events) {
      // Extract addresses from "a" tags
      const aTags = getMatchingTags(labelEvent, "a");
      for (const aTag of aTags) {
        if (aTag[1]) {
          this.label1985EventMap.set(aTag[1], true);
        }
      }

      // Extract event IDs from "e" tags
      const eTags = getMatchingTags(labelEvent, "e");
      for (const eTag of eTags) {
        if (eTag[1]) {
          this.label1985EventIdMap.set(eTag[1], true);
        }
      }
    }
  }

  /**
   * Check if a 30040 event has an associated 1985 label.
   * Checks both by address (tagAddress) and by event ID.
   *
   * @param event - The NDKEvent to check
   * @returns true if the event has a 1985 label, false otherwise
   */
  has1985Label(event: NDKEvent): boolean {
    const address = event.tagAddress();
    const eventId = event.id;
    const hasLabelByAddress = this.label1985EventMap.get(address) === true;
    const hasLabelById = eventId ? this.label1985EventIdMap.get(eventId) === true : false;
    return hasLabelByAddress || hasLabelById;
  }

  /**
   * Get all fetched label events.
   * Useful for debugging or additional processing.
   */
  getAllLabelEvents(): NDKEvent[] {
    return this.allLabel1985Events;
  }

  /**
   * Get statistics about the label manager state.
   */
  getStats(): { totalLabels: number; addressMappings: number; eventIdMappings: number } {
    return {
      totalLabels: this.allLabel1985Events.length,
      addressMappings: this.label1985EventMap.size,
      eventIdMappings: this.label1985EventIdMap.size,
    };
  }

  /**
   * Clear all cached label data.
   * Useful when refetching labels from different relays.
   */
  clear(): void {
    this.allLabel1985Events = [];
    this.label1985EventMap.clear();
    this.label1985EventIdMap.clear();
  }
}
