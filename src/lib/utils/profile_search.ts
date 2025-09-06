import { activeInboxRelays, activeOutboxRelays } from "../ndk.ts";
import { getNpubFromNip05, getUserMetadata, fetchEventWithFallback } from "./nostrUtils.ts";
import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { searchCache } from "./searchCache.ts";
import { communityRelays, searchRelays, secondaryRelays, anonymousRelays } from "../consts.ts";
import { get } from "svelte/store";
import type { NostrProfile, ProfileSearchResult } from "./search_types.ts";
import {
  createProfileFromEvent,
  fieldMatches,
  nip05Matches,
  normalizeSearchTerm,
} from "./search_utils.ts";
import { nip19 } from "nostr-tools";
import { parseProfileContent } from "./profile_parsing";
import { unifiedProfileCache } from "./npubCache.ts";

/**
 * Search for profiles by various criteria (display name, name, NIP-05, npub)
 * Returns NDKEvent objects with profile data attached
 */
export async function searchProfiles(
  searchTerm: string,
  ndk: NDK,
): Promise<ProfileSearchResult> {
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);

  console.log(
    "searchProfiles called with:",
    searchTerm,
    "normalized:",
    normalizedSearchTerm,
  );

  // Check cache first
  const cachedResult = searchCache.get("profile", normalizedSearchTerm);
  if (cachedResult) {
    console.log("Found cached result for:", normalizedSearchTerm);
    
    // AI-NOTE: For profile searches, resolve identifiers to actual events from UnifiedProfileCache
    const resolvedResult = searchCache.resolveProfileEvents(cachedResult);
    
    // Validate that we have complete events with id fields
    const hasIncompleteEvents = resolvedResult.events.some(event => 
      !event.id || event.id === "" || !event.pubkey || !event.content
    );
    
    if (hasIncompleteEvents) {
      console.log("Cached profile events are incomplete (missing id or other critical fields), requerying relays...");
      // Clear the incomplete cache entry
      searchCache.clear(); // Clear all cache to force fresh fetch
    } else {
      // Process the cached events
      const events = resolvedResult.events
        .map((event) => {
          try {
            console.log("Processing cached event:", event.pubkey, "kind:", event.kind, "id:", event.id);
            const profileData = parseProfileContent(event);
            if (!profileData) {
              console.log("Failed to parse profile data for event:", event.pubkey);
              return null;
            }
            const profile = createProfileFromEvent(event, profileData);
            // AI-NOTE: Attach profile data to the original NDKEvent object
            (event as any).profileData = profile;
            console.log("Attached profile data to cached event:", event.pubkey);
            return event;
          } catch (error) {
            console.warn("Error processing cached event:", event.pubkey, error);
            return null;
          }
        })
        .filter(Boolean) as NDKEvent[];

      console.log("Cached profile events found:", events.length);
      return { profiles: events, Status: {} };
    }
  }

  if (!ndk) {
    console.error("NDK not initialized");
    throw new Error("NDK not initialized");
  }

  console.log("NDK initialized, starting search logic");

  let foundProfiles: NDKEvent[] = [];

  try {
    // Check if it's a valid npub/nprofile first
    if (
      normalizedSearchTerm.startsWith("npub") ||
      normalizedSearchTerm.startsWith("nprofile")
    ) {
      try {
        const metadata = await getUserMetadata(normalizedSearchTerm, ndk);
        if (metadata) {
          // Get the original event from the cache
          const originalEvent = unifiedProfileCache.getCachedEvent(normalizedSearchTerm);
          if (originalEvent) {
            // Attach profile data to the original event
            (originalEvent as any).profileData = metadata;
            foundProfiles = [originalEvent];
          }
        }
      } catch (error) {
        console.error("Error fetching metadata for npub:", error);
      }
    } else if (normalizedSearchTerm.includes("@")) {
      // Check if it's a NIP-05 address - normalize it properly
      const normalizedNip05 = normalizedSearchTerm.toLowerCase();
      try {
        const npub = await getNpubFromNip05(normalizedNip05);
        if (npub) {
          const metadata = await getUserMetadata(npub, ndk);
          
          // Get the original event from the cache
          const originalEvent = unifiedProfileCache.getCachedEvent(npub);
          if (originalEvent) {
            // Attach profile data to the original event
            (originalEvent as any).profileData = metadata;
            foundProfiles = [originalEvent];
          }
        }
      } catch (e) {
        console.error("[Search] NIP-05 lookup failed:", e);
      }
    } else {
      // Try NIP-05 search first (faster than relay search)
      console.log("Starting NIP-05 search for:", normalizedSearchTerm);
      foundProfiles = await searchNip05Domains(normalizedSearchTerm, ndk);
      console.log(
        "NIP-05 search completed, found:",
        foundProfiles.length,
        "profiles",
      );

      // If no NIP-05 results, try quick relay search
      if (foundProfiles.length === 0) {
        console.log("No NIP-05 results, trying quick relay search");
        foundProfiles = await quickRelaySearch(normalizedSearchTerm, ndk);
        console.log(
          "Quick relay search completed, found:",
          foundProfiles.length,
          "profiles",
        );
      }
    }

    // Cache the results using centralized approach
    if (foundProfiles.length > 0) {
      // AI-NOTE: Store profile identifiers instead of duplicating events
      // This eliminates redundancy by using UnifiedProfileCache as the single source of truth
      const profileIdentifiers: string[] = [];
      
      for (const profile of foundProfiles) {
        if (profile.pubkey) {
          // Ensure the profile is cached in UnifiedProfileCache with complete event data
          try {
            // Get or fetch the complete event with id field
            let originalEvent = unifiedProfileCache.getCachedEvent(profile.pubkey);
            
            if (!originalEvent || !originalEvent.id) {
              // Fetch the original event to ensure we have complete data including id
              const fetchedEvent = await fetchEventWithFallback(ndk, {
                kinds: [0],
                authors: [profile.pubkey],
              });
              originalEvent = fetchedEvent || undefined;
              
              if (originalEvent && originalEvent.id) {
                // Update the unified cache with the complete event
                const profileData = parseProfileContent(originalEvent);
                if (profileData) {
                  const completeProfile = createProfileFromEvent(originalEvent, profileData);
                  unifiedProfileCache.set(profile.pubkey, completeProfile, profile.pubkey, originalEvent.relay?.url);
                  // Update the cache entry with the original event
                  unifiedProfileCache.updateOriginalEvent(profile.pubkey, originalEvent);
                }
              }
            }
            
            if (originalEvent && originalEvent.id) {
              profileIdentifiers.push(profile.pubkey);
              console.log("Cached profile identifier:", profile.pubkey, "with event id:", originalEvent.id);
            }
          } catch (error) {
            console.warn("Error ensuring profile is cached:", profile.pubkey, error);
          }
        }
      }

      // Store search result with profile identifiers instead of duplicating events
      const result = {
        events: [], // Empty events array - will be resolved from UnifiedProfileCache
        secondOrder: [],
        tTagEvents: [],
        eventIds: new Set<string>(),
        addresses: new Set<string>(),
        searchType: "profile",
        searchTerm: normalizedSearchTerm,
        profileIdentifiers, // Store identifiers to resolve from UnifiedProfileCache
      };
      searchCache.set("profile", normalizedSearchTerm, result);
      console.log("Cached", profileIdentifiers.length, "profile identifiers for search term:", normalizedSearchTerm);
    }

    console.log("Search completed, found profiles:", foundProfiles.length);
    return { profiles: foundProfiles, Status: {} };
  } catch (error) {
    console.error("Error searching profiles:", error);
    return { profiles: [], Status: {} };
  }
}

