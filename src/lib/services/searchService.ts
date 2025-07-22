import { searchProfiles } from "$lib/utils/search_utility";
import { checkCommunityStatus } from "$lib/utils/community_checker";
import type { NostrProfile, ProfileSearchResult } from "$lib/utils/search_utility";

export interface SearchServiceOptions {
  debounceMs?: number;
  minSearchLength?: number;
  maxResults?: number;
}

export interface SearchResult {
  profiles: NostrProfile[];
  communityStatus: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
}

export interface DomainSearchStrategy {
  canHandle(searchTerm: string): boolean;
  search(searchTerm: string): Promise<ProfileSearchResult>;
}

class WellKnownDomainStrategy implements DomainSearchStrategy {
  canHandle(searchTerm: string): boolean {
    return searchTerm.startsWith('@') && searchTerm.includes('.');
  }

  async search(searchTerm: string): Promise<ProfileSearchResult> {
    const domain = searchTerm.slice(1); // Remove the @ symbol
    console.log("Searching for users from domain:", domain);
    
    try {
      const wellKnownData = await this.fetchWellKnownData(domain);
      const pubkeys = this.extractPubkeys(wellKnownData);
      
      if (pubkeys.length === 0) {
        console.warn("No pubkeys found in well-known for domain:", domain);
        return this.fallbackSearch(domain);
      }
      
      const profiles = await this.fetchProfilesForPubkeys(pubkeys);
      const communityStatus = await checkCommunityStatus(profiles);
      
      console.log("Successfully fetched profiles for domain:", profiles.length);
      console.log("Community status for domain profiles:", communityStatus);
      
      return { profiles, Status: communityStatus };
    } catch (error) {
      console.error("Error searching profiles from domain:", error);
      return this.fallbackSearch(domain);
    }
  }

