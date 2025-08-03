import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";
import { fetchEventByDTag, fetchEventById, fetchEventByNaddr, fetchEventByNevent } from "../../../../lib/utils/websocket_utils.ts";
import type { NostrEvent } from "../../../../lib/utils/websocket_utils.ts";

export const load: PageLoad = async ({ params, parent }: { params: { type: string; identifier: string }; parent: any }) => {
  console.debug(`[Publication Load] Page load function called with params:`, params);
  const { type, identifier } = params;
  console.debug(`[Publication Load] About to call parent()...`);
  
  // Get layout data (no server-side data since SSR is disabled)
  const layoutData = await parent();
  console.debug(`[Publication Load] Layout data received:`, layoutData ? 'success' : 'null');

  // AI-NOTE: Always fetch client-side since server-side fetch returns null for now
  let indexEvent: NostrEvent | null = null;
  console.debug(`[Publication Load] Fetching client-side for: ${identifier}`);
    
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
        console.debug(`[Publication Load] Calling fetchEventByNaddr for: ${identifier}`);
        indexEvent = await fetchEventByNaddr(identifier);
        console.debug(`[Publication Load] fetchEventByNaddr returned:`, indexEvent ? 'success' : 'null');
        break;
      case 'nevent':
        indexEvent = await fetchEventByNevent(identifier);
        break;
      default:
        error(400, `Unsupported identifier type: ${type}`);
    }

    console.debug(`[Publication Load] Client-side indexEvent after fetch:`, indexEvent ? 'success' : 'null');
  } catch (err) {
    console.error(`[Publication Load] Error fetching event client-side:`, err);
    throw err;
  }
  
  if (!indexEvent) {
    // AI-NOTE: Handle case where no relays are available during preloading
    // This prevents 404 errors when relay stores haven't been populated yet
    console.warn(`[Publication Load] Event not found for ${type}: ${identifier} - may be due to no relays available`);
    
    // Create appropriate search link based on type
    let searchParam = '';
    switch (type) {
      case 'id':
        searchParam = `id=${identifier}`;
        break;
      case 'd':
        searchParam = `d=${identifier}`;
        break;
      case 'naddr':
      case 'nevent':
        searchParam = `id=${identifier}`;
        break;
      default:
        searchParam = `q=${identifier}`;
    }
    
    error(404, `Event not found for ${type}: ${identifier}. href="/events?${searchParam}"`);
  }

  console.debug(`[Publication Load] indexEvent details:`, {
    id: indexEvent.id,
    kind: indexEvent.kind,
    pubkey: indexEvent.pubkey,
    tags: indexEvent.tags.length,
    contentLength: indexEvent.content.length
  });

  const publicationType = indexEvent.tags.find((tag) => tag[0] === "type")?.[1] ?? "";
  
  console.debug(`[Publication Load] publicationType:`, publicationType);

  // AI-NOTE: Use proper NDK instance from layout or create one with relays
  let ndk = layoutData?.ndk;
  if (!ndk) {
    console.debug(`[Publication Load] Layout NDK not available, creating NDK instance with relays`);
    // Import NDK dynamically to avoid SSR issues
    const NDK = (await import("@nostr-dev-kit/ndk")).default;
    // Import initNdk to get properly configured NDK with relays
    const { initNdk } = await import("$lib/ndk");
    ndk = initNdk();
  }

  const result = {
    publicationType,
    indexEvent,
    ndk, // Use minimal NDK instance
  };
  
  console.debug(`[Publication Load] Returning result:`, result);
  return result;
};
