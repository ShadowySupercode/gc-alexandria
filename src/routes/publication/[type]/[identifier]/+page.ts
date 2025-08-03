import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { fetchEventByDTag, fetchEventById, fetchEventByNaddr, fetchEventByNevent } from "../../../../lib/utils/websocket_utils.ts";
import type { NostrEvent } from "../../../../lib/utils/websocket_utils.ts";

export const load: PageLoad = async ({ params }: { params: { type: string; identifier: string } }) => {
  const { type, identifier } = params;

  let indexEvent: NostrEvent | null;

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
      error(400, `Unsupported identifier type: ${type}`);
  }

  if (!indexEvent) {
    error(404, `Event not found for ${type}: ${identifier}`);
  }

  const publicationType = indexEvent.tags.find((tag) => tag[0] === "type")?.[1] ?? "";

  return {
    publicationType,
    indexEvent,
  };
};
