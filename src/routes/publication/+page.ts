import { error } from "@sveltejs/kit";
import type { Load } from "@sveltejs/kit";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { getActiveRelaySetAsNDKRelaySet } from "../../lib/ndk.ts";
import { getMatchingTags } from "../../lib/utils/nostrUtils.ts";
import type NDK from "@nostr-dev-kit/ndk";

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
  const filter = decodeNaddr(id);

  // Handle the case where filter is null (decoding error)
  if (filter === null) {
    // If we can't decode the naddr, try using the raw ID
    try {
      const event = await ndk.fetchEvent(id);
      if (!event) {
        throw new Error(`Event not found for ID: ${id}`);
      }
      return event;
    } catch (err) {
      throw error(404, `Failed to fetch publication root event.\n${err}`);
    }
  }

  const hasFilter = Object.keys(filter).length > 0;

  try {
    const event = await (hasFilter
      ? ndk.fetchEvent(filter)
      : ndk.fetchEvent(id));

    if (!event) {
      throw new Error(`Event not found for ID: ${id}`);
    }
    return event;
  } catch (err) {
    throw error(404, `Failed to fetch publication root event.\n${err}`);
  }
}

/**
 * Fetches an event by d tag
 */
async function fetchEventByDTag(ndk: NDK, dTag: string): Promise<NDKEvent> {
  try {
    const relaySet = await getActiveRelaySetAsNDKRelaySet(ndk, true); // true for inbox relays
    const event = await ndk.fetchEvent(
      { "#d": [dTag] },
      { closeOnEose: false },
      relaySet,
    );

    if (!event) {
      throw new Error(`Event not found for d tag: ${dTag}`);
    }
    return event;
  } catch (err) {
    throw error(404, `Failed to fetch publication root event.\n${err}`);
  }
}

// TODO: Use path params instead of query params.
export const load: Load = async ({
  url,
  parent,
}: {
  url: URL;
  parent: () => Promise<Partial<Record<string, NDK>>>;
}) => {
  const id = url.searchParams.get("id");
  const dTag = url.searchParams.get("d");
  const { ndk } = await parent();

  if (!id && !dTag) {
    throw error(400, "No publication root event ID or d tag provided.");
  }

  // Fetch the event based on available parameters
  const indexEvent = id
    ? await fetchEventById(ndk!, id)
    : await fetchEventByDTag(ndk!, dTag!);

  const publicationType = getMatchingTags(indexEvent, "type")[0]?.[1];

  return {
    publicationType,
    indexEvent,
  };
};
