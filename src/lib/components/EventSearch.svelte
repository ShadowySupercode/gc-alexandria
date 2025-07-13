<script lang="ts">
  import { Input, Button } from "flowbite-svelte";
  import { Spinner } from "flowbite-svelte";
  import { ndkInstance } from "$lib/ndk";
  import { fetchEventWithFallback, getMatchingTags } from "$lib/utils/nostrUtils";
  import { nip19 } from "$lib/utils/nostrUtils";
  import { goto } from "$app/navigation";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import RelayDisplay from "./RelayDisplay.svelte";
  import { NDKRelaySet } from "@nostr-dev-kit/ndk";

  const {
    loading,
    error,
    searchValue,
    dTagValue,
    onEventFound,
    onSearchResults,
    event,
    onClear,
    onLoadingChange,
  } = $props<{
    loading: boolean;
    error: string | null;
    searchValue: string | null;
    dTagValue: string | null;
    onEventFound: (event: NDKEvent) => void;
    onSearchResults: (firstOrder: NDKEvent[], secondOrder: NDKEvent[], tTagEvents: NDKEvent[], eventIds: Set<string>, addresses: Set<string>) => void;
    event: NDKEvent | null;
    onClear?: () => void;
    onLoadingChange?: (loading: boolean) => void;
  }>();

  let searchQuery = $state("");
  let localError = $state<string | null>(null);
  let relayStatuses = $state<Record<string, "pending" | "found" | "notfound">>(
    {},
  );
  let foundEvent = $state<NDKEvent | null>(null);
  let searching = $state(false);
  let activeSub: any = null;
  let foundProfiles: NDKEvent[] = [];

  $effect(() => {
    if (searchValue) {
      searchEvent(false, searchValue);
    }
  });

  $effect(() => {
    if (dTagValue) {
      searchBySubscription('d', dTagValue);
    }
  });

  $effect(() => {
    foundEvent = event;
  });

  async function searchBySubscription(searchType: 'd' | 't' | 'n', searchTerm: string) {
    localError = null;
    searching = true;
    if (onLoadingChange) { onLoadingChange(true); }

    const normalizedSearchTerm = searchTerm.toLowerCase();
    const ndk = $ndkInstance;
    if (!ndk) {
      localError = 'NDK not initialized';
      searching = false;
      if (onLoadingChange) { onLoadingChange(false); }
      return;
    }

    // Use all relays from the NDK pool
    const relaySet = new NDKRelaySet(new Set(Array.from(ndk.pool.relays.values())), ndk);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let firstOrderEvents: NDKEvent[] = [];
    let secondOrderEvents: NDKEvent[] = [];
    let tTagEvents: NDKEvent[] = [];
    let eventIds = new Set<string>();
    let eventAddresses = new Set<string>();
    let foundProfiles: NDKEvent[] = [];

    // Helper function to clean up subscription and timeout
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (activeSub) {
        activeSub.stop();
        activeSub = null;
      }
      searching = false;
      if (onLoadingChange) { onLoadingChange(false); }
    };

    // Helper function to check if a profile field matches the search term
    const fieldMatches = (field: string) => {
      if (!field) return false;
      const fieldLower = field.toLowerCase();
      const searchLower = normalizedSearchTerm.toLowerCase();
      if (fieldLower === searchLower) return true;
      if (fieldLower.includes(searchLower)) return true;
      const words = fieldLower.split(/\s+/);
      return words.some(word => word.includes(searchLower));
    };

    // Set a timeout to force completion after 15 seconds
    timeoutId = setTimeout(() => {
      console.log(`[Events] ${searchType.toUpperCase()}-tag search timeout reached`);
      if (searchType === 'n' && foundProfiles.length === 0) {
        localError = `No profiles found matching: ${searchTerm} (search timed out)`;
        onSearchResults([], [], [], new Set(), new Set());
      } else if (searchType === 'd' && firstOrderEvents.length === 0) {
        localError = `No events found with d-tag: ${searchTerm} (search timed out)`;
        onSearchResults([], [], [], new Set(), new Set());
      } else if (searchType === 't' && tTagEvents.length === 0) {
        localError = `No events found with t-tag: ${searchTerm} (search timed out)`;
        onSearchResults([], [], [], new Set(), new Set());
      }
      cleanup();
    }, 15000);

    let filter: any;
    let subscriptionType: string;

    switch (searchType) {
      case 'd':
        filter = { "#d": [normalizedSearchTerm] };
        subscriptionType = 'd-tag';
        break;
      case 't':
        filter = { "#t": [normalizedSearchTerm] };
        subscriptionType = 't-tag';
        break;
      case 'n':
        filter = { kinds: [0] };
        subscriptionType = 'profile';
        break;
    }

    console.log(`[Events] Starting ${subscriptionType} search for:`, normalizedSearchTerm);

    // Subscribe to events
    const sub = ndk.subscribe(
      filter,
      { closeOnEose: true },
      relaySet
    );

    sub.on('event', (event) => {
      try {
        if (searchType === 'n') {
          // Profile search logic
          if (!event.content) return;
          const profileData = JSON.parse(event.content);
          const displayName = profileData.display_name || profileData.displayName || '';
          const name = profileData.name || '';
          const nip05 = profileData.nip05 || '';
          
          if (fieldMatches(displayName) || fieldMatches(name) || fieldMatches(nip05.split('@')[0])) {
            foundProfiles = [...foundProfiles, event];
            onSearchResults(foundProfiles, [], [], new Set(foundProfiles.map(p => p.id)), new Set());
          }
        } else {
          // d-tag and t-tag search logic
          if (event.kind === 7) return; // Skip emoji reactions
          
          if (searchType === 'd') {
            firstOrderEvents = [...firstOrderEvents, event];
            
            // Collect event IDs and addresses for second-order search
            if (event.id) {
              eventIds.add(event.id);
            }
            const aTags = getMatchingTags(event, "a");
            aTags.forEach((tag: string[]) => {
              if (tag[1]) {
                eventAddresses.add(tag[1]);
              }
            });
          } else if (searchType === 't') {
            tTagEvents = [...tTagEvents, event];
          }
        }
      } catch (e) {
        // Invalid JSON or other error, skip
      }
    });

    sub.on('eose', () => {
      console.log(`[Events] ${subscriptionType} search EOSE received`);
      
      if (searchType === 'n') {
        if (foundProfiles.length === 0) {
          localError = `No profiles found matching: ${searchTerm}`;
          onSearchResults([], [], [], new Set(), new Set());
        } else {
          // Deduplicate by pubkey, keep only newest
          const deduped: Record<string, { event: NDKEvent; created_at: number }> = {};
          for (const event of foundProfiles) {
            const pubkey = event.pubkey;
            const created_at = event.created_at || 0;
            if (!deduped[pubkey] || deduped[pubkey].created_at < created_at) {
              deduped[pubkey] = { event, created_at };
            }
          }
          const dedupedProfiles = Object.values(deduped).map(x => x.event);
          onSearchResults(dedupedProfiles, [], [], new Set(dedupedProfiles.map(p => p.id)), new Set());
        }
      } else if (searchType === 'd') {
        if (firstOrderEvents.length === 0) {
          localError = `No events found with d-tag: ${searchTerm}`;
          onSearchResults([], [], [], new Set(), new Set());
        } else {
          // Deduplicate by kind, pubkey, and d-tag, keep only newest event for each combination
          const deduped: Record<string, { event: NDKEvent; created_at: number }> = {};
          for (const event of firstOrderEvents) {
            const dTag = getMatchingTags(event, 'd')[0]?.[1] || '';
            const key = `${event.kind}:${event.pubkey}:${dTag}`;
            const created_at = event.created_at || 0;
            if (!deduped[key] || deduped[key].created_at < created_at) {
              deduped[key] = { event, created_at };
            }
          }
          const dedupedEvents = Object.values(deduped).map(x => x.event);
          onSearchResults(dedupedEvents, [], [], eventIds, eventAddresses);
          localError = `Found ${dedupedEvents.length} unique d-tag events. Searching for second-order results...`;
          // Perform second-order search in background
          firstOrderEvents = dedupedEvents;
          performSecondOrderSearch();
        }
      } else if (searchType === 't') {
        if (tTagEvents.length === 0) {
          localError = `No events found with t-tag: ${searchTerm}`;
          onSearchResults([], [], [], new Set(), new Set());
        } else {
          console.log("[Events] T-tag search completed, found", tTagEvents.length, "events");
          onSearchResults([], [], tTagEvents, new Set(), new Set());
        }
      }
      
      cleanup();
    });

    // Helper function to perform second-order search for d-tag searches
    async function performSecondOrderSearch() {
      if (eventIds.size === 0 && eventAddresses.size === 0) {
        // No references to search for, just search for t-tag events
        console.log("[Events] No references found, searching for t-tag events only");
        try {
          const tTagFilter = { '#t': [normalizedSearchTerm] };
          const tTagEventsSet = await ndk.fetchEvents(
            tTagFilter,
            { closeOnEose: true },
            relaySet,
          );
          
          const tTagEvents = Array.from(tTagEventsSet).filter(e =>
            e.kind !== 7 &&
            !firstOrderEvents.some(fe => fe.id === e.id)
          );

          console.log("[Events] T-tag search completed:", {
            firstOrder: firstOrderEvents.length,
            tTag: tTagEvents.length
          });

          // Clear the "searching" message
          localError = null;
          
          onSearchResults(firstOrderEvents, [], tTagEvents, eventIds, eventAddresses);
        } catch (err) {
          console.error("[Events] Error in t-tag search:", err);
          localError = null;
          onSearchResults(firstOrderEvents, [], [], eventIds, eventAddresses);
        }
        return;
      }

      console.log("[Events] Starting second-order search...");
      
      try {
        // Search for events with e tags referencing the original events
        if (eventIds.size > 0) {
          const eTagFilter = { "#e": Array.from(eventIds) };
          const eTagEvents = await ndk.fetchEvents(
            eTagFilter,
            { closeOnEose: true },
            relaySet,
          );
          eTagEvents.forEach(event => {
            if (event.kind !== 7) { // Skip emoji reactions
              secondOrderEvents.push(event);
            }
          });
        }

        // Search for events with a tags referencing the original events
        if (eventAddresses.size > 0) {
          const aTagFilter = { "#a": Array.from(eventAddresses) };
          const aTagEvents = await ndk.fetchEvents(
            aTagFilter,
            { closeOnEose: true },
            relaySet,
          );
          aTagEvents.forEach(event => {
            if (event.kind !== 7) { // Skip emoji reactions
              secondOrderEvents.push(event);
            }
          });
        }

        // Search for events with content containing nevent/naddr/note references
        // Limit the search to recent events to avoid performance issues
        const recentEvents = await ndk.fetchEvents(
          { 
            limit: 10000,
            since: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60) // Last 30 days
          },
          { closeOnEose: true },
          relaySet,
        );
        
        recentEvents.forEach(event => {
          if (event.content && event.kind !== 7) {
            // Check for nevent references
            eventIds.forEach(id => {
              const neventPattern = new RegExp(`nevent1[a-z0-9]{50,}`, 'i');
              const matches = event.content.match(neventPattern);
              if (matches) {
                matches.forEach(match => {
                  try {
                    const decoded = nip19.decode(match);
                    if (decoded && decoded.type === 'nevent' && decoded.data.id === id) {
                      secondOrderEvents.push(event);
                    }
                  } catch (e) {
                    // Invalid nevent, skip
                  }
                });
              }
            });
            
            // Check for naddr references
            eventAddresses.forEach(address => {
              const naddrPattern = new RegExp(`naddr1[a-z0-9]{50,}`, 'i');
              const matches = event.content.match(naddrPattern);
              if (matches) {
                matches.forEach(match => {
                  try {
                    const decoded = nip19.decode(match);
                    if (decoded && decoded.type === 'naddr') {
                      const decodedAddress = `${decoded.data.kind}:${decoded.data.pubkey}:${decoded.data.identifier}`;
                      if (decodedAddress === address) {
                        secondOrderEvents.push(event);
                      }
                    }
                  } catch (e) {
                    // Invalid naddr, skip
                  }
                });
              }
            });
            
            // Check for note references
            eventIds.forEach(id => {
              const notePattern = new RegExp(`note1[a-z0-9]{50,}`, 'i');
              const matches = event.content.match(notePattern);
              if (matches) {
                matches.forEach(match => {
                  try {
                    const decoded = nip19.decode(match);
                    if (decoded && decoded.type === 'note' && decoded.data === id) {
                      secondOrderEvents.push(event);
                    }
                  } catch (e) {
                    // Invalid note, skip
                  }
                });
              }
            });
          }
        });

        // Remove duplicates from second-order events
        const uniqueSecondOrder = new Map<string, NDKEvent>();
        secondOrderEvents.forEach(event => {
          if (event.id) {
            uniqueSecondOrder.set(event.id, event);
          }
        });
        let deduplicatedSecondOrder = Array.from(uniqueSecondOrder.values());

        // Remove any events already in firstOrderEvents (d-tag section)
        const firstOrderIds = new Set(firstOrderEvents.map(e => e.id));
        deduplicatedSecondOrder = deduplicatedSecondOrder.filter(e => !firstOrderIds.has(e.id));

        // Search for t-tag events
        const tTagFilter = { '#t': [normalizedSearchTerm] };
        const tTagEventsSet = await ndk.fetchEvents(
          tTagFilter,
          { closeOnEose: true },
          relaySet,
        );
        
        // Remove any events already in first or second order
        const firstOrderSet = new Set(firstOrderEvents.map(e => e.id));
        const secondOrderSet = new Set(deduplicatedSecondOrder.map(e => e.id));
        
        const tTagEvents = Array.from(tTagEventsSet).filter(e =>
          e.kind !== 7 &&
          !firstOrderSet.has(e.id) &&
          !secondOrderSet.has(e.id)
        );

        console.log("[Events] Second-order search completed:", {
          firstOrder: firstOrderEvents.length,
          secondOrder: deduplicatedSecondOrder.length,
          tTag: tTagEvents.length
        });

        // Clear the "searching" message
        localError = null;
        
        // Update results with second-order and t-tag events
        onSearchResults(firstOrderEvents, deduplicatedSecondOrder, tTagEvents, eventIds, eventAddresses);
      } catch (err) {
        console.error("[Events] Error in second-order search:", err);
        // Clear the "searching" message
        localError = null;
        // Return first-order results even if second-order search fails
        onSearchResults(firstOrderEvents, [], [], eventIds, eventAddresses);
      }
    }

    if (activeSub) { activeSub.stop(); }
    activeSub = sub;
  }



  async function searchEvent(
    clearInput: boolean = true,
    queryOverride?: string,
  ) {
    localError = null;
    searching = true;
    if (onLoadingChange) { onLoadingChange(true); }
    const query = (
      queryOverride !== undefined ? queryOverride : searchQuery
    ).trim();
    if (!query) {
      searching = false;
      if (onLoadingChange) { onLoadingChange(false); }
      return;
    }

    // Check if this is a d-tag search
    if (query.toLowerCase().startsWith("d:")) {
      const dTag = query.slice(2).trim().toLowerCase();
      if (dTag) {
        const encoded = encodeURIComponent(dTag);
        goto(`?d=${encoded}`, {
          replaceState: false,
          keepFocus: true,
          noScroll: true,
        });
        searching = false;
        if (onLoadingChange) { onLoadingChange(false); }
        return;
      }
    }

    // Check if this is a t-tag search
    if (query.toLowerCase().startsWith("t:")) {
      const searchTerm = query.slice(2).trim();
      if (searchTerm) {
        await searchBySubscription('t', searchTerm);
        return;
      }
    }

    // Check if this is an npub search
    if (query.toLowerCase().startsWith("n:")) {
      const searchTerm = query.slice(2).trim();
      if (searchTerm) {
        await searchBySubscription('n', searchTerm);
        return;
      }
    }

    // Only update the URL if this is a manual search
    if (clearInput) {
      const encoded = encodeURIComponent(query);
      goto(`?id=${encoded}`, {
        replaceState: false,
        keepFocus: true,
        noScroll: true,
      });
    }

    if (clearInput) {
      searchQuery = "";
    }

    // Clean the query and normalize to lowercase
    let cleanedQuery = query.replace(/^nostr:/, "").toLowerCase();
    let filterOrId: any = cleanedQuery;
    console.log("[Events] Cleaned query:", cleanedQuery);

    // NIP-05 address pattern: user@domain
    if (/^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(cleanedQuery)) {
      try {
        const [name, domain] = cleanedQuery.split("@");
        const res = await fetch(
          `https://${domain}/.well-known/nostr.json?name=${name}`,
        );
        const data = await res.json();
        const pubkey = data.names?.[name];
        if (pubkey) {
          filterOrId = { kinds: [0], authors: [pubkey] };
          const profileEvent = await fetchEventWithFallback(
            $ndkInstance,
            filterOrId,
            10000,
          );
          if (profileEvent) {
            handleFoundEvent(profileEvent);
            searching = false;
            if (onLoadingChange) { onLoadingChange(false); }
            return;
          } else {
            localError = "No profile found for this NIP-05 address.";
            searching = false;
            if (onLoadingChange) { onLoadingChange(false); }
            return;
          }
        } else {
          localError = "NIP-05 address not found.";
          searching = false;
          if (onLoadingChange) { onLoadingChange(false); }
          return;
        }
      } catch (e) {
        localError = "Error resolving NIP-05 address.";
        searching = false;
        if (onLoadingChange) { onLoadingChange(false); }
        return;
      }
    }

    // If it's a 64-char hex, try as event id first, then as pubkey (profile)
    if (/^[a-f0-9]{64}$/i.test(cleanedQuery)) {
      // Try as event id
      filterOrId = cleanedQuery;
      const eventResult = await fetchEventWithFallback(
        $ndkInstance,
        filterOrId,
        10000,
      );
      // Always try as pubkey (profile event) as well
      const profileFilter = { kinds: [0], authors: [cleanedQuery] };
      const profileEvent = await fetchEventWithFallback(
        $ndkInstance,
        profileFilter,
        10000,
      );
      // Prefer profile if found and pubkey matches query
      if (
        profileEvent &&
        profileEvent.pubkey.toLowerCase() === cleanedQuery.toLowerCase()
      ) {
        handleFoundEvent(profileEvent);
        searching = false;
        if (onLoadingChange) { onLoadingChange(false); }
        return;
      } else if (eventResult) {
        handleFoundEvent(eventResult);
        searching = false;
        if (onLoadingChange) { onLoadingChange(false); }
        return;
      }
    } else if (
      /^(nevent|note|naddr|npub|nprofile)[a-z0-9]+$/i.test(cleanedQuery)
    ) {
      try {
        const decoded = nip19.decode(cleanedQuery);
        if (!decoded) throw new Error("Invalid identifier");
        console.log("[Events] Decoded NIP-19:", decoded);
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
        console.log("[Events] Using filterOrId:", filterOrId);
      } catch (e) {
        console.error("[Events] Invalid Nostr identifier:", cleanedQuery, e);
        localError = "Invalid Nostr identifier.";
        searching = false;
        if (onLoadingChange) { onLoadingChange(false); }
        return;
      }
    }

    try {
      console.log("Searching for event:", filterOrId);
      const event = await fetchEventWithFallback(
        $ndkInstance,
        filterOrId,
        10000,
      );

      if (!event) {
        console.warn("[Events] Event not found for filterOrId:", filterOrId);
        localError = "Event not found";
        searching = false;
        if (onLoadingChange) { onLoadingChange(false); }
      } else {
        console.log("[Events] Event found:", event);
        handleFoundEvent(event);
        searching = false;
        if (onLoadingChange) { onLoadingChange(false); }
      }
    } catch (err) {
      console.error("[Events] Error fetching event:", err, "Query:", query);
      localError = "Error fetching event. Please check the ID and try again.";
      searching = false;
      if (onLoadingChange) { onLoadingChange(false); }
    }
  }

  function handleFoundEvent(event: NDKEvent) {
    foundEvent = event;
    onEventFound(event);
  }

  function handleClear() {
    searchQuery = '';
    localError = null;
    foundEvent = null;
    relayStatuses = {};
    if (activeSub) { activeSub.stop(); activeSub = null; }
    foundProfiles = [];
    onSearchResults([], [], [], new Set(), new Set());
    if (onClear) {
      onClear();
    }
  }
