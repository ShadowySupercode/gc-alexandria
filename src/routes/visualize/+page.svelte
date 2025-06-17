<!--
  Visualization Page
  
  This page displays a network visualization of Nostr publications,
  showing the relationships between index events and their content.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import EventNetwork from "$lib/navigator/EventNetwork/index.svelte";
  import { ndkInstance } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { filterValidIndexEvents } from "$lib/utils";
  import { networkFetchLimit } from "$lib/state";
  import { displayLimits } from "$lib/stores/displayLimits";
  import { visualizationConfig, type EventKindConfig } from "$lib/stores/visualizationConfig";
  import { filterByDisplayLimits, detectMissingEvents } from "$lib/utils/displayLimits";
  import type { PageData } from './$types';
  import { getEventKindColor, getEventKindName } from "$lib/utils/eventColors";
  import { extractPubkeysFromEvents, batchFetchProfiles } from "$lib/utils/profileCache";
  import { activePubkey } from "$lib/ndk";
  
  // Configuration
  const DEBUG = false; // Set to true to enable debug logging
  const INDEX_EVENT_KIND = 30040;
  const CONTENT_EVENT_KINDS = [30041, 30818];
  
  // Props from load function
  let { data } = $props<{ data: PageData }>();
  
  /**
   * Debug logging function that only logs when DEBUG is true
   */
  function debug(...args: any[]) {
    if (DEBUG) {
      console.log("[VisualizePage]", ...args);
    }
  }

  // State
  let allEvents = $state<NDKEvent[]>([]); // All fetched events
  let events = $state<NDKEvent[]>([]); // Events to display (filtered by limits)
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showSettings = $state(false);
  let tagExpansionDepth = $state(0);
  let baseEvents = $state<NDKEvent[]>([]); // Store original events before expansion
  let missingEventIds = $state(new Set<string>()); // Track missing referenced events
  let loadingEventKinds = $state<Array<{kind: number, limit: number}>>([]);  // Track what kinds are being loaded
  let isFetching = false; // Guard against concurrent fetches
  let followListEvents = $state<NDKEvent[]>([]); // Store follow list events separately
  
  // Profile loading progress
  let profileLoadingProgress = $state<{current: number, total: number} | null>(null);
  let profileLoadingMessage = $derived(
    profileLoadingProgress 
      ? `Loading profiles: ${profileLoadingProgress.current}/${profileLoadingProgress.total}`
      : null
  );
  
  // Profile stats for EventTypeConfig
  let profileStats = $state<{totalFetched: number, displayLimit: number}>({
    totalFetched: 0,
    displayLimit: 50
  });

  /**
   * Fetches follow lists (kind 3) with depth expansion
   */
  async function fetchFollowLists(config: EventKindConfig): Promise<NDKEvent[]> {
    const depth = config.depth || 0;
    const allFollowEvents: NDKEvent[] = [];
    const processedPubkeys = new Set<string>();
    
    debug(`Fetching kind 3 follow lists with depth ${depth}, addFollowLists: ${config.addFollowLists}`);
    
    // Get the current user's pubkey
    const currentUserPubkey = get(activePubkey);
    if (!currentUserPubkey) {
      console.warn("No logged-in user, cannot fetch user's follow list");
      return [];
    }
    
    // If limit is 1, only fetch the current user's follow list
    if (config.limit === 1) {
      const userFollowList = await $ndkInstance.fetchEvents({
        kinds: [3],
        authors: [currentUserPubkey],
        limit: 1
      });
      
      if (userFollowList.size === 0) {
        console.warn("User has no follow list");
        return [];
      }
      
      const userFollowEvent = Array.from(userFollowList)[0];
      allFollowEvents.push(userFollowEvent);
      processedPubkeys.add(currentUserPubkey);
      
      debug(`Fetched user's follow list`);
    } else {
      // If limit > 1, fetch the user's follow list plus additional ones from people they follow
      const userFollowList = await $ndkInstance.fetchEvents({
        kinds: [3],
        authors: [currentUserPubkey],
        limit: 1
      });
      
      if (userFollowList.size === 0) {
        console.warn("User has no follow list");
        return [];
      }
      
      const userFollowEvent = Array.from(userFollowList)[0];
      allFollowEvents.push(userFollowEvent);
      processedPubkeys.add(currentUserPubkey);
      
      // Extract followed pubkeys
      const followedPubkeys: string[] = [];
      userFollowEvent.tags.forEach(tag => {
        if (tag[0] === 'p' && tag[1]) {
          followedPubkeys.push(tag[1]);
        }
      });
      
      debug(`User follows ${followedPubkeys.length} people`);
      
      // Fetch additional follow lists from people you follow
      if (followedPubkeys.length > 0) {
        const additionalLimit = config.limit - 1; // We already have the user's
        const pubkeysToFetch = followedPubkeys.slice(0, additionalLimit);
        
        debug(`Fetching ${pubkeysToFetch.length} additional follow lists (total limit: ${config.limit})`);
        
        const additionalFollowLists = await $ndkInstance.fetchEvents({
          kinds: [3],
          authors: pubkeysToFetch
        });
        
        allFollowEvents.push(...Array.from(additionalFollowLists));
        
        // Mark these as processed
        additionalFollowLists.forEach(event => {
          processedPubkeys.add(event.pubkey);
        });
        
        debug(`Fetched ${additionalFollowLists.size} additional follow lists`);
      }
    }
    
    // If depth > 0, we need to fetch follow lists of follows (recursively)
    if (depth > 0) {
      // Start with all pubkeys from fetched follow lists
      let currentLevelPubkeys: string[] = [];
      allFollowEvents.forEach(event => {
        event.tags.forEach(tag => {
          if (tag[0] === 'p' && tag[1] && !processedPubkeys.has(tag[1])) {
            currentLevelPubkeys.push(tag[1]);
          }
        });
      });
      
      // Fetch additional levels based on depth
      for (let level = 1; level <= depth; level++) {
        if (currentLevelPubkeys.length === 0) break;
        
        debug(`Fetching level ${level} follow lists for ${currentLevelPubkeys.length} pubkeys`);
        
        // Fetch follow lists for this level
        const levelFollowLists = await $ndkInstance.fetchEvents({
          kinds: [3],
          authors: currentLevelPubkeys
        });
        
        const nextLevelPubkeys: string[] = [];
        
        levelFollowLists.forEach(event => {
          allFollowEvents.push(event);
          processedPubkeys.add(event.pubkey);
          
          // Extract pubkeys for next level
          if (level < depth) {
            event.tags.forEach(tag => {
              if (tag[0] === 'p' && tag[1] && !processedPubkeys.has(tag[1])) {
                nextLevelPubkeys.push(tag[1]);
              }
            });
          }
        });
        
        currentLevelPubkeys = nextLevelPubkeys;
      }
    }
    
    debug(`Fetched ${allFollowEvents.length} follow lists total`);
    
    // Store follow lists separately for tag anchor use
    followListEvents = [...allFollowEvents];
    
    return allFollowEvents;
  }

  /**
   * Fetches events from the Nostr network
   * 
   * This function fetches index events and their referenced content events,
   * filters them according to NIP-62, and combines them for visualization.
   */
  async function fetchEvents() {
    // Prevent concurrent fetches
    if (isFetching) {
      debug("Fetch already in progress, skipping");
      return;
    }
    
    debug("Fetching events with limit:", $networkFetchLimit);
    debug("Event ID from URL:", data.eventId);
    
    try {
      isFetching = true;
      loading = true;
      error = null;

      // Get enabled event configurations
      const config = get(visualizationConfig);
      const enabledConfigs = config.eventConfigs.filter(
        ec => !(config.disabledKinds?.includes(ec.kind))
      );
      
      debug("Enabled event configs:", enabledConfigs);
      
      // Set loading event kinds for display
      loadingEventKinds = enabledConfigs.map(ec => ({
        kind: ec.kind,
        limit: ec.limit
      }));
      
      // Separate publication kinds from other kinds
      const publicationKinds = [30040, 30041, 30818];
      const publicationConfigs = enabledConfigs.filter(ec => publicationKinds.includes(ec.kind));
      const otherConfigs = enabledConfigs.filter(ec => !publicationKinds.includes(ec.kind));
      
      let allFetchedEvents: NDKEvent[] = [];
      
      // First, fetch non-publication events (like kind 1, 3, etc. but NOT kind 0)
      // We'll fetch kind 0 profiles after we know which pubkeys we need
      const kind0Config = otherConfigs.find(c => c.kind === 0);
      const nonProfileConfigs = otherConfigs.filter(c => c.kind !== 0);
      
      if (nonProfileConfigs.length > 0) {
        debug("Fetching non-publication events (excluding profiles):", nonProfileConfigs);
        
        for (const config of nonProfileConfigs) {
          try {
            // Special handling for kind 3 (follow lists)
            if (config.kind === 3) {
              const followEvents = await fetchFollowLists(config);
              allFetchedEvents.push(...followEvents);
            } else {
              const fetchedEvents = await $ndkInstance.fetchEvents(
                { 
                  kinds: [config.kind], 
                  limit: config.limit 
                },
                {
                  groupable: true,
                  skipVerification: false,
                  skipValidation: false,
                }
              );
              debug(`Fetched ${fetchedEvents.size} events of kind ${config.kind}`);
              allFetchedEvents.push(...Array.from(fetchedEvents));
            }
          } catch (e) {
            console.error(`Error fetching kind ${config.kind}:`, e);
          }
        }
      }
      
      // Then handle publication events as before
      let validIndexEvents: Set<NDKEvent> = new Set();
      const shouldFetchIndex = publicationConfigs.some(ec => ec.kind === INDEX_EVENT_KIND);

      if (data.eventId) {
        // Fetch specific publication
        debug(`Fetching specific publication: ${data.eventId}`);
        const event = await $ndkInstance.fetchEvent(data.eventId);
        
        if (!event) {
          throw new Error(`Publication not found: ${data.eventId}`);
        }
        
        if (event.kind !== INDEX_EVENT_KIND) {
          throw new Error(`Event ${data.eventId} is not a publication index (kind ${INDEX_EVENT_KIND})`);
        }
        
        validIndexEvents = new Set([event]);
      } else if (!shouldFetchIndex) {
        debug("Index events (30040) are disabled, skipping fetch");
        validIndexEvents = new Set();
      } else {
        // Original behavior: fetch all publications
        debug(`Fetching index events (kind ${INDEX_EVENT_KIND})`);
        const indexConfig = publicationConfigs.find(ec => ec.kind === INDEX_EVENT_KIND);
        const indexLimit = indexConfig?.limit || 20;
        
        const indexEvents = await $ndkInstance.fetchEvents(
          { 
            kinds: [INDEX_EVENT_KIND], 
            limit: indexLimit
          },
          {
            groupable: true,
            skipVerification: false,
            skipValidation: false,
          },
        );
        debug("Fetched index events:", indexEvents.size);

        // Filter valid index events according to NIP-62
        validIndexEvents = filterValidIndexEvents(indexEvents);
        debug("Valid index events after filtering:", validIndexEvents.size);
      }

      // Step 3: Extract content event references from index events
      const contentReferences = new Map<string, { kind: number; pubkey: string; dTag: string }>();
      validIndexEvents.forEach((event) => {
        const aTags = event.getMatchingTags("a");
        debug(`Event ${event.id} has ${aTags.length} a-tags`);
        
        aTags.forEach((tag) => {
          // Parse the 'a' tag identifier: kind:pubkey:d-tag
          if (tag[1]) {
            const parts = tag[1].split(':');
            if (parts.length >= 3) {
              const kind = parseInt(parts[0]);
              const pubkey = parts[1];
              const dTag = parts.slice(2).join(':'); // Handle d-tags with colons
              
              // Only add if it's a content event kind we're interested in
              if (CONTENT_EVENT_KINDS.includes(kind)) {
                const key = `${kind}:${pubkey}:${dTag}`;
                contentReferences.set(key, { kind, pubkey, dTag });
              }
            }
          }
        });
      });
      debug("Content references to fetch:", contentReferences.size);

      // Step 4: Fetch the referenced content events with author filter
      // Only fetch content kinds that are enabled
      const enabledPublicationKinds = publicationConfigs.map(ec => ec.kind);
      const enabledContentKinds = CONTENT_EVENT_KINDS.filter(kind => enabledPublicationKinds.includes(kind));
      debug(`Fetching content events (enabled kinds: ${enabledContentKinds.join(', ')})`);
      
      // Group by author to make more efficient queries
      const referencesByAuthor = new Map<string, Array<{ kind: number; dTag: string }>>();
      contentReferences.forEach(({ kind, pubkey, dTag }) => {
        // Only include references for enabled kinds
        if (enabledContentKinds.includes(kind)) {
          if (!referencesByAuthor.has(pubkey)) {
            referencesByAuthor.set(pubkey, []);
          }
          referencesByAuthor.get(pubkey)!.push({ kind, dTag });
        }
      });
      
      // Fetch events for each author
      const contentEventPromises = Array.from(referencesByAuthor.entries()).map(
        async ([author, refs]) => {
          const dTags = [...new Set(refs.map(r => r.dTag))]; // Dedupe d-tags
          return $ndkInstance.fetchEvents({
            kinds: enabledContentKinds, // Only fetch enabled kinds
            authors: [author],
            "#d": dTags,
          });
        }
      );
      
      const contentEventSets = await Promise.all(contentEventPromises);
      
      // Deduplicate by keeping only the most recent version of each d-tag per author
      const eventsByCoordinate = new Map<string, NDKEvent>();
      
      contentEventSets.forEach((eventSet, idx) => {
        eventSet.forEach(event => {
          const dTag = event.tagValue("d");
          const author = event.pubkey;
          const kind = event.kind;
          
          if (dTag && author && kind) {
            const coordinate = `${kind}:${author}:${dTag}`;
            const existing = eventsByCoordinate.get(coordinate);
            
            // Keep the most recent event (highest created_at)
            if (!existing || (event.created_at && existing.created_at && event.created_at > existing.created_at)) {
              eventsByCoordinate.set(coordinate, event);
              debug(`Keeping newer version of ${coordinate}, created_at: ${event.created_at}`);
            } else if (existing) {
              debug(`Skipping older version of ${coordinate}, created_at: ${event.created_at} vs ${existing.created_at}`);
            }
          }
        });
      });
      
      const contentEvents = new Set(eventsByCoordinate.values());
      debug("Fetched content events after deduplication:", contentEvents.size);

      // Step 5: Combine all events (non-publication + publication events)
      // First, build coordinate map for replaceable events
      const coordinateMap = new Map<string, NDKEvent>();
      const allEventsToProcess = [
        ...allFetchedEvents, // Non-publication events fetched earlier
        ...Array.from(validIndexEvents), 
        ...Array.from(contentEvents)
      ];
      
      // First pass: identify the most recent version of each replaceable event
      allEventsToProcess.forEach(event => {
        if (!event.id) return;
        
        // For replaceable events (30000-39999), track by coordinate
        if (event.kind && event.kind >= 30000 && event.kind < 40000) {
          const dTag = event.tagValue("d");
          const author = event.pubkey;
          
          if (dTag && author) {
            const coordinate = `${event.kind}:${author}:${dTag}`;
            const existing = coordinateMap.get(coordinate);
            
            // Keep the most recent version
            if (!existing || (event.created_at && existing.created_at && event.created_at > existing.created_at)) {
              coordinateMap.set(coordinate, event);
            }
          }
        }
      });
      
      // Second pass: build final event map
      const finalEventMap = new Map<string, NDKEvent>();
      const seenCoordinates = new Set<string>();
      
      allEventsToProcess.forEach(event => {
        if (!event.id) return;
        
        // For replaceable events, only add if it's the chosen version
        if (event.kind && event.kind >= 30000 && event.kind < 40000) {
          const dTag = event.tagValue("d");
          const author = event.pubkey;
          
          if (dTag && author) {
            const coordinate = `${event.kind}:${author}:${dTag}`;
            const chosenEvent = coordinateMap.get(coordinate);
            
            // Only add this event if it's the chosen one for this coordinate
            if (chosenEvent && chosenEvent.id === event.id) {
              if (!seenCoordinates.has(coordinate)) {
                finalEventMap.set(event.id, event);
                seenCoordinates.add(coordinate);
              }
            }
            return;
          }
        }
        
        // Non-replaceable events are added directly
        finalEventMap.set(event.id, event);
      });
      
      // Handle append mode
      if ($visualizationConfig.appendMode && allEvents.length > 0) {
        // Merge existing events with new events
        const existingEventMap = new Map(allEvents.map(e => [e.id, e]));
        
        // Add new events to existing map (new events override old ones)
        finalEventMap.forEach((event, id) => {
          existingEventMap.set(id, event);
        });
        
        allEvents = Array.from(existingEventMap.values());
        
        // Note: followListEvents are already accumulated in fetchFollowLists
      } else {
        // Replace mode (default)
        allEvents = Array.from(finalEventMap.values());
        // Clear follow lists in replace mode
        if (!$visualizationConfig.appendMode) {
          followListEvents = [];
        }
      }
      
      baseEvents = [...allEvents]; // Store base events for tag expansion
      
      // Step 6: Extract all pubkeys and fetch profiles
      debug("Extracting pubkeys from all events");
      
      // Use the utility function to extract ALL pubkeys (authors + p tags + content)
      const allPubkeys = extractPubkeysFromEvents(allEvents);
      
      // Add pubkeys from follow lists if present
      if (followListEvents.length > 0) {
        followListEvents.forEach(event => {
          if (event.pubkey) allPubkeys.add(event.pubkey);
          event.tags.forEach(tag => {
            if (tag[0] === 'p' && tag[1]) {
              allPubkeys.add(tag[1]);
            }
          });
        });
      }
      
      debug("Profile extraction complete:", {
        totalPubkeys: allPubkeys.size,
        fromEvents: allEvents.length,
        fromFollowLists: followListEvents.length
      });
      
      // Fetch ALL profiles if kind 0 is enabled
      let profileEvents: NDKEvent[] = [];
      if (kind0Config) {
        debug("Fetching profiles for all discovered pubkeys");
        
        // Update progress during fetch
        profileLoadingProgress = { current: 0, total: allPubkeys.size };
        
        profileEvents = await batchFetchProfiles(
          Array.from(allPubkeys),
          (fetched, total) => {
            profileLoadingProgress = { current: fetched, total };
          }
        );
        
        profileLoadingProgress = null;
        debug("Profile fetch complete, fetched", profileEvents.length, "profiles");
        
        // Add profile events to allEvents
        allEvents = [...allEvents, ...profileEvents];
        
        // Update profile stats for display
        profileStats = {
          totalFetched: profileEvents.length,
          displayLimit: kind0Config.limit
        };
      }
      
      // Step 7: Apply display limits
      events = filterByDisplayLimits(allEvents, $displayLimits, $visualizationConfig);
      
      // Step 8: Detect missing events
      const eventIds = new Set(allEvents.map(e => e.id));
      missingEventIds = detectMissingEvents(events, eventIds);
      
      debug("Total events fetched:", allEvents.length);
      debug("Events displayed:", events.length);
      debug("Missing event IDs:", missingEventIds.size);
      debug("Display limits:", $displayLimits);
      debug("About to set loading to false");
      debug("Current loading state:", loading);
    } catch (e) {
      console.error("Error fetching events:", e);
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
      isFetching = false;
      debug("Loading set to false in fetchEvents");
      debug("Final state check - loading:", loading, "events.length:", events.length, "allEvents.length:", allEvents.length);
    }
  }


  /**
   * Handles tag expansion to fetch related publications
   */
  async function handleTagExpansion(depth: number, tags: string[]) {
    debug("Handling tag expansion", { depth, tags, searchThroughFetched: $visualizationConfig.searchThroughFetched });
    
    if (depth === 0 || tags.length === 0) {
      // Reset to base events only
      allEvents = [...baseEvents];
      events = filterByDisplayLimits(allEvents, $displayLimits, $visualizationConfig);
      return;
    }
    
    try {
      // Don't show loading spinner for incremental updates
      error = null;
      
      // Keep track of existing event IDs to avoid duplicates
      const existingEventIds = new Set(baseEvents.map(e => e.id));
      
      let newPublications: NDKEvent[] = [];
      let newContentEvents: NDKEvent[] = [];
      
      if ($visualizationConfig.searchThroughFetched) {
        // Search through already fetched events only
        debug("Searching through already fetched events for tags:", tags);
        
        // Find publications in allEvents that have the specified tags
        const taggedPublications = allEvents.filter(event => {
          if (event.kind !== INDEX_EVENT_KIND) return false;
          if (existingEventIds.has(event.id)) return false; // Skip base events
          
          // Check if event has any of the specified tags
          const eventTags = event.getMatchingTags("t").map(tag => tag[1]);
          return tags.some(tag => eventTags.includes(tag));
        });
        
        newPublications = taggedPublications;
        debug("Found", newPublications.length, "publications in fetched events");
        
        // For content events, also search in allEvents
        const existingContentDTags = new Set(
          baseEvents
            .filter(e => e.kind !== undefined && CONTENT_EVENT_KINDS.includes(e.kind))
            .map(e => e.tagValue("d"))
            .filter(d => d !== undefined)
        );
        
        const contentEventDTags = new Set<string>();
        newPublications.forEach((event) => {
          const aTags = event.getMatchingTags("a");
          aTags.forEach((tag) => {
            // Parse the 'a' tag identifier: kind:pubkey:d-tag
            if (tag[1]) {
              const parts = tag[1].split(':');
              if (parts.length >= 3) {
                const dTag = parts.slice(2).join(':'); // Handle d-tags with colons
                if (!existingContentDTags.has(dTag)) {
                  contentEventDTags.add(dTag);
                }
              }
            }
          });
        });
        
        // Find content events in allEvents
        newContentEvents = allEvents.filter(event => {
          if (!CONTENT_EVENT_KINDS.includes(event.kind || 0)) return false;
          const dTag = event.tagValue("d");
          return dTag !== undefined && contentEventDTags.has(dTag);
        });
        
      } else {
        // Fetch from relays as before
        debug("Fetching from relays for tags:", tags);
        
        // Fetch publications that have any of the specified tags
        const taggedPublications = await $ndkInstance.fetchEvents({
          kinds: [INDEX_EVENT_KIND],
          "#t": tags, // Match any of these tags
          limit: 30 * depth // Reasonable limit based on depth
        });
        
        debug("Found tagged publications from relays:", taggedPublications.size);
        
        // Filter to avoid duplicates
        newPublications = Array.from(taggedPublications).filter(
          event => !existingEventIds.has(event.id)
        );
        
        // Extract content event d-tags from new publications
        const contentEventDTags = new Set<string>();
        const existingContentDTags = new Set(
          baseEvents
            .filter(e => e.kind !== undefined && CONTENT_EVENT_KINDS.includes(e.kind))
            .map(e => e.tagValue("d"))
            .filter(d => d !== undefined)
        );
        
        newPublications.forEach((event) => {
          const aTags = event.getMatchingTags("a");
          aTags.forEach((tag) => {
            // Parse the 'a' tag identifier: kind:pubkey:d-tag
            if (tag[1]) {
              const parts = tag[1].split(':');
              if (parts.length >= 3) {
                const dTag = parts.slice(2).join(':'); // Handle d-tags with colons
                if (!existingContentDTags.has(dTag)) {
                  contentEventDTags.add(dTag);
                }
              }
            }
          });
        });
        
        // Fetch the content events
        if (contentEventDTags.size > 0) {
          const contentEventsSet = await $ndkInstance.fetchEvents({
            kinds: CONTENT_EVENT_KINDS,
            "#d": Array.from(contentEventDTags), // Use d-tag filter
          });
          newContentEvents = Array.from(contentEventsSet);
        }
      }
      
      // Combine all events with coordinate-based deduplication
      // First, build coordinate map for replaceable events
      const coordinateMap = new Map<string, NDKEvent>();
      const allEventsToProcess = [...baseEvents, ...newPublications, ...newContentEvents];
      
      // First pass: identify the most recent version of each replaceable event
      allEventsToProcess.forEach(event => {
        if (!event.id) return;
        
        // For replaceable events (30000-39999), track by coordinate
        if (event.kind && event.kind >= 30000 && event.kind < 40000) {
          const dTag = event.tagValue("d");
          const author = event.pubkey;
          
          if (dTag && author) {
            const coordinate = `${event.kind}:${author}:${dTag}`;
            const existing = coordinateMap.get(coordinate);
            
            // Keep the most recent version
            if (!existing || (event.created_at && existing.created_at && event.created_at > existing.created_at)) {
              coordinateMap.set(coordinate, event);
            }
          }
        }
      });
      
      // Second pass: build final event map
      const finalEventMap = new Map<string, NDKEvent>();
      const seenCoordinates = new Set<string>();
      
      allEventsToProcess.forEach(event => {
        if (!event.id) return;
        
        // For replaceable events, only add if it's the chosen version
        if (event.kind && event.kind >= 30000 && event.kind < 40000) {
          const dTag = event.tagValue("d");
          const author = event.pubkey;
          
          if (dTag && author) {
            const coordinate = `${event.kind}:${author}:${dTag}`;
            const chosenEvent = coordinateMap.get(coordinate);
            
            // Only add this event if it's the chosen one for this coordinate
            if (chosenEvent && chosenEvent.id === event.id && !seenCoordinates.has(coordinate)) {
              finalEventMap.set(event.id, event);
              seenCoordinates.add(coordinate);
            }
            return;
          }
        }
        
        // Non-replaceable events are added directly
        finalEventMap.set(event.id, event);
      });
      
      allEvents = Array.from(finalEventMap.values());
      
      // Fetch profiles for new events
      const newPubkeys = extractPubkeysFromEvents([...newPublications, ...newContentEvents]);
      if (newPubkeys.size > 0) {
        debug("Fetching profiles for", newPubkeys.size, "new pubkeys from tag expansion");
        profileLoadingProgress = { current: 0, total: newPubkeys.size };
        await batchFetchProfiles(Array.from(newPubkeys), (fetched, total) => {
          profileLoadingProgress = { current: fetched, total };
        });
        profileLoadingProgress = null;
      }
      
      // Apply display limits
      events = filterByDisplayLimits(allEvents, $displayLimits);
      
      // Update missing events detection
      const eventIds = new Set(allEvents.map(e => e.id));
      missingEventIds = detectMissingEvents(events, eventIds);
      
      debug("Events after expansion:", {
        base: baseEvents.length,
        newPubs: newPublications.length,
        newContent: newContentEvents.length,
        totalFetched: allEvents.length,
        displayed: events.length,
        missing: missingEventIds.size,
        searchMode: $visualizationConfig.searchThroughFetched ? "fetched" : "relays"
      });
      
    } catch (e) {
      console.error("Error expanding tags:", e);
      error = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Dynamically fetches missing events when "fetch if not found" is enabled
   */
  async function fetchMissingEvents(missingIds: string[]) {
    if (!$displayLimits.fetchIfNotFound || missingIds.length === 0) {
      return;
    }
    
    debug("Fetching missing events:", missingIds);
    debug("Current loading state:", loading);
    
    try {
      // Fetch by event IDs and d-tags
      const fetchedEvents = await $ndkInstance.fetchEvents({
        kinds: [...[INDEX_EVENT_KIND], ...CONTENT_EVENT_KINDS],
        "#d": missingIds, // For parameterized replaceable events
      });
      
      if (fetchedEvents.size === 0) {
        // Try fetching by IDs directly
        const eventsByIds = await $ndkInstance.fetchEvents({
          ids: missingIds
        });
        // Add events from the second fetch to the first set
        eventsByIds.forEach(e => fetchedEvents.add(e));
      }
      
      if (fetchedEvents.size > 0) {
        debug(`Fetched ${fetchedEvents.size} missing events`);
        
        // Fetch profiles for the new events
        const newEvents = Array.from(fetchedEvents);
        const newPubkeys = extractPubkeysFromEvents(newEvents);
        let newProfileEvents: NDKEvent[] = [];
        
        if (newPubkeys.size > 0 && $visualizationConfig.eventConfigs.some(ec => ec.kind === 0 && !$visualizationConfig.disabledKinds?.includes(0))) {
          debug("Fetching profiles for", newPubkeys.size, "pubkeys from missing events");
          profileLoadingProgress = { current: 0, total: newPubkeys.size };
          newProfileEvents = await batchFetchProfiles(Array.from(newPubkeys), (fetched, total) => {
            profileLoadingProgress = { current: fetched, total };
          });
          profileLoadingProgress = null;
          
          // Update profile stats
          profileStats = {
            totalFetched: profileStats.totalFetched + newProfileEvents.length,
            displayLimit: profileStats.displayLimit
          };
        }
        
        // Add to all events
        allEvents = [...allEvents, ...newEvents, ...newProfileEvents];
        
        // Re-apply display limits
        events = filterByDisplayLimits(allEvents, $displayLimits);
        
        // Update missing events list
        const eventIds = new Set(allEvents.map(e => e.id));
        missingEventIds = detectMissingEvents(events, eventIds);
      }
    } catch (e) {
      console.error("Error fetching missing events:", e);
    }
  }

  // React to display limit and allowed kinds changes
  $effect(() => {
    debug("Effect triggered: allEvents.length =", allEvents.length, "displayLimits =", $displayLimits, "allowedKinds =", $visualizationConfig.allowedKinds);
    if (allEvents.length > 0) {
      const newEvents = filterByDisplayLimits(allEvents, $displayLimits, $visualizationConfig);
      
      // Only update if actually different to avoid infinite loops
      if (newEvents.length !== events.length) {
        debug("Updating events due to display limit change:", events.length, "->", newEvents.length);
        events = newEvents;
        
        // Check for missing events when limits change
        const eventIds = new Set(allEvents.map(e => e.id));
        missingEventIds = detectMissingEvents(events, eventIds);
        
        debug("Effect: events filtered to", events.length, "missing:", missingEventIds.size);
      }
      
      // Auto-fetch if enabled (but be conservative to avoid infinite loops)
      if ($displayLimits.fetchIfNotFound && missingEventIds.size > 0 && missingEventIds.size < 20) {
        debug("Auto-fetching", missingEventIds.size, "missing events");
        fetchMissingEvents(Array.from(missingEventIds));
      }
    }
  });
  
  // TEMPORARILY DISABLED: Track previous disabled kinds without using $state to avoid infinite loops
  // let previousDisabledKinds: number[] = [];
  // let hasInitialized = false;
  
  // $effect(() => {
  //   const currentDisabledKinds = $visualizationConfig.disabledKinds || [];
    
  //   // Initialize on first run
  //   if (!hasInitialized) {
  //     previousDisabledKinds = [...currentDisabledKinds];
  //     hasInitialized = true;
  //     return;
  //   }
    
  //   // Check if any kinds were re-enabled (were in previous but not in current)
  //   const reEnabledKinds = previousDisabledKinds.filter(
  //     kind => !currentDisabledKinds.includes(kind)
  //   );
    
  //   if (reEnabledKinds.length > 0) {
  //     debug("Event kinds re-enabled:", reEnabledKinds);
  //     // Update tracking before fetch to prevent re-trigger
  //     previousDisabledKinds = [...currentDisabledKinds];
  //     // Trigger a fresh fetch to include the newly enabled kinds
  //     fetchEvents();
  //   } else {
  //     // Just update tracking
  //     previousDisabledKinds = [...currentDisabledKinds];
  //   }
  // });

  /**
   * Clears all accumulated events
   */
  function clearEvents() {
    allEvents = [];
    events = [];
    baseEvents = [];
    followListEvents = [];
    missingEventIds = new Set();
    
    // Clear node positions cache in EventNetwork
    // This will be handled by the component when events change
  }

  // Fetch events when component mounts
  onMount(() => {
    debug("Component mounted");
    fetchEvents();
  });
</script>

<div class="leather w-full p-4 relative">
  <!-- Header with title and settings button -->
  <div class="flex items-center mb-4">
    <h1 class="h-leather">
      {data.eventId ? 'Publication Visualization' : 'Publication Network'}
    </h1>
  </div>
  <!-- Loading spinner -->
  {#if loading}
    <div class="flex flex-col justify-center items-center h-64 gap-4">
      {debug("TEMPLATE: Loading is true, events.length =", events.length, "allEvents.length =", allEvents.length)}
      <div role="status">
        <svg
          aria-hidden="true"
          class="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
          viewBox="0 0 100 101"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
            fill="currentColor"
          />
          <path
            d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
            fill="currentFill"
          />
        </svg>
        <span class="sr-only">Loading...</span>
      </div>
      
      <!-- Loading message with event kinds -->
      <div class="text-center">
        <p class="text-gray-600 dark:text-gray-400 mb-2">Loading</p>
        <div class="flex flex-wrap justify-center gap-2 max-w-md">
          {#each loadingEventKinds as config}
            <div class="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
              <span 
                class="w-3 h-3 rounded-full inline-block"
                style="background-color: {getEventKindColor(config.kind)};"
              ></span>
              <span class="text-sm text-gray-700 dark:text-gray-300">
                {getEventKindName(config.kind)}: {config.limit}
              </span>
            </div>
          {/each}
        </div>
        
        <!-- Profile loading progress bar -->
        {#if profileLoadingProgress}
          <div class="mt-4">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {profileLoadingMessage}
            </p>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style="width: {(profileLoadingProgress.current / profileLoadingProgress.total) * 100}%"
              ></div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  <!-- Error message -->
  {:else if error}
    <div
      class="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-red-900 dark:text-red-400"
      role="alert"
    >
      <p class="font-bold mb-2">Error loading network:</p>
      <p class="mb-3">{error}</p>
      <button
        type="button"
        class="text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 mt-2 dark:bg-red-600 dark:hover:bg-red-700 focus:outline-none dark:focus:ring-red-800"
        on:click={fetchEvents}
      >
        Retry
      </button>
    </div>
  <!-- Network visualization -->
  {:else}
    <!-- Profile loading progress bar (overlay when loading profiles after initial load) -->
    {#if profileLoadingProgress}
      <div class="absolute top-0 left-0 right-0 z-10 p-4">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {profileLoadingMessage}
          </p>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              class="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style="width: {(profileLoadingProgress.current / profileLoadingProgress.total) * 100}%"
            ></div>
          </div>
        </div>
      </div>
    {/if}
    
    <!-- Event network visualization -->
    <EventNetwork 
      {events}
      {followListEvents}
      totalCount={allEvents.length}
      onupdate={fetchEvents}
      onclear={clearEvents}
      onTagExpansionChange={handleTagExpansion}
      onFetchMissing={fetchMissingEvents}
      {profileStats}
    />
  {/if}
</div>
