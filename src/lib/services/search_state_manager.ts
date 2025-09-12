/**
 * Service class for managing search state operations
 * AI-NOTE:  Extracted from EventSearch component for better separation of concerns
 */
export class SearchStateManager {
  /**
   * Updates the search state with new values
   */
  updateSearchState(
    state: {
      searching: boolean;
      searchCompleted: boolean;
      searchResultCount: number | null;
      searchResultType: string | null;
    },
    onLoadingChange?: (loading: boolean) => void,
  ): void {
    if (onLoadingChange) {
      onLoadingChange(state.searching);
    }
  }

  /**
   * Resets all search state to initial values
   */
  resetSearchState(callbacks: {
    onSearchResults: (
      events: any[],
      secondOrder: any[],
      tTagEvents: any[],
      eventIds: Set<string>,
      addresses: Set<string>,
    ) => void;
    cleanupSearch: () => void;
    clearTimeout: () => void;
  }): void {
    callbacks.cleanupSearch();
    callbacks.onSearchResults([], [], [], new Set(), new Set());
    callbacks.clearTimeout();
  }

  /**
   * Handles search errors with consistent error handling
   */
  handleSearchError(
    error: unknown,
    defaultMessage: string,
    callbacks: {
      setLocalError: (error: string | null) => void;
      cleanupSearch: () => void;
      updateSearchState: (state: any) => void;
      resetProcessingFlags: () => void;
    },
  ): void {
    const errorMessage =
      error instanceof Error ? error.message : defaultMessage;
    callbacks.setLocalError(errorMessage);
    callbacks.cleanupSearch();
    callbacks.updateSearchState({
      searching: false,
      searchCompleted: false,
      searchResultCount: null,
      searchResultType: null,
    });
    callbacks.resetProcessingFlags();
  }
}
