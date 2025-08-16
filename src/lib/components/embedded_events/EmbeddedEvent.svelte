<script lang="ts">
  import { onMount } from "svelte";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { fetchEventWithFallback } from "$lib/utils/nostrUtils";
  import { getUserMetadata, toNpub } from "$lib/utils/nostrUtils";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { parsedContent } from "$lib/components/embedded_events/EmbeddedSnippets.svelte";
  import { naddrEncode } from "$lib/utils";
  import { activeInboxRelays, ndkInstance } from "$lib/ndk";
  import { goto } from "$app/navigation";
  import { getEventType } from "$lib/utils/mime";
  import { nip19 } from "nostr-tools";
  import { get } from "svelte/store";
  import { repostKinds } from "$lib/consts";

  const {
    nostrIdentifier,
    nestingLevel = 0,
  } = $props<{
    nostrIdentifier: string;
    nestingLevel?: number;
  }>();

  let event = $state<NDKEvent | null>(null);
  let profile = $state<{
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    lud16?: string;
    nip05?: string;
  } | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let authorDisplayName = $state<string | undefined>(undefined);

  // Maximum nesting level allowed
  const MAX_NESTING_LEVEL = 3;

  // AI-NOTE: 2025-01-24 - Embedded event component for rendering nested Nostr events
  // Supports up to 3 levels of nesting, after which it falls back to showing just the link

  $effect(() => {
    if (nostrIdentifier) {
      loadEvent();
    }
  });

  async function loadEvent() {
    if (nestingLevel >= MAX_NESTING_LEVEL) {
      // At max nesting level, don't load the event, just show the link
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      const ndk = get(ndkInstance);
      if (!ndk) {
        throw new Error("No NDK instance available");
      }

      // Clean the identifier (remove nostr: prefix if present)
      const cleanId = nostrIdentifier.replace(/^nostr:/, "");

      // Decode the identifier to get the event ID
      const decoded = nip19.decode(cleanId);
      if (!decoded) {
        throw new Error("Failed to decode Nostr identifier");
      }

      let eventId: string | undefined;
      if (decoded.type === "nevent") {
        eventId = decoded.data.id;
      } else if (decoded.type === "naddr") {
        // For naddr, we need to construct a filter
        const naddrData = decoded.data as any;
        const filter = {
          kinds: [naddrData.kind || 0],
          authors: [naddrData.pubkey],
          "#d": [naddrData.identifier],
        };
        const foundEvent = await fetchEventWithFallback(ndk, filter);
        if (!foundEvent) {
          throw new Error("Event not found");
        }
        event = foundEvent;
      } else if (decoded.type === "note") {
        // For note, treat it as a nevent
        eventId = (decoded.data as any).id;
      } else {
        throw new Error(`Unsupported identifier type: ${decoded.type}`);
      }

      // If we have an event ID, fetch the event
      if (eventId && !event) {
        event = await fetchEventWithFallback(ndk, eventId);
        if (!event) {
          throw new Error("Event not found");
        }
      }

      // Load profile for the event author
      if (event?.pubkey) {
        const npub = toNpub(event.pubkey);
        if (npub) {
          const userProfile = await getUserMetadata(npub);
          authorDisplayName =
            userProfile.displayName ||
            (userProfile as any).display_name ||
            userProfile.name ||
            event.pubkey;
        }
      }

      // Parse profile if it's a profile event
      if (event?.kind === 0) {
        try {
          profile = JSON.parse(event.content);
        } catch {
          profile = null;
        }
      }

    } catch (err) {
      console.error("Error loading embedded event:", err);
      error = err instanceof Error ? err.message : "Failed to load event";
    } finally {
      loading = false;
    }
  }

  function getEventTitle(event: NDKEvent): string {
    const titleTag = event.getMatchingTags("title")[0]?.[1];
    if (titleTag) return titleTag;
    
    // For profile events, use display name
    if (event.kind === 0 && profile) {
      return profile.display_name || profile.name || "Profile";
    }
    
    // For text events (kind 1), don't show a title if it would duplicate the content
    if (event.kind === 1) {
      return "";
    }
    
    // For other events, use first line of content, but filter out nostr identifiers
    if (event.content) {
      const firstLine = event.content.split("\n")[0].trim();
      if (firstLine) {
        // Remove nostr identifiers from the title
        const cleanTitle = firstLine.replace(/nostr:(npub|nprofile|note|nevent|naddr)[a-zA-Z0-9]{20,}/g, '').trim();
        if (cleanTitle) return cleanTitle.slice(0, 100);
      }
    }
    
    return "Untitled";
  }

  function getEventSummary(event: NDKEvent): string {
    if (event.kind === 0 && profile?.about) {
      return profile.about;
    }
    
    if (event.content) {
      const lines = event.content.split("\n");
      const summaryLines = lines.slice(1, 3).filter(line => line.trim());
      if (summaryLines.length > 0) {
        return summaryLines.join(" ").slice(0, 200);
      }
    }
    
    return "";
  }

  function navigateToEvent() {
    if (event) {
      goto(`/events?id=${nostrIdentifier}`);
    }
  }

  function getNaddrUrl(event: NDKEvent): string {
    return naddrEncode(event, $activeInboxRelays);
  }

  function isAddressableEvent(event: NDKEvent): boolean {
    return getEventType(event.kind || 0) === "addressable";
  }