  private async fetchWellKnownData(domain: string): Promise<any> {
    const wellKnownUrl = `https://${domain}/.well-known/nostr.json`;
    console.log("Fetching well-known from:", wellKnownUrl);
    
    const response = await fetch(wellKnownUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Well-known not found for domain: ${domain}`);
    }
    
    return await response.json();
  }

  private extractPubkeys(wellKnownData: any): string[] {
    const pubkeys: string[] = [];
    
    if (wellKnownData.names) {
      Object.values(wellKnownData.names).forEach((pubkey: any) => {
        if (typeof pubkey === 'string' && pubkey.length === 64) {
          pubkeys.push(pubkey);
        }
      });
    }
    
    if (wellKnownData.relays) {
      Object.values(wellKnownData.relays).forEach((relayData: any) => {
        if (Array.isArray(relayData)) {
          relayData.forEach((item: any) => {
            if (typeof item === 'string' && item.length === 64) {
              pubkeys.push(item);
            }
          });
        }
      });
    }
    
    // Remove duplicates
    return [...new Set(pubkeys)];
  }

  private async fetchProfilesForPubkeys(pubkeys: string[]): Promise<NostrProfile[]> {
    const profiles: NostrProfile[] = [];
    
    for (const pubkey of pubkeys) {
      try {
        const npub = await this.getNpubFromPubkey(pubkey);
        if (npub) {
          const metadata = await this.getUserMetadata(npub);
          if (metadata) {
            profiles.push({
              ...metadata,
              pubkey: pubkey,
            });
          }
        }
      } catch (error) {
        console.warn("Error fetching profile for pubkey:", pubkey, error);
      }
    }
    
    return profiles;
  }

  private async getNpubFromPubkey(pubkey: string): Promise<string | null> {
    try {
      // This would need to be implemented based on your existing utilities
      // For now, we'll assume the pubkey is already in the correct format
      return pubkey;
    } catch (error) {
      console.error("Error converting pubkey to npub:", error);
      return null;
    }
  }

  private async getUserMetadata(npub: string): Promise<NostrProfile | null> {
    try {
      // This would need to be implemented based on your existing utilities
      // For now, we'll return a basic profile
      return {
        pubkey: npub,
        name: npub.slice(0, 8) + "...",
        displayName: npub.slice(0, 8) + "...",
        picture: undefined,
        nip05: undefined,
      };
    } catch (error) {
      console.error("Error getting user metadata:", error);
      return null;
    }
  }

  private async fallbackSearch(domain: string): Promise<ProfileSearchResult> {
    console.log("Falling back to regular search for domain:", domain);
    const result = await searchProfiles(domain);
    if (result.profiles.length > 0) {
      const communityStatus = await checkCommunityStatus(result.profiles);
      result.Status = communityStatus;
    }
    return result;
  }
}

class UsernameSearchStrategy implements DomainSearchStrategy {
  canHandle(searchTerm: string): boolean {
    return searchTerm.startsWith('@') && !searchTerm.includes('.');
  }

  async search(searchTerm: string): Promise<ProfileSearchResult> {
    const username = searchTerm.slice(1); // Remove the @ symbol
    console.log("Searching for users with username:", username);
    
    const result = await searchProfiles(username);
    
    // Always check community status for username search results
    if (result.profiles.length > 0) {
      const communityStatus = await checkCommunityStatus(result.profiles);
      result.Status = communityStatus;
      console.log("Community status for username search:", communityStatus);
    }
    
    return result;
  }
}

class RegularSearchStrategy implements DomainSearchStrategy {
  canHandle(searchTerm: string): boolean {
    return !searchTerm.startsWith('@');
  }

  async search(searchTerm: string): Promise<ProfileSearchResult> {
    console.log("Performing regular search for:", searchTerm);
    
    const result = await searchProfiles(searchTerm);
    
    // Always check community status for regular search results
    if (result.profiles.length > 0) {
      const communityStatus = await checkCommunityStatus(result.profiles);
      result.Status = communityStatus;
      console.log("Community status for regular search:", communityStatus);
    }
    
    return result;
  }
}

class SearchService {
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentSearchTerm: string = "";
  private options: Required<SearchServiceOptions>;
  private strategies: DomainSearchStrategy[];

  constructor(options: SearchServiceOptions = {}) {
    this.options = {
      debounceMs: options.debounceMs ?? 800,
      minSearchLength: options.minSearchLength ?? 2,
      maxResults: options.maxResults ?? 50,
    };
    
    this.strategies = [
      new WellKnownDomainStrategy(),
      new UsernameSearchStrategy(),
      new RegularSearchStrategy(),
    ];
  }

  /**
   * Search for profiles with debouncing and community status checking
   */
  async searchProfiles(
    searchTerm: string,
    onResults?: (results: SearchResult) => void,
    onLoadingChange?: (isLoading: boolean) => void
  ): Promise<SearchResult> {
    const trimmedTerm = searchTerm.trim();
    
    // Clear existing timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Return early if search term is too short
    if (!trimmedTerm || trimmedTerm.length < this.options.minSearchLength) {
      const emptyResult: SearchResult = {
        profiles: [],
        communityStatus: {},
        isLoading: false,
        error: null,
      };
      onResults?.(emptyResult);
      return emptyResult;
    }

    // Set loading state
    onLoadingChange?.(true);
    this.currentSearchTerm = trimmedTerm;

    return new Promise((resolve) => {
      this.searchTimeout = setTimeout(async () => {
        // Check if search term changed while we were waiting
        if (this.currentSearchTerm !== trimmedTerm) {
          resolve({
            profiles: [],
            communityStatus: {},
            isLoading: false,
            error: null,
          });
          return;
        }

        try {
          console.log("Starting search for:", trimmedTerm);
          
          // Find the appropriate strategy for this search term
          const strategy = this.strategies.find(s => s.canHandle(trimmedTerm));
          if (!strategy) {
            throw new Error("No search strategy found for term: " + trimmedTerm);
          }
          
          const result = await strategy.search(trimmedTerm);
          
          console.log("Search completed, found profiles:", result.profiles.length);
          console.log("Profile details:", result.profiles);
          console.log("Community status:", result.Status);

          // Limit results if needed
          const limitedProfiles = result.profiles.slice(0, this.options.maxResults);

          const searchResult: SearchResult = {
            profiles: limitedProfiles,
            communityStatus: result.Status,
            isLoading: false,
            error: null,
          };

          onResults?.(searchResult);
          resolve(searchResult);

        } catch (error) {
          console.error("Error searching profiles:", error);
          const errorResult: SearchResult = {
            profiles: [],
            communityStatus: {},
            isLoading: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
          };
          onResults?.(errorResult);
          resolve(errorResult);
        } finally {
          onLoadingChange?.(false);
        }
      }, this.options.debounceMs);
    });
  }

  /**
   * Cancel any pending search
   */
  cancelSearch(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
  }

  /**
   * Update search options
   */
  updateOptions(options: Partial<SearchServiceOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Add a custom search strategy
   */
  addStrategy(strategy: DomainSearchStrategy): void {
    this.strategies.push(strategy);
  }
}

// Create a singleton instance
export const searchService = new SearchService();

// Export the class for custom instances
export { SearchService }; 