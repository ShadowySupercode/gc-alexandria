import { error } from '@sveltejs/kit';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { PageLoad } from './$types';
import { getAllRelays } from '$lib/ndk.ts';
import { decodeNostrId, fetchEventSafely} from '$lib/utils';
import { indexKind, zettelKinds, wikiKind } from '$lib/consts';

/**
 * Fetches an event by ID (hex ID, nevent, or naddr)
 */
async function fetchEventById(ndk: any, id: string): Promise<NDKEvent> {
  try {
    console.log(`Attempting to decode ID: ${id}`);
    const filter = decodeNostrId(id);
    
    if (!filter) {
      console.warn(`Could not decode ID: ${id}, trying raw ID`);
      // If we can't decode the ID, try using it directly
      const event = await ndk.fetchEvent(id, { closeOnEose: true }, getAllRelays(ndk));
      if (!event) {
        throw new Error(`Event not found for ID: ${id}`);
      }
      return event;
    }
    
    // If the filter already specifies a kind, use it directly
    if (filter.kinds) {
      console.log(`Fetching event with filter:`, filter);
      const event = await ndk.fetchEvent(filter, { closeOnEose: true }, getAllRelays(ndk));
      
      if (event) {
        return event;
      }
      
      throw new Error(`Event not found for ID: ${id}`);
    }
    
    // If the filter doesn't specify a kind, try with each kind separately
    console.log(`Filter doesn't specify a kind, trying with specific kinds`);
    
    // First try with kind 30040 (index) only, as this is the most common case
    try {
      const indexFilter = { ...filter, kinds: [indexKind] };
      console.log(`Trying with index kind filter:`, indexFilter);
      const event = await ndk.fetchEvent(indexFilter, { closeOnEose: true }, getAllRelays(ndk));
      
      if (event) {
        console.log(`Found event with kind ${event.kind}`);
        return event;
      }
    } catch (err) {
      console.warn(`Failed to fetch event with index kind:`, err);
    }
    
    // If that fails, try with zettel kinds
    try {
      const zettelFilter = { ...filter, kinds: zettelKinds };
      console.log(`Trying with zettel kinds filter:`, zettelFilter);
      const event = await ndk.fetchEvent(zettelFilter, { closeOnEose: true }, getAllRelays(ndk));
      
      if (event) {
        console.log(`Found event with kind ${event.kind}`);
        return event;
      }
    } catch (err) {
      console.warn(`Failed to fetch event with zettel kinds:`, err);
    }
    
    // Finally try without specifying a kind
    console.log(`Trying with original filter:`, filter);
    const event = await ndk.fetchEvent(filter, { closeOnEose: true }, getAllRelays(ndk));
    
    if (event) {
      console.log(`Found event without specifying a kind, kind is: ${event.kind}`);
      return event;
    }
    
    throw new Error(`Event not found for ID: ${id}`);
  } catch (err) {
    console.error(`Error fetching event with ID ${id}:`, err);
    throw error(404, `Failed to fetch publication root event.\n${err}`);
  }
}

/**
 * Fetches an event by d tag, trying one kind at a time
 */
async function fetchEventByDTag(ndk: any, dTag: string): Promise<NDKEvent> {
  console.log(`Fetching event with d tag: ${dTag}`);
  
  // First try with kind 30040 (index) only, as this is the most common case
  try {
    console.log(`Trying to fetch event with d tag ${dTag} and kind: ${indexKind}`);
    const event = await ndk.fetchEvent(
      { 
        kinds: [indexKind],
        '#d': [dTag]
      }, 
      { closeOnEose: true }, 
      getAllRelays(ndk)
    );
    
    if (event) {
      console.log(`Found event with d tag ${dTag} and kind ${event.kind}`);
      return event;
    }
  } catch (err) {
    console.warn(`Failed to fetch event with d tag ${dTag} and kind ${indexKind}:`, err);
  }
  
  // If that fails, try with all zettel kinds
  try {
    console.log(`Trying to fetch event with d tag ${dTag} and zettel kinds: ${zettelKinds}`);
    const event = await ndk.fetchEvent(
      { 
        kinds: zettelKinds,
        '#d': [dTag]
      }, 
      { closeOnEose: true }, 
      getAllRelays(ndk)
    );
    
    if (event) {
      console.log(`Found event with d tag ${dTag} and kind ${event.kind}`);
      return event;
    }
  } catch (err) {
    console.warn(`Failed to fetch event with d tag ${dTag} and zettel kinds:`, err);
  }
  
  // If that fails, try without specifying a kind as a last resort
  try {
    console.log(`Trying to fetch event with d tag ${dTag} without specifying a kind`);
    const event = await ndk.fetchEvent(
      { '#d': [dTag] }, 
      { closeOnEose: true }, 
      getAllRelays(ndk)
    );
    
    if (event) {
      console.log(`Found event with d tag ${dTag} without specifying a kind, kind is: ${event.kind}`);
      return event;
    }
    
    throw new Error(`Event not found for d tag: ${dTag}`);
  } catch (err) {
    console.error(`Failed to fetch event with d tag ${dTag}:`, err);
    throw error(404, `Failed to fetch publication root event.\n${err}`);
  }
}

