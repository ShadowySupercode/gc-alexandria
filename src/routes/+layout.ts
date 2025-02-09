import { feedTypeStorageKey } from '$lib/consts';
import { FeedType } from '$lib/consts';
import { getPersistedLogin, initNdk, loginWithExtension, ndkInstance } from '$lib/ndk';
import Pharos, { pharosInstance } from '$lib/parser';
import { feedType } from '$lib/stores';
import type { LayoutLoad } from './$types';

export const ssr = false;

export const load: LayoutLoad = () => {
  const initialFeedType = localStorage.getItem(feedTypeStorageKey) as FeedType
    ?? FeedType.StandardRelays;
  feedType.set(initialFeedType);

  const ndk = initNdk();
  ndkInstance.set(ndk);

  try {
    // Michael J - 18 Jan 2025 - This will not work server-side, since the NIP-07 extension is only
    // available in the browser, and the flags for persistent login are saved in the browser's
    // local storage.  If SSR is ever enabled, move this code block to run client-side.
    const pubkey = getPersistedLogin();
    if (pubkey) {
      // Michael J - 27 Jan 2025 - We don't await this call; it will run in the background and
      // update Svelte stores to propagate data.
      loginWithExtension(pubkey);
    }
  } catch (e) {
    console.warn(`Failed to login with extension: ${e}\n\nContinuing with anonymous session.`);
  }

  const parser = new Pharos(ndk);
  pharosInstance.set(parser);

  return {
    ndk,
    parser,
  };
};
