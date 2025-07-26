import { error } from "@sveltejs/kit";
import type { Load } from "@sveltejs/kit";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { getActiveRelaySetAsNDKRelaySet, ndkInstance } from "../../lib/ndk.ts";
import { getMatchingTags, fetchEventWithFallback } from "../../lib/utils/nostrUtils.ts";
import type NDK from "@nostr-dev-kit/ndk";
import Pharos from "../../lib/parser.ts";
import { get } from "svelte/store";
import { TIMEOUTS } from "../../lib/utils/search_constants.ts";

/**
 * Decodes an naddr identifier and returns a filter object
 */
function decodeNaddr(id: string) {
  try {
    if (!id.startsWith("naddr")) return {};

    const decoded = nip19.decode(id);
    if (decoded.type !== "naddr") return {};

    const data = decoded.data;
    return {
      kinds: [data.kind],
      authors: [data.pubkey],
      "#d": [data.identifier],
    };
  } catch (e) {
    console.error("Failed to decode naddr:", e);
    return null;
  }
}

/**
 * Fetches an event by ID or filter
 */
async function fetchEventById(ndk: NDK, id: string): Promise<NDKEvent> {
  console.debug("[Publication] Fetching event by ID:", id);
  
  const filter = decodeNaddr(id);

  // Handle the case where filter is null (decoding error)
  if (filter === null) {
    console.debug("[Publication] Failed to decode naddr, trying raw ID");
    // If we can't decode the naddr, try using the raw ID
    try {
      const event = await fetchEventWithFallback(ndk, id, TIMEOUTS.EVENT_FETCH);
      if (!event) {
        throw new Error(`Event not found for ID: ${id}`);
      }
      console.debug("[Publication] Found event using raw ID:", event.id);
      return event;
    } catch (err) {
      console.error("[Publication] Error fetching event with raw ID:", err);
      throw error(404, `Failed to fetch publication root event.\n${err}`);
    }
  }

  const hasFilter = Object.keys(filter).length > 0;

  try {
    console.debug("[Publication] Using decoded filter:", filter);
    const event = await (hasFilter
      ? fetchEventWithFallback(ndk, filter, TIMEOUTS.EVENT_FETCH)
      : fetchEventWithFallback(ndk, id, TIMEOUTS.EVENT_FETCH));

    if (!event) {
      throw new Error(`Event not found for ID: ${id}`);
    }
    console.debug("[Publication] Found event using filter:", event.id);
    return event;
  } catch (err) {
    console.error("[Publication] Error fetching event with filter:", err);
    throw error(404, `Failed to fetch publication root event.\n${err}`);
  }
}

/**
 * Fetches an event by d tag
 */
async function fetchEventByDTag(ndk: NDK, dTag: string): Promise<NDKEvent> {
  console.debug("[Publication] Fetching event by d tag:", dTag);
  
  try {
    const event = await fetchEventWithFallback(
      ndk,
      { "#d": [dTag] },
      TIMEOUTS.EVENT_FETCH
    );

    if (!event) {
      throw new Error(`Event not found for d tag: ${dTag}`);
    }
    console.debug("[Publication] Found event using d tag:", event.id);
    return event;
  } catch (err) {
    console.error("[Publication] Error fetching event with d tag:", err);
    throw error(404, `Failed to fetch publication root event.\n${err}`);
  }
}

// TODO: Use path params instead of query params.
export const load: Load = async ({
  url,
}: {
  url: URL;
}) => {
  const id = url.searchParams.get("id");
  const dTag = url.searchParams.get("d");
  
  console.debug("[Publication] Loading publication with params:", { id, dTag });
  
  // Get NDK instance from store instead of parent
  const ndk = get(ndkInstance);

  if (!ndk) {
    console.error("[Publication] NDK instance not available");
    throw error(500, "NDK instance not available");
  }

  if (!id && !dTag) {
    console.error("[Publication] No publication root event ID or d tag provided");
    throw error(400, "No publication root event ID or d tag provided.");
  }

  // Decode the d-tag if it exists (it may be URL-encoded)
  const decodedDTag = dTag ? decodeURIComponent(dTag) : null;
  console.debug("[Publication] Decoded d tag:", decodedDTag);

  try {
    // Fetch the event based on available parameters
    const indexEvent = id
      ? await fetchEventById(ndk, id)
      : await fetchEventByDTag(ndk, decodedDTag!);

    console.debug("[Publication] Successfully fetched index event:", {
      id: indexEvent.id,
      kind: indexEvent.kind,
      pubkey: indexEvent.pubkey
    });

    const publicationType = getMatchingTags(indexEvent, "type")[0]?.[1];
    console.debug("[Publication] Publication type:", publicationType);

    // Create parser instance
    const parser = new Pharos(ndk);

    return {
      publicationType,
      indexEvent,
      ndk,
      parser,
    };
  } catch (err) {
    console.error("[Publication] Error in load function:", err);
    throw err;
  }
};
