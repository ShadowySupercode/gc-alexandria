import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import type { NostrEvent } from "../../../../lib/utils/websocket_utils.ts";

// AI-NOTE: Server-side event fetching for SEO metadata
async function fetchEventServerSide(type: string, identifier: string): Promise<NostrEvent | null> {
  // For now, return null to indicate server-side fetch not implemented
  // This will fall back to client-side fetching
  return null;
}

export const load: LayoutServerLoad = async ({ params, url }) => {
  const { type, identifier } = params;

  // Try to fetch event server-side for metadata
  const indexEvent = await fetchEventServerSide(type, identifier);

  // Extract metadata for meta tags (use fallbacks if no event found)
  const title = indexEvent?.tags.find((tag) => tag[0] === "title")?.[1] || "Alexandria Publication";
  const summary = indexEvent?.tags.find((tag) => tag[0] === "summary")?.[1] || 
    "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages.";
  const image = indexEvent?.tags.find((tag) => tag[0] === "image")?.[1] || "/screenshots/old_books.jpg";
  const currentUrl = `${url.origin}${url.pathname}`;

  return {
    indexEvent, // Will be null, triggering client-side fetch
    metadata: {
      title,
      summary,
      image,
      currentUrl,
    },
  };
}; 