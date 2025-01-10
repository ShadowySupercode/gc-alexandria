import NDK from "@nostr-dev-kit/ndk";
import type { LayoutLoad } from "./$types";
import { standardRelays } from "$lib/consts";
import Pharos, { pharosInstance } from "$lib/parser";
import { ndkInstance } from "$lib/ndk";

export const ssr = false;

export const load: LayoutLoad = () => {
  const ndk = new NDK({
    autoConnectUserRelays: true,
    enableOutboxModel: true,
    explicitRelayUrls: standardRelays,
  });
  ndk.connect().then(() => console.debug("ndk connected"));
  ndkInstance.set(ndk);

  const parser = new Pharos(ndk);
  pharosInstance.set(parser);

  return {
    ndk,
    parser,
  };
};
