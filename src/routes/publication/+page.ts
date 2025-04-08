import { error } from '@sveltejs/kit';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import type { PageLoad } from './$types';
import { nip19 } from 'nostr-tools';
import { getActiveRelays } from '$lib/ndk.ts';
import { setContext } from 'svelte';
import { PublicationTree } from '$lib/data_structures/publication_tree.ts';

/**
 * Decodes an naddr identifier and returns a filter object
 */
function decodeNaddr(id: string) {
  try {
    if (!id.startsWith('naddr1')) return {};
    
    const decoded = nip19.decode(id);
    if (decoded.type !== 'naddr') return {};
    
    const data = decoded.data;
    return {
      kinds: [data.kind],
      authors: [data.pubkey],
      '#d': [data.identifier]
    };
  } catch (e) {
    console.error('Failed to decode naddr:', e);
    return {};
  }
}

/**
 * Fetches an event by ID or filter
 */
async function fetchEventById(ndk: any, id: string): Promise<NDKEvent> {
  const filter = decodeNaddr(id);
  const hasFilter = Object.keys(filter).length > 0;
  
  try {
    const event = await (hasFilter ? 
      ndk.fetchEvent(filter) : 
      ndk.fetchEvent(id));
      
    if (!event) {
      throw new Error(`Event not found for ID: ${id}`);
    }
    
    return event;
  } catch (err) {
    throw error(404, `Failed to fetch publication root event for ID: ${id}\n${err}`);
  }
}

/**
 * Fetches an event by d tag
 */
async function fetchEventByDTag(ndk: any, dTag: string): Promise<NDKEvent> {
  try {
    const event = await ndk.fetchEvent(
      { '#d': [dTag] }, 
      { closeOnEose: false }, 
      getActiveRelays(ndk)
    );
    
    if (!event) {
      throw new Error(`Event not found for d tag: ${dTag}`);
    }
    
    return event;
  } catch (err) {
    throw error(404, `Failed to fetch publication root event for d tag: ${dTag}\n${err}`);
  }
}

export const load: PageLoad = async ({ url, parent }: { url: URL; parent: () => Promise<any> }) => {
  const id = url.searchParams.get('id');
  const dTag = url.searchParams.get('d');
  const { ndk, parser } = await parent();
  
  if (!id && !dTag) {
    throw error(400, 'No publication root event ID or d tag provided.');
  }
  
  // Fetch the event based on available parameters
  const indexEvent = id 
    ? await fetchEventById(ndk, id)
    : await fetchEventByDTag(ndk, dTag!);
  
  const publicationType = indexEvent?.getMatchingTags('type')[0]?.[1];
  const fetchPromise = parser.fetch(indexEvent);

  setContext('publicationTree', new PublicationTree(indexEvent, ndk));

  return {
    waitable: fetchPromise,
    publicationType,
  };
};