/**
 * Search for NIP-05 addresses across common domains
 */
async function searchNip05Domains(
  searchTerm: string,
  ndk: NDK,
): Promise<NDKEvent[]> {
  const foundProfiles: NDKEvent[] = [];

  // Enhanced list of common domains for NIP-05 lookups
  // Prioritize gitcitadel.com since we know it has profiles
  const commonDomains = [
    "gitcitadel.com", // Prioritize this domain
    "theforest.nostr1.com",
    "nostr1.com",
    "nostr.land",
    "sovbit.host",
    "damus.io",
    "snort.social",
    "iris.to",
    "coracle.social",
    "nostr.band",
    "nostr.wine",
    "purplepag.es",
    "relay.noswhere.com",
    "aggr.nostr.land",
    "nostr.sovbit.host",
    "freelay.sovbit.host",
    "nostr21.com",
    "greensoul.space",
    "relay.damus.io",
    "relay.nostr.band",
  ];

  // Normalize the search term for NIP-05 lookup
  const normalizedSearchTerm = searchTerm.toLowerCase().trim();
  console.log("NIP-05 search: normalized search term:", normalizedSearchTerm);

  // Try gitcitadel.com first with extra debugging
  const gitcitadelAddress = `${normalizedSearchTerm}@gitcitadel.com`;
  console.log("NIP-05 search: trying gitcitadel.com first:", gitcitadelAddress);
  try {
    const npub = await getNpubFromNip05(gitcitadelAddress);
    if (npub) {
      console.log(
        "NIP-05 search: SUCCESS! found npub for gitcitadel.com:",
        npub,
      );
      const metadata = await getUserMetadata(npub, ndk);
      
      // Get the original event from the cache
      const originalEvent = unifiedProfileCache.getCachedEvent(npub);
      if (originalEvent) {
        // Attach profile data to the original event
        (originalEvent as any).profileData = metadata;
        console.log(
          "NIP-05 search: found original event for gitcitadel.com:",
          originalEvent.id,
        );
        foundProfiles.push(originalEvent);
        return foundProfiles; // Return immediately if we found it on gitcitadel.com
      }
    } else {
      console.log("NIP-05 search: no npub found for gitcitadel.com");
    }
  } catch (e) {
    console.log("NIP-05 search: error for gitcitadel.com:", e);
  }

  // If gitcitadel.com didn't work, try other domains
  console.log("NIP-05 search: gitcitadel.com failed, trying other domains...");
  const otherDomains = commonDomains.filter(
    (domain) => domain !== "gitcitadel.com",
  );

  // Search all other domains in parallel with timeout
  const searchPromises = otherDomains.map(async (domain) => {
    const nip05Address = `${normalizedSearchTerm}@${domain}`;
    console.log("NIP-05 search: trying address:", nip05Address);
    try {
      const npub = await getNpubFromNip05(nip05Address);
      if (npub) {
        console.log("NIP-05 search: found npub for", nip05Address, ":", npub);
        const metadata = await getUserMetadata(npub, ndk);
        
        // AI-NOTE:  Fetch the original event timestamp to preserve created_at
        let created_at: number | undefined = undefined;
        try {
          const decoded = nip19.decode(npub);
          if (decoded.type === "npub") {
            const pubkey = decoded.data as string;
            const originalEvent = await fetchEventWithFallback(ndk, {
              kinds: [0],
              authors: [pubkey],
            });
            if (originalEvent && originalEvent.created_at) {
              created_at = originalEvent.created_at;
            }
          }
        } catch (e) {
          console.warn("profile_search: Failed to fetch original event timestamp:", e);
        }
        
        const profile: NostrProfile & { created_at?: number } = {
          ...metadata,
          pubkey: npub,
          created_at: created_at,
        };
        console.log(
          "NIP-05 search: created profile for",
          nip05Address,
          ":",
          profile,
        );
        return profile;
      } else {
        console.log("NIP-05 search: no npub found for", nip05Address);
      }
    } catch (e) {
      console.log("NIP-05 search: error for", nip05Address, ":", e);
      // Continue to next domain
    }
    return null;
  });

  // Wait for all searches with timeout
  const results = await Promise.allSettled(searchPromises);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value && Array.isArray(result.value)) {
      foundProfiles.push(...result.value);
    }
  }

  console.log("NIP-05 search: total profiles found:", foundProfiles.length);
  return foundProfiles;
}

