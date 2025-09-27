/**
 * Utility class for formatting search result messages
 * AI-NOTE: 2025-01-24 - Extracted from EventSearch component for better separation of concerns
 */
export class SearchResultFormatter {
  /**
   * Formats a result message based on search count and type
   */
  formatResultMessage(
    searchResultCount: number | null,
    searchResultType: string | null,
  ): string {
    if (searchResultCount === 0) {
      return "Search completed. No results found.";
    }

    const typeLabel = searchResultType === "n"
      ? "profile"
      : searchResultType === "nip05"
      ? "NIP-05 address"
      : "event";
    const countLabel = searchResultType === "n" ? "profiles" : "events";

    return searchResultCount === 1
      ? `Search completed. Found 1 ${typeLabel}.`
      : `Search completed. Found ${searchResultCount} ${countLabel}.`;
  }
}
