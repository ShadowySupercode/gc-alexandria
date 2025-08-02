import { error } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";
import { fetchEventByDTag, fetchEventById, fetchEventByNaddr, fetchEventByNevent } from "../../../../lib/utils/websocket_utils.ts";
import type { NostrEvent } from "../../../../lib/utils/websocket_utils.ts";
import { browser } from "$app/environment";

export const load: LayoutLoad = async ({ params, url }) => {
  const { type, identifier } = params;

  // Only fetch on the client side where WebSocket is available
  if (!browser) {
    // Return basic metadata for SSR
    return {
      indexEvent: null,
      metadata: {
        title: "Alexandria Publication",
        summary: "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages.",
        image: "/screenshots/old_books.jpg",
        currentUrl: `${url.origin}${url.pathname}`,
      },
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

    // Extract metadata for meta tags
    const title = indexEvent.tags.find((tag) => tag[0] === "title")?.[1] || "Alexandria Publication";
    const summary = indexEvent.tags.find((tag) => tag[0] === "summary")?.[1] || 
      "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages.";
    const image = indexEvent.tags.find((tag) => tag[0] === "image")?.[1] || "/screenshots/old_books.jpg";
    const currentUrl = `${url.origin}${url.pathname}`;

    return {
      indexEvent,
      metadata: {
        title,
        summary,
        image,
        currentUrl,
      },
    };
  } catch (err) {
    console.error('Failed to fetch publication:', err);
    throw error(404, `Failed to load publication: ${err}`);
  }
};
