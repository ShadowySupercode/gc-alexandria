import NDK from "@nostr-dev-kit/ndk";
import { indexKind } from "$lib/consts";

export const load = async ({ params, url, parent }) => {
  const { relays } = await parent();
  const { pubkey, dTag } = params;
  
  const ndk = new NDK({
    explicitRelayUrls: relays,
  });
  await ndk.connect();

  const event = await ndk.fetchEvent({
    kinds: [indexKind],
    authors: [pubkey],
    '#d': [dTag],
  });

  return {
    pubkey,
    dTag,
    url,
    event,
  };
};
