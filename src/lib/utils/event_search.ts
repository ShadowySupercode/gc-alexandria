import { ndkInstance } from "../ndk.ts";
import { fetchEventWithFallback } from "./nostrUtils.ts";
import { nip19 } from "nostr-tools";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import type { Filter } from "./search_types.ts";
import { get } from "svelte/store";
import { wellKnownUrl, isValidNip05Address } from "./search_utils.ts";
import { TIMEOUTS, VALIDATION } from "./search_constants.ts";

/**
 * Search for a single event by ID or filter
 */
export async function searchEvent(query: string): Promise<NDKEvent | null> {
  // Clean the query and normalize to lowercase
  const cleanedQuery = query.replace(/^nostr:/, "").toLowerCase();
  let filterOrId: Filter | string = cleanedQuery;

  // If it's a valid hex string, try as event id first, then as pubkey (profile)
  if (
    new RegExp(`^[a-f0-9]{${VALIDATION.HEX_LENGTH}}$`, "i").test(cleanedQuery)
  ) {
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
    new RegExp(
      `^(nevent|note|naddr|npub|nprofile)[a-z0-9]{${VALIDATION.MIN_NOSTR_IDENTIFIER_LENGTH},}$`,
      "i",
    ).test(cleanedQuery)
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
export async function searchNip05(
  nip05Address: string,
): Promise<NDKEvent | null> {
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
        throw new Error(
          `No profile found for ${name}@${domain} (pubkey: ${pubkey})`,
        );
      }
    } else {
      throw new Error(`NIP-05 address not found: ${name}@${domain}`);
    }
  } catch (e) {
    console.error(
      `[Search] Error resolving NIP-05 address ${nip05Address}:`,
      e,
    );
    const errorMessage = e instanceof Error ? e.message : String(e);
    throw new Error(`Error resolving NIP-05 address: ${errorMessage}`);
  }
}

/**
 * Find containing 30040 index events for a given content event
 * @param contentEvent The content event to find containers for (30041, 30818, etc.)
 * @returns Array of containing 30040 index events
 */
export async function findContainingIndexEvents(
  contentEvent: NDKEvent,
): Promise<NDKEvent[]> {
  // Support all content event kinds that can be contained in indexes
  const contentEventKinds = [30041, 30818, 30040, 30023];
  if (!contentEventKinds.includes(contentEvent.kind!)) {
    return [];
  }

  try {
    const ndk = get(ndkInstance);

    // Search for 30040 events that reference this content event
    // We need to search for events that have an 'a' tag or 'e' tag referencing this event
    const contentEventId = contentEvent.id;
    const contentEventAddress = contentEvent.tagAddress();

    // Search for index events that reference this content event
    const indexEvents = await ndk.fetchEvents(
      {
        kinds: [30040],
        "#a": [contentEventAddress],
      },
      {
        groupable: true,
        skipVerification: false,
        skipValidation: false,
      },
    );

    // Also search for events with 'e' tags (legacy format)
    const indexEventsWithETags = await ndk.fetchEvents(
      {
        kinds: [30040],
        "#e": [contentEventId],
      },
      {
        groupable: true,
        skipVerification: false,
        skipValidation: false,
      },
    );

    // Combine and deduplicate results
    const allIndexEvents = new Set([...indexEvents, ...indexEventsWithETags]);

    // Filter to only include valid index events
    const validIndexEvents = Array.from(allIndexEvents).filter((event) => {
      // Check if it's a valid index event (has title, d tag, and either a or e tags)
      const hasTitle = event.getMatchingTags("title").length > 0;
      const hasDTag = event.getMatchingTags("d").length > 0;
      const hasATags = event.getMatchingTags("a").length > 0;
      const hasETags = event.getMatchingTags("e").length > 0;

      return hasTitle && hasDTag && (hasATags || hasETags);
    });

    return validIndexEvents;
  } catch (error) {
    console.error("[Search] Error finding containing index events:", error);
    return [];
  }
}
