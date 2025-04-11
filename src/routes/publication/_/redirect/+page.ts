import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { getActiveRelays } from '$lib/ndk';
import { decodeNostrId } from '$lib/utils';

export const load: PageLoad = async ({ url, parent }) => {
  const id = url.searchParams.get('id');
  const dTag = url.searchParams.get('d');
  const { ndk, parser } = await parent();
  
  console.log('Redirect page load', { id, dTag });
  
  if (!id && !dTag) {
    console.log('No id or d tag provided, redirecting to home');
    redirect(301, '/');
  }
  
  try {
    // Fetch the event based on available parameters
    let indexEvent;
    
    if (dTag) {
      console.log(`Fetching event with d tag: ${dTag}`);
      indexEvent = await ndk.fetchEvent(
        { '#d': [dTag] }, 
        { closeOnEose: false }, 
        getActiveRelays(ndk)
      );
    } else if (id) {
      console.log(`Attempting to decode ID: ${id}`);
      const filter = decodeNostrId(id);
      
      if (filter) {
        console.log(`Fetching event with filter:`, filter);
        indexEvent = await ndk.fetchEvent(filter);
      } else {
        console.warn(`Could not decode ID: ${id}, trying raw ID`);
        // If we can't decode the ID, try using it directly
        indexEvent = await ndk.fetchEvent(id);
      }
    }
    
    if (!indexEvent) {
      throw new Error(`Event not found for ${id ? `ID: ${id}` : `d tag: ${dTag}`}`);
    }
    
    const pubkey = indexEvent.pubkey;
    const eventDTag = indexEvent.getMatchingTags('d')[0]?.[1];
    
    if (!eventDTag) {
      throw new Error(`No d tag found for event with ${id ? `ID: ${id}` : `d tag: ${dTag}`}`);
    }
    
    console.log(`Redirecting to canonical URL: /publication/${pubkey}/${eventDTag}`);
    redirect(301, `/publication/${pubkey}/${eventDTag}`);
  } catch (err) {
    console.error('Error in redirect page:', err);
    return {
      id,
      dTag,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};
