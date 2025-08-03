import { ndkInstance } from "../ndk.ts";
import { getUserMetadata, getNpubFromNip05 } from "./nostrUtils.ts";
import NDK, { NDKRelaySet, NDKEvent } from "@nostr-dev-kit/ndk";
import { searchCache } from "./searchCache.ts";
import { communityRelays, secondaryRelays } from "../consts.ts";
import { get } from "svelte/store";
import type { NostrProfile, ProfileSearchResult } from "./search_types.ts";
import {
  fieldMatches,
  nip05Matches,
  normalizeSearchTerm,
  createProfileFromEvent,
} from "./search_utils.ts";

/**
 * Search for profiles by various criteria (display name, name, NIP-05, npub)
 */
export async function searchProfiles(
  searchTerm: string,
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
    const profiles = cachedResult.events
      .map((event) => {
        try {
          const profileData = JSON.parse(event.content);
          return createProfileFromEvent(event, profileData);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as NostrProfile[];

    console.log("Cached profiles found:", profiles.length);
    return { profiles, Status: {} };
  }

  const ndk = get(ndkInstance);
  if (!ndk) {
    console.error("NDK not initialized");
    throw new Error("NDK not initialized");
  }

  console.log("NDK initialized, starting search logic");

  let foundProfiles: NostrProfile[] = [];

  try {
    // Check if it's a valid npub/nprofile first
    if (
      normalizedSearchTerm.startsWith("npub") ||
      normalizedSearchTerm.startsWith("nprofile")
    ) {
      try {
        const metadata = await getUserMetadata(normalizedSearchTerm);
        if (metadata) {
          foundProfiles = [metadata];
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
          const metadata = await getUserMetadata(npub);
          const profile: NostrProfile = {
            ...metadata,
            pubkey: npub,
          };
          foundProfiles = [profile];
        }
      } catch (e) {
        console.error("[Search] NIP-05 lookup failed:", e);
      }
    } else {
      // Try NIP-05 search first (faster than relay search)
      console.log("Starting NIP-05 search for:", normalizedSearchTerm);
      foundProfiles = await searchNip05Domains(normalizedSearchTerm);
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

    // Cache the results
    if (foundProfiles.length > 0) {
      const events = foundProfiles.map((profile) => {
        const event = new NDKEvent(ndk);
        event.content = JSON.stringify(profile);
        event.pubkey = profile.pubkey || "";
        return event;
      });

      const result = {
        events,
        secondOrder: [],
        tTagEvents: [],
        eventIds: new Set<string>(),
        addresses: new Set<string>(),
        searchType: "profile",
        searchTerm: normalizedSearchTerm,
      };
      searchCache.set("profile", normalizedSearchTerm, result);
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
): Promise<NostrProfile[]> {
  const foundProfiles: NostrProfile[] = [];

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
      const metadata = await getUserMetadata(npub);
      const profile: NostrProfile = {
        ...metadata,
        pubkey: npub,
      };
      console.log(
        "NIP-05 search: created profile for gitcitadel.com:",
        profile,
      );
      foundProfiles.push(profile);
      return foundProfiles; // Return immediately if we found it on gitcitadel.com
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
        const metadata = await getUserMetadata(npub);
        const profile: NostrProfile = {
          ...metadata,
          pubkey: npub,
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
    if (result.status === "fulfilled" && result.value) {
      foundProfiles.push(result.value);
    }
  }

  console.log("NIP-05 search: total profiles found:", foundProfiles.length);
  return foundProfiles;
}

/**
 * Quick relay search with short timeout
 */
async function quickRelaySearch(
  searchTerm: string,
  ndk: NDK,
): Promise<NostrProfile[]> {
  console.log("quickRelaySearch called with:", searchTerm);

  // Normalize the search term for relay search
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);
  console.log("Normalized search term for relay search:", normalizedSearchTerm);

  // Use all profile relays for better coverage
      const quickRelayUrls = [...communityRelays, ...secondaryRelays]; // Use all available relays
  console.log("Using all relays for search:", quickRelayUrls);

  // Create relay sets for parallel search
  const relaySets = quickRelayUrls
    .map((url) => {
      try {
        return NDKRelaySet.fromRelayUrls([url], ndk);
      } catch (e) {
        console.warn(`Failed to create relay set for ${url}:`, e);
        return null;
      }
    })
    .filter(Boolean);

  // Search all relays in parallel with short timeout
  const searchPromises = relaySets.map((relaySet, index) => {
    if (!relaySet) return [];

    return new Promise<NostrProfile[]>((resolve) => {
      const foundInRelay: NostrProfile[] = [];
      let eventCount = 0;

      console.log(
        `Starting search on relay ${index + 1}: ${quickRelayUrls[index]}`,
      );

      const sub = ndk.subscribe(
        { kinds: [0] },
        { closeOnEose: true },
        relaySet,
      );

      sub.on("event", (event: NDKEvent) => {
        eventCount++;
        try {
          if (!event.content) return;
          const profileData = JSON.parse(event.content);
          const displayName =
            profileData.displayName || profileData.display_name || "";
          const display_name = profileData.display_name || "";
          const name = profileData.name || "";
          const nip05 = profileData.nip05 || "";
          const about = profileData.about || "";

          // Check if any field matches the search term using normalized comparison
          const matchesDisplayName = fieldMatches(
            displayName,
            normalizedSearchTerm,
          );
          const matchesDisplay_name = fieldMatches(
            display_name,
            normalizedSearchTerm,
          );
          const matchesName = fieldMatches(name, normalizedSearchTerm);
          const matchesNip05 = nip05Matches(nip05, normalizedSearchTerm);
          const matchesAbout = fieldMatches(about, normalizedSearchTerm);

          if (
            matchesDisplayName ||
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
            });
            const profile = createProfileFromEvent(event, profileData);

            // Check if we already have this profile in this relay
            const existingIndex = foundInRelay.findIndex(
              (p) => p.pubkey === event.pubkey,
            );
            if (existingIndex === -1) {
              foundInRelay.push(profile);
            }
          }
        } catch {
          // Invalid JSON or other error, skip
        }
      });

      sub.on("eose", () => {
        console.log(
          `Relay ${index + 1} (${quickRelayUrls[index]}) search completed, processed ${eventCount} events, found ${foundInRelay.length} matches`,
        );
        resolve(foundInRelay);
      });

      // Short timeout for quick search
      setTimeout(() => {
        console.log(
          `Relay ${index + 1} (${quickRelayUrls[index]}) search timed out after 1.5s, processed ${eventCount} events, found ${foundInRelay.length} matches`,
        );
        sub.stop();
        resolve(foundInRelay);
      }, 1500); // 1.5 second timeout per relay
    });
  });

  // Wait for all searches to complete
  const results = await Promise.allSettled(searchPromises);

  // Combine and deduplicate results
  const allProfiles: Record<string, NostrProfile> = {};

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const profile of result.value) {
        if (profile.pubkey) {
          allProfiles[profile.pubkey] = profile;
        }
      }
    }
  }

  console.log(
    `Total unique profiles found: ${Object.keys(allProfiles).length}`,
  );
  return Object.values(allProfiles);
}
