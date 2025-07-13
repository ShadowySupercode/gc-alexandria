<script lang="ts">
  import { Input, Button } from "flowbite-svelte";
  import { Spinner } from "flowbite-svelte";
  import { ndkInstance } from "$lib/ndk";
  import { fetchEventWithFallback, getMatchingTags } from "$lib/utils/nostrUtils";
  import { nip19 } from "$lib/utils/nostrUtils";
  import { goto } from "$app/navigation";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import RelayDisplay from "./RelayDisplay.svelte";
  import { getActiveRelays } from "$lib/ndk";

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

  $effect(() => {
    if (searchValue) {
      searchEvent(false, searchValue);
    }
  });

  $effect(() => {
    if (dTagValue) {
      searchByDTag(dTagValue);
    }
  });

  $effect(() => {
    foundEvent = event;
  });

  async function searchByDTag(dTag: string) {
    localError = null;
    searching = true;
    if (onLoadingChange) { onLoadingChange(true); }

    // Convert d-tag to lowercase for consistent searching
    const normalizedDTag = dTag.toLowerCase();

    try {
      console.log("[Events] Searching for events with d-tag:", normalizedDTag);
      const ndk = $ndkInstance;
      if (!ndk) {
        localError = "NDK not initialized";
        searching = false;
        if (onLoadingChange) { onLoadingChange(false); }
        return;
      }

      const filter = { "#d": [normalizedDTag] };
      const relaySet = getActiveRelays(ndk);

      // Fetch multiple events with the same d-tag
      const events = await ndk.fetchEvents(
        filter,
        { closeOnEose: true },
        relaySet,
      );
      const eventArray = Array.from(events);

      if (eventArray.length === 0) {
        localError = `No events found with d-tag: ${normalizedDTag}`;
        onSearchResults([], [], [], new Set(), new Set());
        searching = false;
        if (onLoadingChange) { onLoadingChange(false); }
        return;
      }

      // Collect all event IDs and addresses for second-order search
      const eventIds = new Set<string>();
      const eventAddresses = new Set<string>();
      
      eventArray.forEach(event => {
        if (event.id) {
          eventIds.add(event.id);
        }
        // Add a-tag addresses (kind:pubkey:d)
        const aTags = getMatchingTags(event, "a");
        aTags.forEach((tag: string[]) => {
          if (tag[1]) {
            eventAddresses.add(tag[1]);
          }
        });
      });

      // Search for second-order events that reference the original events
      const secondOrderEvents = new Set<NDKEvent>();
      
      if (eventIds.size > 0 || eventAddresses.size > 0) {
        console.log("[Events] Searching for second-order events...");
        
        // Search for events with e tags referencing the original events
        if (eventIds.size > 0) {
          const eTagFilter = { "#e": Array.from(eventIds) };
          const eTagEvents = await ndk.fetchEvents(
            eTagFilter,
            { closeOnEose: true },
            relaySet,
          );
          eTagEvents.forEach(event => secondOrderEvents.add(event));
        }

        // Search for events with a tags referencing the original events
        if (eventAddresses.size > 0) {
          const aTagFilter = { "#a": Array.from(eventAddresses) };
          const aTagEvents = await ndk.fetchEvents(
            aTagFilter,
            { closeOnEose: true },
            relaySet,
          );
          aTagEvents.forEach(event => secondOrderEvents.add(event));
        }

        // Search for events with content containing nevent/naddr/note references
        // This is a more complex search that requires fetching recent events and checking content
        // Limit the search to recent events to avoid performance issues
        const recentEvents = await ndk.fetchEvents(
          { 
            limit: 500, // Reduced limit for better performance
            since: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60) // Last 7 days
          },
          { closeOnEose: true },
          relaySet,
        );
        
        recentEvents.forEach(event => {
          if (event.content) {
            // Check for nevent references with more precise matching
            eventIds.forEach(id => {
              // Look for complete nevent references
              const neventPattern = new RegExp(`nevent1[a-z0-9]{50,}`, 'i');
              const matches = event.content.match(neventPattern);
              if (matches) {
                // Verify the nevent contains the event ID
                matches.forEach(match => {
                  try {
                    const decoded = nip19.decode(match);
                    if (decoded && decoded.type === 'nevent' && decoded.data.id === id) {
                      secondOrderEvents.add(event);
                    }
                  } catch (e) {
                    // Invalid nevent, skip
                  }
                });
              }
            });
            
            // Check for naddr references with more precise matching
            eventAddresses.forEach(address => {
              const naddrPattern = new RegExp(`naddr1[a-z0-9]{50,}`, 'i');
              const matches = event.content.match(naddrPattern);
              if (matches) {
                // Verify the naddr contains the address
                matches.forEach(match => {
                  try {
                    const decoded = nip19.decode(match);
                    if (decoded && decoded.type === 'naddr') {
                      const decodedAddress = `${decoded.data.kind}:${decoded.data.pubkey}:${decoded.data.identifier}`;
                      if (decodedAddress === address) {
                        secondOrderEvents.add(event);
                      }
                    }
                  } catch (e) {
                    // Invalid naddr, skip
                  }
                });
              }
            });
            
            // Check for note references (event IDs) with more precise matching
            eventIds.forEach(id => {
              const notePattern = new RegExp(`note1[a-z0-9]{50,}`, 'i');
              const matches = event.content.match(notePattern);
              if (matches) {
                // Verify the note contains the event ID
                matches.forEach(match => {
                  try {
                    const decoded = nip19.decode(match);
                    if (decoded && decoded.type === 'note' && decoded.data === id) {
                      secondOrderEvents.add(event);
                    }
                  } catch (e) {
                    // Invalid note, skip
                  }
                });
              }
            });
          }
        });
      }

      // Combine first-order and second-order events
      const allEvents = [...eventArray, ...Array.from(secondOrderEvents)];
      
      // Remove duplicates based on event ID
      const uniqueEvents = new Map<string, NDKEvent>();
      allEvents.forEach(event => {
        if (event.id) {
          uniqueEvents.set(event.id, event);
        }
      });
      
      const finalEvents = Array.from(uniqueEvents.values());

      // Separate first-order and second-order events
      const firstOrderSet = new Set(eventArray.map(e => e.id));
      const firstOrder = finalEvents.filter(e => firstOrderSet.has(e.id));
      const secondOrder = finalEvents.filter(e => !firstOrderSet.has(e.id));

      // Remove kind 7 (emoji reactions) from both first-order and second-order results
      const filteredFirstOrder = firstOrder.filter(e => e.kind !== 7);
      const filteredSecondOrder = secondOrder.filter(e => e.kind !== 7);

      // --- t: search ---
      // Search for events with a matching t-tag (topic/tag)
      const tTagFilter = { '#t': [normalizedDTag] };
      const tTagEventsSet = await ndk.fetchEvents(
        tTagFilter,
        { closeOnEose: true },
        relaySet,
      );
      // Remove any events already in first or second order
      const tTagEvents = Array.from(tTagEventsSet).filter(e =>
        e.kind !== 7 &&
        !firstOrderSet.has(e.id) &&
        !filteredSecondOrder.some(se => se.id === e.id)
      );

      onSearchResults(filteredFirstOrder, filteredSecondOrder, tTagEvents, eventIds, eventAddresses);
      searching = false;
      if (onLoadingChange) { onLoadingChange(false); }
      return;
    } catch (err) {
      console.error("[Events] Error searching by d-tag:", err);
      onSearchResults([], [], [], new Set(), new Set());
      searching = false;
      if (onLoadingChange) { onLoadingChange(false); }
      return;
    }
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
    if (onClear) {
      onClear();
    }
  }
</script>

<div class="flex flex-col space-y-6">
  <div class="flex gap-2 items-center">
    <Input
      bind:value={searchQuery}
      placeholder="Enter event ID, nevent, naddr, or d:tag-name..."
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
