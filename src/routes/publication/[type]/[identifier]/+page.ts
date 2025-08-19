import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import {
  fetchEventByDTag,
  fetchEventById,
  fetchEventByNaddr,
  fetchEventByNevent,
} from "../../../../lib/utils/websocket_utils.ts";
import type { NostrEvent } from "../../../../lib/utils/websocket_utils.ts";

export const load: PageLoad = async (
  { params }: {
    params: { type: string; identifier: string };
  },
) => {
  const { type, identifier } = params;

  // AI-NOTE: Always fetch client-side since server-side fetch returns null for now
  let indexEvent: NostrEvent | null = null;

  try {
    // Handle different identifier types
    switch (type) {
      case "id":
        indexEvent = await fetchEventById(identifier);
        break;
      case "d":
        indexEvent = await fetchEventByDTag(identifier);
        break;
      case "naddr":
        indexEvent = await fetchEventByNaddr(identifier);
        break;
      case "nevent":
        indexEvent = await fetchEventByNevent(identifier);
        break;
      default:
        error(400, `Unsupported identifier type: ${type}`);
    }
  } catch (err) {
    throw err;
  }

  if (!indexEvent) {
    // AI-NOTE: Handle case where no relays are available during preloading
    // This prevents 404 errors when relay stores haven't been populated yet

    // Create appropriate search link based on type
    let searchParam = "";
    switch (type) {
      case "id":
        searchParam = `id=${identifier}`;
        break;
      case "d":
        searchParam = `d=${identifier}`;
        break;
      case "naddr":
      case "nevent":
        searchParam = `id=${identifier}`;
        break;
      default:
        searchParam = `q=${identifier}`;
    }

    error(
      404,
      `Event not found for ${type}: ${identifier}. href="/events?${searchParam}"`,
    );
  }

  const publicationType =
    indexEvent.tags.find((tag) => tag[0] === "type")?.[1] ?? "";

  const result = {
    publicationType,
    indexEvent,
  };

  return result;
};