export const load: PageLoad = async ({ params, url, parent }) => {
  const { pubkey, dTag } = params;
  const id = url.searchParams.get('id');
  const queryDTag = url.searchParams.get('d');
  const { ndk, parser } = await parent();
  
  console.log('Publication page load', { pubkey, dTag, id, queryDTag });
  
  let indexEvent;
  
  /**
   * Tries to fetch an event with different kinds
   */
  async function fetchEventWithMultipleKinds(ndk: any, pubkey: string, dTag: string): Promise<NDKEvent | null> {
    console.log(`Fetching event with pubkey: ${pubkey} and dTag: ${dTag}`);
    
    // First try with kind 30040 (index) only, as this is the most common case
    try {
      console.log(`Trying to fetch event with kind: ${indexKind}`);
      const event = await ndk.fetchEvent(
        { 
          kinds: [indexKind],
          authors: [pubkey],
          '#d': [dTag]
        }, 
        { closeOnEose: true }, 
        getAllRelays(ndk)
      );
      
      if (event) {
        console.log(`Found event with kind ${event.kind}`);
        return event;
      }
    } catch (err) {
      console.warn(`Failed to fetch event with kind ${indexKind}:`, err);
    }
    
    // If that fails, try with all zettel kinds
    try {
      console.log(`Trying to fetch event with zettel kinds: ${zettelKinds}`);
      const event = await ndk.fetchEvent(
        { 
          kinds: zettelKinds,
          authors: [pubkey],
          '#d': [dTag]
        }, 
        { closeOnEose: true }, 
        getAllRelays(ndk)
      );
      
      if (event) {
        console.log(`Found event with kind ${event.kind}`);
        return event;
      }
    } catch (err) {
      console.warn(`Failed to fetch event with zettel kinds:`, err);
    }
    
    // If that fails, try without specifying a kind as a last resort
    try {
      console.log(`Trying to fetch event without specifying a kind`);
      const event = await ndk.fetchEvent(
        { 
          authors: [pubkey],
          '#d': [dTag]
        }, 
        { closeOnEose: true }, 
        getAllRelays(ndk)
      );
      
      if (event) {
        console.log(`Found event without specifying a kind, kind is: ${event.kind}`);
        return event;
      }
    } catch (err) {
      console.warn(`Failed to fetch event without specifying a kind:`, err);
    }
    
    return null;
  }

  // First try to use the route parameters
  if (pubkey && dTag) {
    indexEvent = await fetchEventWithMultipleKinds(ndk, pubkey, dTag);
  }
  
  // If that fails, try the query parameters
  if (!indexEvent && (id || queryDTag)) {
    console.log('Falling back to query parameters');
    indexEvent = id 
      ? await fetchEventById(ndk, id)
      : await fetchEventByDTag(ndk, queryDTag!);
  }
  
  if (!indexEvent) {
    throw error(404, 'Failed to fetch publication root event.');
  }
  
  // Get the kind from the event
  const publicationType = indexEvent?.kind?.toString() || indexEvent?.getMatchingTags('kind')[0]?.[1] || indexEvent?.getMatchingTags('type')[0]?.[1];
  const fetchPromise = parser.fetch(indexEvent);

  return {
    waitable: fetchPromise,
    publicationType,
    indexEvent,
  };
};
