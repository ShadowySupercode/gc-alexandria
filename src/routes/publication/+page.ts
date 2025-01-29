import { error } from '@sveltejs/kit';
import { NDKRelay, NDKRelaySet, type NDKEvent } from '@nostr-dev-kit/ndk';
import type { PageLoad } from './$types';
import { get } from 'svelte/store';
import { getActiveRelays, inboxRelays, ndkInstance } from '$lib/ndk';
import { standardRelays } from '$lib/consts';

export const load: PageLoad = async ({ url, parent }) => {
  const id = url.searchParams.get('id');
  const dTag = url.searchParams.get('d');

  const { ndk, parser } = await parent();

  let eventPromise: Promise<NDKEvent | null>;
  let indexEvent: NDKEvent | null;

  if (id) {
    eventPromise = ndk.fetchEvent(id)
      .then((ev: NDKEvent | null) => {
        return ev;
      })
      .catch((err: any) => {
        error(404, `Failed to fetch publication root event for ID: ${id}\n${err}`);
      });
  } else if (dTag) {
    eventPromise = new Promise<NDKEvent | null>(resolve => {
      ndk
        .fetchEvent({ '#d': [dTag] }, { closeOnEose: false }, getActiveRelays(ndk))
        .then((event: NDKEvent | null) => {
          resolve(event);
        })
        .catch((err: any) => {
          error(404, `Failed to fetch publication root event for d tag: ${dTag}\n${err}`);
        });
    });
  } else {
    error(400, 'No publication root event ID or d tag provided.');
  }

  indexEvent = await eventPromise as NDKEvent;
  const publicationType = indexEvent?.getMatchingTags('type')[0]?.[1];
  const fetchPromise = parser.fetch(indexEvent);

  return {
    waitable: fetchPromise,
    publicationType,
  };
};
