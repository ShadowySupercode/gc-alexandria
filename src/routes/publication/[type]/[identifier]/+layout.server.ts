import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ params, url }) => {
  const { type, identifier } = params;

  // Validate the identifier type for SSR
  const validTypes = ['id', 'd', 'naddr', 'nevent'];
  if (!validTypes.includes(type)) {
    throw error(400, `Unsupported identifier type: ${type}`);
  }

  // Provide basic metadata for SSR - actual fetching will happen on client
  const title = "Alexandria Publication";
  const summary = "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages.";
  const image = "/screenshots/old_books.jpg";
  const currentUrl = `${url.origin}${url.pathname}`;

  return {
    indexEvent: null, // Will be fetched on client side
    metadata: {
      title,
      summary,
      image,
      currentUrl,
    },
  };
}; 