/**
 * Search for profiles across all available relays
 */
async function quickRelaySearch(
  searchTerm: string,
  ndk: NDK,
): Promise<NDKEvent[]> {
  console.log("quickRelaySearch called with:", searchTerm);

  // Normalize the search term for relay search
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);
  console.log("Normalized search term for relay search:", normalizedSearchTerm);

  // AI-NOTE:  Use ALL available relays for comprehensive profile discovery
  // This ensures we don't miss profiles due to stale cache or limited relay coverage
  
  // Get all available relays from NDK pool (most comprehensive)
  const poolRelays = Array.from(ndk.pool.relays.values()).map((r: any) => r.url) as string[];
  const userInboxRelays = get(activeInboxRelays);
  const userOutboxRelays = get(activeOutboxRelays);
  
  // Combine ALL available relays for maximum coverage
  const allRelayUrls = [
    ...(poolRelays || []), // All NDK pool relays
    ...(userInboxRelays || []), // User's personal inbox relays
    ...(userOutboxRelays || []), // User's personal outbox relays
    ...(searchRelays || []), // Dedicated profile search relays
    ...(communityRelays || []), // Community relays
    ...(secondaryRelays || []), // Secondary relays as fallback
    ...(anonymousRelays || []), // Anonymous relays as additional fallback
  ];

  // Deduplicate relay URLs
  const uniqueRelayUrls = [...new Set(allRelayUrls)];
  console.log("Using ALL available relays for profile search:", uniqueRelayUrls);
  console.log("Total relays for profile search:", uniqueRelayUrls.length);

  // Create relay sets for parallel search
  const relaySets = uniqueRelayUrls
    .map((url) => {
      try {
        return NDKRelaySet.fromRelayUrls([url], ndk);
      } catch (e) {
        console.warn(`Failed to create relay set for ${url}:`, e);
        return null;
      }
    })
    .filter(Boolean);

  console.log("Created relay sets for profile search:", relaySets.length);

  // Search all relays in parallel with short timeout
  const searchPromises = relaySets.map((relaySet, index) => {
    if (!relaySet) return Promise.resolve([]);

    return new Promise<NDKEvent[]>((resolve) => {
      const foundInRelay: NDKEvent[] = [];
      let eventCount = 0;

      console.log(
        `Starting search on relay ${index + 1}: ${uniqueRelayUrls[index]}`,
      );

      const sub = ndk.subscribe(
        { kinds: [0] },
        { closeOnEose: true },
        relaySet,
      );

      sub.on("event", (event: NDKEvent) => {
        eventCount++;
        try {
          // AI-NOTE: Handle both content and tags for profile events with proper aggregation
          const profileData = parseProfileContent(event);
          if (!profileData) {
            return;
          }
          
          // Check if any field matches the search term using normalized comparison
          const matchesDisplay_name = fieldMatches(profileData.display_name, normalizedSearchTerm);
          const matchesName = fieldMatches(profileData.name, normalizedSearchTerm);
          const matchesNip05 = nip05Matches(profileData.nip05, normalizedSearchTerm);
          const matchesAbout = fieldMatches(profileData.about, normalizedSearchTerm);

          if (
            matchesDisplay_name ||
            matchesName ||
            matchesNip05 ||
            matchesAbout
          ) {
            console.log(`Found matching profile on relay ${index + 1}:`, {
              name: profileData.name,
              display_name: profileData.display_name,
              nip05: profileData.nip05,
              pubkey: event.pubkey,
              searchTerm: normalizedSearchTerm,
              relay: uniqueRelayUrls[index],
            });
            const profile = createProfileFromEvent(event, profileData);

            // Check if we already have this profile in this relay
            const existingIndex = foundInRelay.findIndex(
              (p) => p.pubkey === event.pubkey,
            );
            if (existingIndex === -1) {
              // AI-NOTE: Attach profile data to the original NDKEvent object
              // so that EventDetails component can access both the event data and profile data
              (event as any).profileData = profile;
              foundInRelay.push(event);
            }
          }
        } catch {
          // Invalid JSON or other error, skip
        }
      });

      sub.on("eose", () => {
        console.log(
          `Relay ${index + 1} (${
            uniqueRelayUrls[index]
          }) search completed, processed ${eventCount} events, found ${foundInRelay.length} matches`,
        );
        resolve(foundInRelay);
      });

      // Short timeout for quick search
      setTimeout(() => {
        console.log(
          `Relay ${index + 1} (${
            uniqueRelayUrls[index]
          }) search timed out after 1.5s, processed ${eventCount} events, found ${foundInRelay.length} matches`,
        );
        sub.stop();
        resolve(foundInRelay);
      }, 1500); // 1.5 second timeout per relay
    });
  });

  // Wait for all searches to complete
  const results = await Promise.allSettled(searchPromises);

  // Combine and deduplicate results
  const allEvents: Record<string, NDKEvent> = {};

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const event of result.value) {
        if (event.pubkey) {
          allEvents[event.pubkey] = event;
        }
      }
    }
  }

  console.log(
    `Total unique profile events found: ${Object.keys(allEvents).length}`,
  );
  return Object.values(allEvents);
}

/**
 * Search for profiles by various criteria (display name, name, NIP-05, npub)
 * Returns NostrProfile objects for use in components like CommentBox
 */
export async function searchProfilesForMentions(
  searchTerm: string,
  ndk: NDK,
): Promise<{ profiles: NostrProfile[]; Status: Record<string, boolean> }> {
  // Use the main searchProfiles function to get events with profile data
  const result = await searchProfiles(searchTerm, ndk);
  
  // Extract profile data from the events
  const profiles: NostrProfile[] = result.profiles
    .map((event) => (event as any).profileData)
    .filter(Boolean);
  
  return { profiles, Status: result.Status };
}
