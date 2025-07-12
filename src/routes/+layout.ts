import { feedTypeStorageKey } from '$lib/consts';
import { FeedType } from '$lib/consts';
import { getPersistedLogin, initNdk, ndkInstance } from '$lib/ndk';
import { loginWithExtension, loginWithAmber, loginWithNpub } from '$lib/stores/userStore';
import { loginMethodStorageKey } from '$lib/stores/userStore';
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
    const pubkey = getPersistedLogin();
    const loginMethod = localStorage.getItem(loginMethodStorageKey);
    const logoutFlag = localStorage.getItem('alexandria/logout/flag');
    console.log('Layout load - persisted pubkey:', pubkey);
    console.log('Layout load - persisted login method:', loginMethod);
    console.log('Layout load - logout flag:', logoutFlag);
    console.log('All localStorage keys:', Object.keys(localStorage));

    if (pubkey && loginMethod && !logoutFlag) {
      if (loginMethod === 'extension') {
        console.log('Restoring extension login...');
        loginWithExtension();
      } else if (loginMethod === 'amber') {
        // Amber login restoration would require more context (e.g., session, signer), so skip for now
        alert('Amber login cannot be restored automatically. Please reconnect your Amber wallet.');
        console.warn('Amber login cannot be restored automatically. Please reconnect your Amber wallet.');
      } else if (loginMethod === 'npub') {
        console.log('Restoring npub login...');
        loginWithNpub(pubkey);
      }
    } else if (logoutFlag) {
      console.log('Skipping auto-login due to logout flag');
      localStorage.removeItem('alexandria/logout/flag');
    }
  } catch (e) {
    console.warn(`Failed to restore login: ${e}\n\nContinuing with anonymous session.`);
  }

  const parser = new Pharos(ndk);
  pharosInstance.set(parser);

  return {
    ndk,
    parser,
  };
};
