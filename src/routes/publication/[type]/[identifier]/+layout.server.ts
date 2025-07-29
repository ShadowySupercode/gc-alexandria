import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { getMatchingTags, fetchEventById, fetchEventByDTag, fetchEventByNaddr, fetchEventByNevent } from "../../../../lib/utils/nostrUtils.ts";

export const load: LayoutServerLoad = async ({ params, parent, url }) => {
  const { type, identifier } = params;

  // TODO: Remove the need for NDK in nostrUtils dependencies, since NDK is not available on the server.
  // deno-lint-ignore no-explicit-any
  const { ndk } = (await parent()) as any;

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

  // Extract metadata for meta tags
  const title = getMatchingTags(indexEvent, "title")[0]?.[1] || "Alexandria Publication";
  const summary = getMatchingTags(indexEvent, "summary")[0]?.[1] || 
    "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages.";
  const image = getMatchingTags(indexEvent, "image")[0]?.[1] || "/screenshots/old_books.jpg";
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
}; 