</script>

{#if nestingLevel >= MAX_NESTING_LEVEL}
  <!-- At max nesting level, just show the link -->
  <div class="embedded-event-max-nesting min-w-0 overflow-hidden">
    <a 
      href="/events?id={nostrIdentifier}" 
      class="text-primary-600 dark:text-primary-500 hover:underline break-all"
      onclick={(e) => {
        e.preventDefault();
        goto(`/events?id=${nostrIdentifier}`);
      }}
    >
      {nostrIdentifier}
    </a>
  </div>
{:else if loading}
  <!-- Loading state -->
  <div class="embedded-event-loading bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 min-w-0 overflow-hidden">
    <div class="flex items-center space-x-2">
      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 flex-shrink-0"></div>
      <span class="text-sm text-gray-600 dark:text-gray-400">Loading event...</span>
    </div>
  </div>
{:else if error}
  <!-- Error state -->
  <div class="embedded-event-error bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800 min-w-0 overflow-hidden">
    <div class="flex items-center space-x-2">
      <span class="text-red-600 dark:text-red-400 text-sm flex-shrink-0">⚠️</span>
      <span class="text-sm text-red-600 dark:text-red-400">Failed to load event</span>
    </div>
    <a 
      href="/events?id={nostrIdentifier}" 
      class="text-primary-600 dark:text-primary-500 hover:underline text-sm mt-1 inline-block break-all"
      onclick={(e) => {
        e.preventDefault();
        goto(`/events?id=${nostrIdentifier}`);
      }}
    >
      View event directly
    </a>
  </div>
{:else if event}
  <!-- Event content -->
  <div class="embedded-event bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 mb-2 min-w-0 overflow-hidden">
    <!-- Event header -->
    <div class="flex items-center justify-between mb-3 min-w-0">
      <div class="flex items-center space-x-2 min-w-0">
        <span class="text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">
          Kind {event.kind}
        </span>
        <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
          ({getEventType(event.kind || 0)})
        </span>
        {#if event.pubkey}
          <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">•</span>
          <span class="text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">Author:</span>
          <div class="min-w-0 flex-1">
            {#if toNpub(event.pubkey)}
              {@render userBadge(
                toNpub(event.pubkey) as string,
                authorDisplayName,
              )}
            {:else}
              <span class="text-xs text-gray-700 dark:text-gray-300 break-all">
                {authorDisplayName || event.pubkey.slice(0, 8)}...{event.pubkey.slice(-4)}
              </span>
            {/if}
          </div>
        {/if}
      </div>
      <button
        class="text-xs text-primary-600 dark:text-primary-500 hover:underline flex-shrink-0"
        onclick={navigateToEvent}
      >
        View full event →
      </button>
    </div>

    <!-- Event title -->
    {#if getEventTitle(event)}
      <h4 class="font-semibold text-gray-900 dark:text-gray-100 mb-2 break-words">
        {getEventTitle(event)}
      </h4>
    {/if}

    <!-- Summary for non-content events -->
    {#if event.kind !== 1 && getEventSummary(event)}
      <div class="mb-2 min-w-0">
        <p class="text-sm text-gray-700 dark:text-gray-300 break-words">
          {getEventSummary(event)}
        </p>
      </div>
    {/if}

    <!-- Content for text events -->
    {#if event.kind === 1 || repostKinds.includes(event.kind)}
      <div class="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 min-w-0 overflow-hidden">
        {@render parsedContent(event.content.slice(0, 300))}
        {#if event.content.length > 300}
          <span class="text-gray-500 dark:text-gray-400">...</span>
        {/if}
      </div>
    <!-- Profile content -->
    {:else if event.kind === 0 && profile}
      <div class="space-y-2 min-w-0 overflow-hidden">
        {#if profile.picture}
          <img 
            src={profile.picture} 
            alt="Profile" 
            class="w-12 h-12 rounded-full object-cover flex-shrink-0"
          />
        {/if}
        {#if profile.about}
          <p class="text-sm text-gray-700 dark:text-gray-300 break-words">
            {profile.about.slice(0, 200)}
            {#if profile.about.length > 200}
              <span class="text-gray-500 dark:text-gray-400">...</span>
            {/if}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Event identifiers -->
    <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 min-w-0 overflow-hidden">
      <div class="flex flex-wrap gap-2 text-xs min-w-0">
        <span class="text-gray-500 dark:text-gray-400 flex-shrink-0">ID:</span>
        <span class="font-mono text-gray-700 dark:text-gray-300 break-all">
          {event.id.slice(0, 8)}...{event.id.slice(-4)}
        </span>
        {#if isAddressableEvent(event)}
          <span class="text-gray-500 dark:text-gray-400 flex-shrink-0">Address:</span>
          <span class="font-mono text-gray-700 dark:text-gray-300 break-all">
            {getNaddrUrl(event).slice(0, 12)}...{getNaddrUrl(event).slice(-8)}
          </span>
        {/if}
      </div>
    </div>
  </div>
{/if}
