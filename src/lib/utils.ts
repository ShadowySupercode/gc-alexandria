import type { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

/**
 * Encodes a Nostr event into a specified format (nevent or naddr)
 * @param event The NDKEvent to encode
 * @param relays The relays to include in the encoded ID
 * @param format The format to encode to ('nevent' or 'naddr')
 * @returns The encoded ID string
 */
export function encodeNostrId(event: NDKEvent, relays: string[], format: 'nevent' | 'naddr' = 'nevent'): string {
  if (format === 'naddr') {
    const dTag = event.getMatchingTags('d')[0]?.[1];
    if (!dTag) {
      throw new Error('Event does not have a d tag');
    }
    
    return nip19.naddrEncode({
      identifier: dTag,
      pubkey: event.pubkey,
      kind: event.kind || 0,
      relays,
    });
  } else {
    return nip19.neventEncode({
      id: event.id,
      kind: event.kind,
      relays,
      author: event.pubkey,
    });
  }
}

// Legacy functions for backward compatibility
export function neventEncode(event: NDKEvent, relays: string[]) {
  return encodeNostrId(event, relays, 'nevent');
}

export function naddrEncode(event: NDKEvent, relays: string[]) {
  return encodeNostrId(event, relays, 'naddr');
}

export function formatDate(unixtimestamp: number) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const date = new Date(unixtimestamp * 1000);
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  const formattedDate = `${day} ${month} ${year}`;
  return formattedDate;
}

let serial = 0;

export function next(): number {
  serial++;
  return serial;
}

export function scrollTabIntoView(el: string | HTMLElement, wait: boolean) {
  function scrollTab() {
    const element =
      typeof el === "string"
        ? document.querySelector(`[id^="wikitab-v0-${el}"]`)
        : el;
    if (!element) return;

    element.scrollIntoView({
      behavior: "smooth",
      inline: "start",
    });
  }

  if (wait) {
    setTimeout(() => {
      scrollTab();
    }, 1);
  } else {
    scrollTab();
  }
}

export function isElementInViewport(el: string | HTMLElement) {
  const element =
    typeof el === "string"
      ? document.querySelector(`[id^="wikitab-v0-${el}"]`)
      : el;
  if (!element) return;

  const rect = element.getBoundingClientRect();

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * Removes `kind: 30040` index events that don't comply with the NKBIP-01 specification.
 * @param events A set of events.
 * @returns The filtered set of events.
 */
export function filterValidIndexEvents(events: Set<NDKEvent>): Set<NDKEvent> {
  // The filter object supports only limited parameters, so we need to filter out events that
  // don't respect NKBIP-01.
  events.forEach(event => {
    // Index events have no content, and they must have `title`, `d`, and `e` tags.
    if (
      (event.content != null && event.content.length > 0)
      || event.getMatchingTags('title').length === 0
      || event.getMatchingTags('d').length === 0
      || (
        event.getMatchingTags('a').length === 0
        && event.getMatchingTags('e').length === 0
      )
    ) {
      events.delete(event);
    }
  });

  console.debug(`Filtered index events: ${events.size} events remaining.`);
  return events;
}

/**
 * Async version of Array.findIndex() that runs sequentially.
 * Returns the index of the first element that satisfies the provided testing function.
 * @param array The array to search
 * @param predicate The async testing function
 * @returns A promise that resolves to the index of the first matching element, or -1 if none found
 */
export async function findIndexAsync<T>(
  array: T[],
  predicate: (element: T, index: number, array: T[]) => Promise<boolean>
): Promise<number> {
  for (let i = 0; i < array.length; i++) {
    if (await predicate(array[i], i, array)) {
      return i;
    }
  }
  return -1;
}

// Extend Array prototype with findIndexAsync
declare global {
  interface Array<T> {
    findIndexAsync(
      predicate: (element: T, index: number, array: T[]) => Promise<boolean>
    ): Promise<number>;
  }
}

Array.prototype.findIndexAsync = function<T>(
  this: T[],
  predicate: (element: T, index: number, array: T[]) => Promise<boolean>
): Promise<number> {
  return findIndexAsync(this, predicate);
};

/**
 * Decodes various Nostr ID formats (hex ID, nevent, naddr) and returns an appropriate filter.
 * @param id The ID to decode (hex ID, nevent, or naddr)
 * @returns An NDKFilter object that can be used with ndk.fetchEvent, or null if decoding fails
 */
export function decodeNostrId(id: string): NDKFilter | null {
  try {
    // Check if it's a bech32-encoded ID (nevent or naddr)
    if (id.startsWith('nevent') || id.startsWith('naddr') || id.startsWith('note')) {
      const decoded = nip19.decode(id);
      
      // Handle different types of bech32 encodings
      if (decoded.type === 'naddr') {
        const data = decoded.data;
        return {
          kinds: [data.kind],
          authors: [data.pubkey],
          '#d': [data.identifier]
        };
      } else if (decoded.type === 'nevent') {
        const data = decoded.data;
        return {
          ids: [data.id],
          ...(data.author ? { authors: [data.author] } : {})
        };
      } else if (decoded.type === 'note') {
        // Simple note ID
        return { ids: [decoded.data] };
      }
    }
    
    // If it's not a bech32 ID or we couldn't decode it properly,
    // assume it's a hex ID
    if (/^[0-9a-f]{64}$/.test(id)) {
      return { ids: [id] };
    }
    
    // If we get here, we couldn't decode the ID
    console.warn(`Could not decode Nostr ID: ${id}`);
    return null;
  } catch (e) {
    console.error('Failed to decode Nostr ID:', e);
    return null;
  }
}

/**
 * A utility function to safely fetch events from NDK.
 * This function handles different types of filters and ensures that undefined values
 * are properly handled to avoid TypeScript errors.
 * 
 * @param ndk The NDK instance to use for fetching
 * @param filter The filter to use (string ID, NDKFilter object, or array of filters)
 * @param options Optional fetch options
 * @param relaySet Optional relay set to use for fetching
 * @returns The fetched event, or null if not found
 */
export async function fetchEventSafely(
  ndk: any,
  filter: string | Record<string, any> | Array<Record<string, any>>,
  options?: any,
  relaySet?: any
): Promise<any> {
  try {
    // If filter is a string or already properly formatted, pass it directly
    if (typeof filter === 'string' || Array.isArray(filter)) {
      return await ndk.fetchEvent(filter, options, relaySet);
    }
    
    // If filter is an object, create a clean copy without undefined values
    const cleanFilter: Record<string, any> = {};
    
    // Copy all properties except those with undefined values
    for (const [key, value] of Object.entries(filter)) {
      // Handle tag properties (starting with #)
      if (key.startsWith('#')) {
        // Only add tag arrays if they contain defined values
        if (Array.isArray(value)) {
          const definedValues = value.filter(v => v !== undefined);
          if (definedValues.length > 0) {
            cleanFilter[key] = definedValues;
          }
        } else if (value !== undefined) {
          cleanFilter[key] = [value];
        }
      } 
      // Handle regular properties
      else if (value !== undefined) {
        cleanFilter[key] = value;
      }
    }
    
    return await ndk.fetchEvent(cleanFilter, options, relaySet);
  } catch (error) {
    console.error('Error fetching event:', error);
    return null;
  }
}