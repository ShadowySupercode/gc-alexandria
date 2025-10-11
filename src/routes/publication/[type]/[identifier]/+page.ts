import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import {
  fetchEventByDTag,
  fetchEventById,
  fetchEventByNaddr,
  fetchEventByNevent,
} from "../../../../lib/utils/websocket_utils.ts";
import type { NostrEvent } from "../../../../lib/utils/websocket_utils.ts";
import { browser } from "$app/environment";

export const load: PageLoad = async (
  { params }: {
    params: { type: string; identifier: string };
  },
) => {
  const { type, identifier } = params;

  // AI-NOTE: Only fetch client-side since server-side fetch fails due to missing relay connections
  // This prevents 404 errors when refreshing publication pages during SSR
  let indexEvent: NostrEvent | null = null;

  // Only attempt to fetch if we're in a browser environment
  if (browser) {
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
      // AI-NOTE: Don't throw error immediately - let the component handle it
      // This allows for better error handling and retry logic
      console.warn(`[Publication Load] Failed to fetch event:`, err);
    }
  }

  // AI-NOTE: Return null for indexEvent during SSR or when fetch fails
  // The component will handle client-side loading and error states
  const publicationType =
    indexEvent?.tags.find((tag) => tag[0] === "type")?.[1] ?? "";

  const result = {
    publicationType,
    indexEvent,
    // AI-NOTE: Pass the identifier info for client-side retry
    identifierInfo: {
      type,
      identifier,
    },
  };

  return result;
};
