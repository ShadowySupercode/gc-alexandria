import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { getMatchingTags, fetchEventById, fetchEventByDTag, fetchEventByNaddr, fetchEventByNevent } from "../../../../lib/utils/nostrUtils.ts";   

export const load: PageServerLoad = async ({ params, parent }) => {
  const { type, identifier } = params;
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

  const publicationType = getMatchingTags(indexEvent, "type")[0]?.[1];

  return {
    publicationType,
    indexEvent,
    ndk, // Pass ndk to the page for the publication tree
  };
}; 