</script>

<div class="flex flex-col space-y-6">
  <div class="flex gap-2 items-center">
    <Input
      bind:value={searchQuery}
      placeholder="Enter event ID, nevent, naddr, d:tag-name, t:topic, or n:username..."
      class="flex-grow"
      onkeydown={(e: KeyboardEvent) => e.key === "Enter" && searchEvent(true)}
    />
    <Button onclick={() => searchEvent(true)} disabled={loading}>
      {#if searching}
        <Spinner class="mr-2 text-gray-600 dark:text-gray-300" size="5" />
      {/if}
      {searching ? "Searching..." : "Search"}
    </Button>
    <Button onclick={handleClear} color="alternative" type="button" disabled={loading && !searchQuery && !localError}>
      Clear
    </Button>
  </div>

  {#if localError || error}
    <div
      class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg"
      role="alert"
    >
      {localError || error}
      {#if searchQuery.trim()}
        <div class="mt-2">
          You can also try viewing this event on
          <a
            class="underline text-primary-700"
            href={"https://njump.me/" + encodeURIComponent(searchQuery.trim())}
            target="_blank"
            rel="noopener">Njump</a
          >.
        </div>
      {/if}
    </div>
  {/if}

  <div class="mt-4">
    <div class="flex flex-wrap gap-2">
      {#each Object.entries(relayStatuses) as [relay, status]}
        <RelayDisplay {relay} showStatus={true} {status} />
      {/each}
    </div>
    {#if !foundEvent && Object.values(relayStatuses).some((s) => s === "pending")}
      <div class="text-gray-700 dark:text-gray-300 mt-2">
        Searching relays...
      </div>
    {/if}
  </div>
</div>
