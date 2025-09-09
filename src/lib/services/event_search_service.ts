/**
 * Service class for handling event search operations
 * AI-NOTE:  Extracted from EventSearch component for better separation of concerns
 */
export class EventSearchService {
  /**
   * Determines the search type from a query string
   */
  getSearchType(query: string): { type: string; term: string } | null {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.startsWith("d:")) {
      const dTag = query.slice(2).trim().toLowerCase();
      return dTag ? { type: "d", term: dTag } : null;
    }

    if (lowerQuery.startsWith("t:")) {
      const searchTerm = query.slice(2).trim();
      return searchTerm ? { type: "t", term: searchTerm } : null;
    }

    if (lowerQuery.startsWith("n:")) {
      const searchTerm = query.slice(2).trim();
      return searchTerm ? { type: "n", term: searchTerm } : null;
    }

    if (query.includes("@")) {
      return { type: "nip05", term: query };
    }

    return null;
  }

  /**
   * Checks if a search value matches the current event
   */
  isCurrentEventMatch(
    searchValue: string,
    event: any,
    relays: string[],
  ): boolean {
    const currentEventId = event.id;
    let currentNaddr = null;
    let currentNevent = null;
    let currentNpub = null;
    let currentNprofile = null;

    try {
      const { neventEncode, naddrEncode, nprofileEncode } = require(
        "$lib/utils",
      );
      const { getMatchingTags, toNpub } = require("$lib/utils/nostrUtils");

      currentNevent = neventEncode(event, relays);
    } catch {}

    try {
      const { naddrEncode } = require("$lib/utils");
      const { getMatchingTags } = require("$lib/utils/nostrUtils");

      currentNaddr = getMatchingTags(event, "d")[0]?.[1]
        ? naddrEncode(event, relays)
        : null;
    } catch {}

    try {
      const { toNpub } = require("$lib/utils/nostrUtils");
      currentNpub = event.kind === 0 ? toNpub(event.pubkey) : null;
    } catch {}

    if (
      searchValue &&
      searchValue.startsWith("nprofile1") &&
      event.kind === 0
    ) {
      try {
        const { nprofileEncode } = require("$lib/utils");
        currentNprofile = nprofileEncode(event.pubkey, relays);
      } catch {}
    }

    return (
      searchValue === currentEventId ||
      (currentNaddr && searchValue === currentNaddr) ||
      (currentNevent && searchValue === currentNevent) ||
      (currentNpub && searchValue === currentNpub) ||
      (currentNprofile && searchValue === currentNprofile)
    );
  }
}
