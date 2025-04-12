import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import type { LayoutServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { indexKind } from "../../lib/consts.ts";

export const load: LayoutServerLoad = async ({ params, parent, url }) => {
  const { pubkey, dTag } = params;

  if (pubkey && dTag) {
    return {
      pubkey,
      dTag,
    };
  }

  const { relays } = await parent();
  
  const ndk = new NDK({
    explicitRelayUrls: relays,
  });
  await ndk.connect();

  const id = url.searchParams.get('id');
  const d = url.searchParams.get('d');

  let event: NDKEvent | null = null;
  if (id) {
    event = await ndk.fetchEvent(id);
  } else if (d) {
    event = await ndk.fetchEvent({
      kinds: [indexKind],
      '#d': [d],
    });
  }
  
  if (!event) {
    error(404, {
      message: 'Publication not found',
    });
  }

  return {
    pubkey: event.pubkey,
    dTag: event.getMatchingTags('d')[0]?.[1],
  };
};