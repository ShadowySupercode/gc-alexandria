import { ndkInstance } from '$lib/ndk';
import { fetchEventWithFallback } from '$lib/utils/nostrUtils';
import { nip19 } from '$lib/utils/nostrUtils';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { get } from 'svelte/store';
import { wellKnownUrl, isValidNip05Address } from './search_utils';
import { TIMEOUTS, VALIDATION } from './search_constants';

/**
 * Search for a single event by ID or filter
 */
export async function searchEvent(query: string): Promise<NDKEvent | null> {
  // Clean the query and normalize to lowercase
  let cleanedQuery = query.replace(/^nostr:/, "").toLowerCase();
  let filterOrId: any = cleanedQuery;

  // If it's a valid hex string, try as event id first, then as pubkey (profile)
  if (new RegExp(`^[a-f0-9]{${VALIDATION.HEX_LENGTH}}$`, 'i').test(cleanedQuery)) {
    // Try as event id
    filterOrId = cleanedQuery;
    const eventResult = await fetchEventWithFallback(
      get(ndkInstance),
      filterOrId,
      TIMEOUTS.EVENT_FETCH,
    );
    // Always try as pubkey (profile event) as well
    const profileFilter = { kinds: [0], authors: [cleanedQuery] };
    const profileEvent = await fetchEventWithFallback(
      get(ndkInstance),
      profileFilter,
      TIMEOUTS.EVENT_FETCH,
    );
    // Prefer profile if found and pubkey matches query
    if (
      profileEvent &&
      profileEvent.pubkey.toLowerCase() === cleanedQuery.toLowerCase()
    ) {
      return profileEvent;
    } else if (eventResult) {
      return eventResult;
    }
  } else if (
    new RegExp(`^(nevent|note|naddr|npub|nprofile)[a-z0-9]{${VALIDATION.MIN_NOSTR_IDENTIFIER_LENGTH},}$`, 'i').test(cleanedQuery)
  ) {
    try {
      const decoded = nip19.decode(cleanedQuery);
      if (!decoded) throw new Error("Invalid identifier");
      switch (decoded.type) {
        case "nevent":
          filterOrId = decoded.data.id;
          break;
        case "note":
          filterOrId = decoded.data;
          break;
        case "naddr":
          filterOrId = {
            kinds: [decoded.data.kind],
            authors: [decoded.data.pubkey],
            "#d": [decoded.data.identifier],
          };
          break;
        case "nprofile":
          filterOrId = {
            kinds: [0],
            authors: [decoded.data.pubkey],
          };
          break;
        case "npub":
          filterOrId = {
            kinds: [0],
            authors: [decoded.data],
          };
          break;
        default:
          filterOrId = cleanedQuery;
      }
    } catch (e) {
      console.error("[Search] Invalid Nostr identifier:", cleanedQuery, e);
      throw new Error("Invalid Nostr identifier.");
    }
  }

  try {
    const event = await fetchEventWithFallback(
      get(ndkInstance),
      filterOrId,
      TIMEOUTS.EVENT_FETCH,
    );

    if (!event) {
      console.warn("[Search] Event not found for filterOrId:", filterOrId);
      return null;
    } else {
      return event;
    }
  } catch (err) {
    console.error("[Search] Error fetching event:", err, "Query:", query);
    throw new Error("Error fetching event. Please check the ID and try again.");
  }
}

/**
 * Search for NIP-05 address
 */
export async function searchNip05(nip05Address: string): Promise<NDKEvent | null> {
  // NIP-05 address pattern: user@domain
  if (!isValidNip05Address(nip05Address)) {
    throw new Error("Invalid NIP-05 address format. Expected: user@domain");
  }

  try {
    const [name, domain] = nip05Address.split("@");
    
    const res = await fetch(wellKnownUrl(domain, name));
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    
    const pubkey = data.names?.[name];
    if (pubkey) {
      const profileFilter = { kinds: [0], authors: [pubkey] };
      const profileEvent = await fetchEventWithFallback(
        get(ndkInstance),
        profileFilter,
        TIMEOUTS.EVENT_FETCH,
      );
      if (profileEvent) {
        return profileEvent;
      } else {
        throw new Error(`No profile found for ${name}@${domain} (pubkey: ${pubkey})`);
      }
    } else {
      throw new Error(`NIP-05 address not found: ${name}@${domain}`);
    }
  } catch (e) {
    console.error(`[Search] Error resolving NIP-05 address ${nip05Address}:`, e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new Error(`Error resolving NIP-05 address: ${errorMessage}`);
  }
} 