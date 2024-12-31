import NDK from '@nostr-dev-kit/ndk';
import type { LayoutLoad } from './$types';
import { standardRelays } from '$lib/consts';
import Pharos, { pharosInstance } from '$lib/parser';

export const ssr = false;

export const load: LayoutLoad = () => {
  const ndk = new NDK({
    autoConnectUserRelays: true,
    enableOutboxModel: true,
    explicitRelayUrls: standardRelays,
  });
  ndk.connect().then(() => console.debug('ndk connected'));

  const parser = new Pharos(ndk);
  pharosInstance.set(parser);

  return {
    ndk,
    parser,
  };
};
