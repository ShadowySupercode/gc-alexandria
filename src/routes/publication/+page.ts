import { error } from '@sveltejs/kit';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { PageLoad } from './$types';
import { pharosInstance } from '$lib/parser';

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
    eventPromise = ndk.fetchEvent({ '#d': [dTag] })
      .then((ev: NDKEvent | null) => {
        return ev;
      })
      .catch((err: any) => {
        error(404, `Failed to fetch publication root event for d tag: ${dTag}\n${err}`);
      });
  } else {
    error(400, 'No publication root event ID or d tag provided.');
  }

  indexEvent = await eventPromise as NDKEvent;
  const fetchPromise = parser.fetch(indexEvent);

  return {
    waitable: fetchPromise,
  };
};
