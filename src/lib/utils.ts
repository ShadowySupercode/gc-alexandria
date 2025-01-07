import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

export function neventEncode(event: NDKEvent, relays: string[]) {
  return nip19.neventEncode({
    id: event.id,
    kind: event.kind,
    relays,
    author: event.pubkey,
  });
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
