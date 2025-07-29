import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { getActiveRelaySetAsNDKRelaySet } from "../../../../lib/ndk.ts";
import { getMatchingTags } from "../../../../lib/utils/nostrUtils.ts";
import { naddrDecode, neventDecode } from "../../../../lib/utils.ts";
import type NDK from "@nostr-dev-kit/ndk";

/**
 * Fetches an event by hex ID
 */
async function fetchEventById(ndk: NDK, id: string): Promise<NDKEvent> {
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

/**
 * Fetches an event by d tag
 */
async function fetchEventByDTag(ndk: NDK, dTag: string): Promise<NDKEvent> {
  try {
    const relaySet = await getActiveRelaySetAsNDKRelaySet(ndk, true); // true for inbox relays
    const events = await ndk.fetchEvents(
      { "#d": [dTag] },
      { closeOnEose: false },
      relaySet,
    );

    if (!events || events.size === 0) {
      throw new Error(`Event not found for d tag: ${dTag}`);
    }

    // AI-NOTE: Choose the event with the latest created_at timestamp when multiple events share the same d tag
    const sortedEvents = Array.from(events).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    return sortedEvents[0];
  } catch (err) {
    throw error(404, `Failed to fetch publication root event.\n${err}`);
  }
}

/**
 * Fetches an event by naddr identifier
 */
async function fetchEventByNaddr(ndk: NDK, naddr: string): Promise<NDKEvent> {
  try {
    const decoded = naddrDecode(naddr);
    const relaySet = await getActiveRelaySetAsNDKRelaySet(ndk, true);
    
    const filter = {
      kinds: [decoded.kind],
      authors: [decoded.pubkey],
      "#d": [decoded.identifier],
    };

    const event = await ndk.fetchEvent(filter, { closeOnEose: false }, relaySet);
    if (!event) {
      throw new Error(`Event not found for naddr: ${naddr}`);
    }
    return event;
  } catch (err) {
    throw error(404, `Failed to fetch publication root event.\n${err}`);
  }
}

/**
 * Fetches an event by nevent identifier
 */
async function fetchEventByNevent(ndk: NDK, nevent: string): Promise<NDKEvent> {
  try {
    const decoded = neventDecode(nevent);
    const event = await ndk.fetchEvent(decoded.id);
    if (!event) {
      throw new Error(`Event not found for nevent: ${nevent}`);
    }
    return event;
  } catch (err) {
    throw error(404, `Failed to fetch publication root event.\n${err}`);
  }
}

export const load: PageServerLoad = async ({ params, parent }) => {
  const { type, identifier } = params;
  const { ndk } = await parent();

  if (!ndk) {
    throw error(500, "NDK not available");
  }

  let indexEvent: NDKEvent;

  // Handle different identifier types
  switch (type) {
    case 'id':
      indexEvent = await fetchEventById(ndk, identifier);
      break;
    case 'd':
      indexEvent = await fetchEventByDTag(ndk, identifier);
      break;
    case 'naddr':
      indexEvent = await fetchEventByNaddr(ndk, identifier);
      break;
    case 'nevent':
      indexEvent = await fetchEventByNevent(ndk, identifier);
      break;
    default:
      throw error(400, `Unsupported identifier type: ${type}`);
  }

  const publicationType = getMatchingTags(indexEvent, "type")[0]?.[1];

  return {
    publicationType,
    indexEvent,
    ndk, // Pass ndk to the page for the publication tree
  };
}; 