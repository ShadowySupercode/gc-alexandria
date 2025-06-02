import { error } from '@sveltejs/kit';
import type { Load } from '@sveltejs/kit';
import { selectRelayGroup } from '$lib/utils/relayGroupUtils';
import { searchEventByIdentifier, fetchEventWithFallback } from '$lib/utils';
import { wikiKind, indexKind, SectionKinds } from '$lib/consts';
import type { NostrEvent } from '$lib/types/nostr';

/**
 * Type definition for the page data returned by the loader
 */
interface PublicationPageData {
  parser: any; // TODO: Replace with proper parser type
  indexEvent: NostrEvent;
  url: URL;
  publicationType: string;
  waitable: Promise<any>; // TODO: Replace with proper waitable type
}

/**
 * Loads publication data based on the provided identifier or d-tag
 * @param url The URL containing search parameters
 * @param parent The parent loader function
 * @returns Publication data including the index event and parser
 * @throws {Error} If no valid identifier is provided or if the event cannot be found
 */
export const load = (async ({
  url,
  parent,
}) => {
  let id = url.searchParams.get('id');
  let dTag = url.searchParams.get('d');
  const { parser } = await parent();

  // Use the relays from the user's current settings
  const relays = selectRelayGroup('inbox');

  console.log('[Publication Loader] Fetching event', { id, dTag, relays });

  // Normalize id and dTag
  if (Array.isArray(id)) id = id[0];
  if (Array.isArray(dTag)) dTag = dTag[0];

  if ((id && typeof id !== 'string') || (dTag && typeof dTag !== 'string')) {
    throw error(400, 'Identifier and dTag must be strings.');
  }

  if (!id && !dTag) {
    throw error(400, 'No publication root event ID or d tag provided.');
  }

  try {
    let result;
    if (id) {
      // Use searchEventByIdentifier for string IDs (naddr, nevent, etc.)
      result = await searchEventByIdentifier(id, {
        timeoutMs: 3000,
        useFallbackRelays: true,
        relays
      });
    } else if (dTag) {
      // Use fetchEventWithFallback for d-tag searches
      result = await fetchEventWithFallback(
        { '#d': [dTag] },
        {
          relays,
          useFallbackRelays: true,
          timeout: 3000
        }
      );
    } else {
      throw new Error('No valid identifier provided');
    }

    if (!result.event) {
      throw new Error(`Event not found for identifier: ${id || dTag}`);
    }

    const indexEvent = result.event;

    // Determine publication type from event kind
    let publicationType: string;
    if (indexEvent.kind === 30023) {
      publicationType = 'article';
    } else if (indexEvent.kind === wikiKind) {
      publicationType = 'wiki';
    } else if (indexEvent.kind === indexKind) {
      publicationType = 'book';
    } else if (SectionKinds.includes(indexEvent.kind)) {
      publicationType = 'section';
    } else {
      publicationType = 'unknown';
    }

    // Create a waitable promise that resolves when the parser is ready
    const waitable = parser.fetch(indexEvent);

    return {
      parser,
      indexEvent,
      url,
      publicationType,
      waitable
    } satisfies PublicationPageData;
  } catch (err: unknown) {
    // User-friendly error message
    const message = err instanceof Error ? err.message : 'Unknown error occurred';
    throw error(404, { message });
  }
}) satisfies Load;
