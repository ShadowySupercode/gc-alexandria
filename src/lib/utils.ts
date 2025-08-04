import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { getMatchingTags } from "./utils/nostrUtils.ts";
import type { AddressPointer, EventPointer } from "nostr-tools/nip19";
import type { NostrEvent } from "./utils/websocket_utils.ts";

export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecodeError";
  }
}

export class InvalidKindError extends DecodeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKindError";
  }
}

export function neventEncode(event: NDKEvent, relays: string[]) {
  return nip19.neventEncode({
    id: event.id,
    kind: event.kind,
    relays,
    author: event.pubkey,
  });
}

export function naddrEncode(event: NDKEvent, relays: string[]) {
  const dTag = getMatchingTags(event, "d")[0]?.[1];
  if (!dTag) {
    throw new Error("Event does not have a d tag");
  }

  return nip19.naddrEncode({
    identifier: dTag,
    pubkey: event.pubkey,
    kind: event.kind || 0,
    relays,
  });
}

/**
 * Creates a tag address from a raw Nostr event (for compatibility with NDK events)
 * @param event The raw Nostr event
 * @param relays Optional relay list for the address
 * @returns A tag address string
 */
export function createTagAddress(event: NostrEvent, relays: string[] = []): string {
  const dTag = event.tags.find((tag: string[]) => tag[0] === "d")?.[1];
  if (!dTag) {
    throw new Error("Event does not have a d tag");
  }

  return nip19.naddrEncode({
    identifier: dTag,
    pubkey: event.pubkey,
    kind: event.kind,
    relays,
  });
}

export function nprofileEncode(pubkey: string, relays: string[]) {
  return nip19.nprofileEncode({ pubkey, relays });
}

/**
 * Decodes a nostr identifier (naddr, nevent) and returns the decoded data.
 * @param identifier The nostr identifier to decode.
 * @param expectedType The expected type of the decoded data ('naddr' or 'nevent').
 * @returns The decoded data.
 */
function decodeNostrIdentifier<T extends AddressPointer | EventPointer>(
  identifier: string,
  expectedType: "naddr" | "nevent",
): T {
  try {
    if (!identifier.startsWith(expectedType)) {
      throw new InvalidKindError(`Invalid ${expectedType} format`);
    }
    const decoded = nip19.decode(identifier);
    if (decoded.type !== expectedType) {
      throw new InvalidKindError(`Decoded result is not an ${expectedType}`);
    }
    return decoded.data as T;
  } catch (error) {
    throw new DecodeError(`Failed to decode ${expectedType}: ${error}`);
  }
}

/**
 * Decodes an naddr identifier and returns the decoded data
 */
export function naddrDecode(naddr: string): AddressPointer {
  return decodeNostrIdentifier<AddressPointer>(naddr, "naddr");
}

/**
 * Decodes an nevent identifier and returns the decoded data
 */
export function neventDecode(nevent: string): EventPointer {
  return decodeNostrIdentifier<EventPointer>(nevent, "nevent");
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
      (globalThis.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (globalThis.innerWidth || document.documentElement.clientWidth)
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
  events.forEach((event) => {
    // Index events have no content, and they must have `title`, `d`, and `e` tags.
    if (
      (event.content != null && event.content.length > 0) ||
      getMatchingTags(event, "title").length === 0 ||
      getMatchingTags(event, "d").length === 0 ||
      (getMatchingTags(event, "a").length === 0 &&
        getMatchingTags(event, "e").length === 0)
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
  predicate: (element: T, index: number, array: T[]) => Promise<boolean>,
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
      predicate: (element: T, index: number, array: T[]) => Promise<boolean>,
    ): Promise<number>;
  }
}

Array.prototype.findIndexAsync = function <T>(
  this: T[],
  predicate: (element: T, index: number, array: T[]) => Promise<boolean>,
): Promise<number> {
  return findIndexAsync(this, predicate);
};

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced version of the function
 */
// deno-lint-ignore no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = undefined;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Creates a debounced async function that delays invoking func until after wait milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * @param func The async function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced version of the async function
 */
export function debounceAsync(
  func: (query: string) => Promise<void>,
  wait: number,
): (query: string) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return function executedFunction(query: string) {
    const later = () => {
      timeout = undefined;
      func(query);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}
