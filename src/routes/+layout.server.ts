import NDK from '@nostr-dev-kit/ndk';
import type { LayoutServerLoad } from './$types';
import { standardRelays, additionalLargeRelays } from '../lib/consts.ts';

export const load: LayoutServerLoad = async ({ cookies }) => {
  const relays: string[] = JSON.parse(cookies.get('alexandria') || '[]');
  if (relays.length === 0) {
    relays.push(...standardRelays, ...additionalLargeRelays);
  }
  
  return {
    relays,
  };
};
