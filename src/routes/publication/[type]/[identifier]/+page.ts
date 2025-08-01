import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { fetchEventByDTag, fetchEventById, fetchEventByNaddr, fetchEventByNevent } from "../../../../lib/utils/websocket_utils.ts";
import type { NostrEvent } from "../../../../lib/utils/websocket_utils.ts";
import { browser } from "$app/environment";

export const load: PageLoad = async ({ params }) => {
  const { type, identifier } = params;

  // Only fetch on the client side where WebSocket is available
  if (!browser) {
    // Return basic data for SSR
    return {
      publicationType: "",
      indexEvent: null,
    };
  }

  let indexEvent: NostrEvent;

  try {
    // Handle different identifier types
    switch (type) {
      case 'id':
        indexEvent = await fetchEventById(identifier);
        break;
      case 'd':
        indexEvent = await fetchEventByDTag(identifier);
        break;
      case 'naddr':
        indexEvent = await fetchEventByNaddr(identifier);
        break;
      case 'nevent':
        indexEvent = await fetchEventByNevent(identifier);
        break;
      default:
        throw error(400, `Unsupported identifier type: ${type}`);
    }

    if (!indexEvent) {
      throw error(404, `Event not found for ${type}: ${identifier}`);
    }

    const publicationType = indexEvent.tags.find((tag) => tag[0] === "type")?.[1] ?? "";

    return {
      publicationType,
      indexEvent,
    };
  } catch (err) {
    console.error('Failed to fetch publication:', err);
    throw error(404, `Failed to load publication: ${err}`);
  }
}; 