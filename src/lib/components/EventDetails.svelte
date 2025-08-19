<script lang="ts">
  import { parseEmbeddedMarkup } from "$lib/utils/markup/embeddedMarkupParser";
  import EmbeddedEventRenderer from "./EmbeddedEventRenderer.svelte";
  import { getMimeTags } from "$lib/utils/mime";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub } from "$lib/utils/nostrUtils";
  import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
  import { nip19 } from "nostr-tools";
  import { activeInboxRelays } from "$lib/ndk";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import ProfileHeader from "$components/cards/ProfileHeader.svelte";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { getUserMetadata } from "$lib/utils/nostrUtils";
  import CopyToClipboard from "$lib/components/util/CopyToClipboard.svelte";
  import { navigateToEvent } from "$lib/utils/nostrEventService";
  import ContainingIndexes from "$lib/components/util/ContainingIndexes.svelte";
  import Notifications from "$lib/components/Notifications.svelte";
  import { parseRepostContent } from "$lib/utils/notification_utils";
  import { checkCommunity } from "$lib/utils/search_utility";
  import { isPubkeyInUserLists, fetchCurrentUserLists } from "$lib/utils/user_lists";

  const {
    event,
    profile = null,
    searchValue = null,
    communityStatusMap = {},
  } = $props<{
    event: NDKEvent;
    profile?: {
      name?: string;
      display_name?: string;
      about?: string;
      picture?: string;
      banner?: string;
      website?: string;
      lud16?: string;
      nip05?: string;
    } | null;
    searchValue?: string | null;
    communityStatusMap?: Record<string, boolean>;
  }>();

  let showFullContent = $state(false);
  let parsedContent = $state("");
  let contentProcessing = $state(false);
  let authorDisplayName = $state<string | undefined>(undefined);
  let communityStatus = $state<boolean | null>(null);
  let isInUserLists = $state<boolean | null>(null);

  // Determine if content should be truncated
  let shouldTruncate = $state(false);
  
  $effect(() => {
    shouldTruncate = event.content.length > 250 && !showFullContent;
  });

  // Check community status and user list status for the event author
  $effect(() => {
    if (event?.pubkey) {
      // First check if we have cached profileData with user list information
      const cachedProfileData = (event as any).profileData;
      console.log(`[EventDetails] Checking user list status for ${event.pubkey}, cached profileData:`, cachedProfileData);
      
      if (cachedProfileData && typeof cachedProfileData.isInUserLists === 'boolean') {
        isInUserLists = cachedProfileData.isInUserLists;
        console.log(`[EventDetails] Using cached user list status for ${event.pubkey}: ${isInUserLists}`);
      } else {
        console.log(`[EventDetails] No cached user list data, fetching for ${event.pubkey}`);
        // Fallback to fetching user lists
        fetchCurrentUserLists()
          .then((userLists) => {
            console.log(`[EventDetails] Fetched ${userLists.length} user lists for ${event.pubkey}`);
            isInUserLists = isPubkeyInUserLists(event.pubkey, userLists);
            console.log(`[EventDetails] Final user list status for ${event.pubkey}: ${isInUserLists}`);
          })
          .catch((error) => {
            console.error(`[EventDetails] Error fetching user lists for ${event.pubkey}:`, error);
            isInUserLists = false;
          });
      }

      // Check community status - use cached data if available
      if (communityStatusMap[event.pubkey] !== undefined) {
        communityStatus = communityStatusMap[event.pubkey];
        console.log(`[EventDetails] Using cached community status for ${event.pubkey}: ${communityStatus}`);
      } else {
        // Fallback to checking community status
        checkCommunity(event.pubkey)
          .then((status) => {
            communityStatus = status;
          })
          .catch(() => {
            communityStatus = false;
          });
      }
    }
  });

  // AI-NOTE: Event metadata extraction functions
  function getEventTitle(event: NDKEvent): string {
    // First try to get title from title tag
    const titleTag = getMatchingTags(event, "title")[0]?.[1];
    if (titleTag) {
      return titleTag;
    }

    // For kind 30023 events, extract title from markdown content if no title tag
    if (event.kind === 30023 && event.content) {
      const match = event.content.match(/^#\s+(.+)$/m);
      if (match) {
        return match[1].trim();
      }
    }

    // For kind 30040, 30041, and 30818 events, extract title from AsciiDoc content if no title tag
    if (
      (event.kind === 30040 || event.kind === 30041 || event.kind === 30818) &&
      event.content
    ) {
      // First try to find a document header (= )
      const docMatch = event.content.match(/^=\s+(.+)$/m);
      if (docMatch) {
        return docMatch[1].trim();
      }

      // If no document header, try to find the first section header (== )
      const sectionMatch = event.content.match(/^==\s+(.+)$/m);
      if (sectionMatch) {
        return sectionMatch[1].trim();
      }
    }

    return "Untitled";
  }

  function getEventSummary(event: NDKEvent): string {
    return getMatchingTags(event, "summary")[0]?.[1] || "";
  }

  function getEventHashtags(event: NDKEvent): string[] {
    return getMatchingTags(event, "t").map((tag: string[]) => tag[1]);
  }

  function getEventTypeDisplay(event: NDKEvent): string {
    const [mTag, MTag] = getMimeTags(event.kind || 0);
    return MTag[1].split("/")[1] || `Event Kind ${event.kind}`;
  }

  // AI-NOTE: Tag processing utilities
  function isValidHexString(str: string): boolean {
    return /^[0-9a-fA-F]{64}$/.test(str);
  }

  function createMockEvent(id: string, kind: number = 1): any {
    return {
      id,
      kind,
      content: "",
      tags: [],
      pubkey: "",
      sig: "",
    };
  }

  function createMockAddressableEvent(kind: number, pubkey: string, d: string): any {
    return {
      kind,
      pubkey,
      tags: [["d", d]],
      content: "",
      id: "",
      sig: "",
    };
  }

  function renderTag(tag: string[]): string {
    const [tagType, tagValue] = tag;
    
    if (!tagValue) {
      return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>${tagType}:${tagValue}</span>`;
    }

    try {
      switch (tagType) {
        case "a": {
          const parts = tagValue.split(":");
          if (parts.length >= 3) {
            const [kind, pubkey, d] = parts;
            if (pubkey && isValidHexString(pubkey)) {
              const mockEvent = createMockAddressableEvent(+kind, pubkey, d);
              const naddr = naddrEncode(mockEvent, $activeInboxRelays);
              return `<a href='/events?id=${naddr}' class='underline text-primary-700'>a:${tagValue}</a>`;
            }
          }
          break;
        }
        case "e":
        case "note": {
          if (isValidHexString(tagValue)) {
            const mockEvent = createMockEvent(tagValue);
            const nevent = neventEncode(mockEvent, $activeInboxRelays);
            const prefix = tagType === "note" ? "note:" : "e:";
            return `<a href='/events?id=${nevent}' class='underline text-primary-700'>${prefix}${tagValue}</a>`;
          }
          break;
        }
        case "d": {
          return `<a href='/events?d=${encodeURIComponent(tagValue)}' class='underline text-primary-700'>d:${tagValue}</a>`;
        }
      }
    } catch (error) {
      console.warn(`Failed to encode ${tagType} tag:`, tagValue, error);
    }

    return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>${tagType}:${tagValue}</span>`;
  }

  function getTagButtonInfo(tag: string[]): {
    text: string;
    gotoValue?: string;
  } {
    const [tagType, tagValue] = tag;
    
    if (!tagValue) {
      return { text: `${tagType}:${tagValue}` };
    }

    try {
      switch (tagType) {
        case "a": {
          const parts = tagValue.split(":");
          if (parts.length >= 3) {
            const [kind, pubkey, d] = parts;
            if (pubkey && isValidHexString(pubkey)) {
              const mockEvent = createMockAddressableEvent(+kind, pubkey, d);
              const naddr = naddrEncode(mockEvent, $activeInboxRelays);
              return { text: `a:${tagValue}`, gotoValue: naddr };
            }
          }
          break;
        }
        case "e":
        case "note": {
          if (isValidHexString(tagValue)) {
            const mockEvent = createMockEvent(tagValue);
            const nevent = neventEncode(mockEvent, $activeInboxRelays);
            const prefix = tagType === "note" ? "note:" : "e:";
            return { text: `${prefix}${tagValue}`, gotoValue: nevent };
          }
          break;
        }
        case "p": {
          const npub = toNpub(tagValue);
          return {
            text: `p:${npub || tagValue}`,
            gotoValue: npub || undefined,
          };
        }
        case "d": {
          return { text: `d:${tagValue}`, gotoValue: `d:${tagValue}` };
        }
        case "t": {
          return { text: `t:${tagValue}`, gotoValue: `t:${tagValue}` };
        }
      }
    } catch (error) {
      console.warn(`Failed to encode ${tagType} tag:`, tagValue, error);
    }

    return { text: `${tagType}:${tagValue}` };
  }

  // AI-NOTE: URL generation functions
  function getNeventUrl(event: NDKEvent): string {
    return neventEncode(event, $activeInboxRelays);
  }

  function getNaddrUrl(event: NDKEvent): string {
    return naddrEncode(event, $activeInboxRelays);
  }

  function getNprofileUrl(pubkey: string): string {
    return nprofileEncode(pubkey, $activeInboxRelays);
  }

  // AI-NOTE: Content processing effect
  $effect(() => {
    if (event && event.kind !== 0 && event.content) {
      contentProcessing = true;
      
      // Use parseRepostContent for kind 6 and 16 events (reposts)
      if (event.kind === 6 || event.kind === 16) {
        parseRepostContent(event.content).then((html) => {
          parsedContent = html;
          contentProcessing = false;
        }).catch((error) => {
          console.error('Error parsing repost content:', error);
          contentProcessing = false;
        });
      } else {
        // Use embedded markup parser for better Nostr event support
        parseEmbeddedMarkup(event.content, 0).then((html) => {
          parsedContent = html;
          contentProcessing = false;
        }).catch((error) => {
          console.error('Error parsing embedded markup:', error);
          contentProcessing = false;
        });
      }
    } else {
      contentProcessing = false;
      parsedContent = "";
    }
  });

  // AI-NOTE: Author metadata effect
  $effect(() => {
    if (!event?.pubkey) {
      authorDisplayName = undefined;
      return;
    }
    getUserMetadata(toNpub(event.pubkey) as string).then((profile) => {
      authorDisplayName =
        profile.displayName ||
        (profile as any).display_name ||
        profile.name ||
        event.pubkey;
    });
  });

  // AI-NOTE: Identifier helpers
  function getIdentifiers(
    event: NDKEvent,
    profile: any,
  ): { label: string; value: string; link?: string }[] {
    const ids: { label: string; value: string; link?: string }[] = [];
    
    if (event.kind === 0) {
      // Profile event identifiers
      const npub = toNpub(event.pubkey);
      if (npub) {
        ids.push({ label: "npub", value: npub, link: `/events?id=${npub}` });
      }
      
      // Decode npub to get raw hex string for nprofile encoding
      let rawPubkey = event.pubkey;
      if (event.pubkey.startsWith('npub')) {
        try {
          const decoded = nip19.decode(event.pubkey);
          if (decoded.type === 'npub') {
            rawPubkey = decoded.data;
          }
        } catch (error) {
          console.warn('Failed to decode npub for nprofile encoding:', error);
        }
      }
      
      ids.push({
        label: "nprofile",
        value: nprofileEncode(rawPubkey, $activeInboxRelays),
        link: `/events?id=${nprofileEncode(rawPubkey, $activeInboxRelays)}`,
      });
      
      // For nevent encoding, we need to ensure the event has proper hex strings
      try {
        const nevent = neventEncode(event, $activeInboxRelays);
        ids.push({
          label: "nevent",
          value: nevent,
          link: `/events?id=${nevent}`,
        });
      } catch (error) {
        console.warn('Failed to encode nevent for profile event:', error);
        // Fallback: just show the event ID
        ids.push({ label: "event id", value: event.id });
      }
      
      ids.push({ label: "pubkey", value: event.pubkey });
    } else {
      // Non-profile event identifiers
      // For nevent encoding, we need to ensure the event has proper hex strings
      try {
        const nevent = neventEncode(event, $activeInboxRelays);
        ids.push({
          label: "nevent",
          value: nevent,
          link: `/events?id=${nevent}`,
        });
      } catch (error) {
        console.warn('Failed to encode nevent for non-profile event:', error);
        // Fallback: just show the event ID
        ids.push({ label: "event id", value: event.id });
      }
      
      // naddr (if addressable)
      try {
        const naddr = naddrEncode(event, $activeInboxRelays);
        ids.push({ label: "naddr", value: naddr, link: `/events?id=${naddr}` });
      } catch {}
      
      ids.push({ label: "id", value: event.id });
    }
    
    return ids;
  }

  function isCurrentSearch(value: string): boolean {
    if (!searchValue) return false;
    // Compare ignoring case and possible nostr: prefix
    const norm = (s: string) => s.replace(/^nostr:/, "").toLowerCase();
    return norm(value) === norm(searchValue);
  }

  // AI-NOTE: Navigation handler for internal links
  onMount(() => {
    function handleInternalLinkClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.tagName === "A") {
        const href = (target as HTMLAnchorElement).getAttribute("href");
        if (href && href.startsWith("/")) {
          event.preventDefault();
          goto(href);
        }
      }
    }
    document.addEventListener("click", handleInternalLinkClick);
    return () => document.removeEventListener("click", handleInternalLinkClick);
  });
</script>

<div class="flex flex-col space-y-4 min-w-0">
  {#if event.kind !== 0 && getEventTitle(event)}
    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
      {getEventTitle(event)}
    </h2>
  {/if}

  <!-- Notifications (for profile events) -->
  {#if event.kind === 0}
    <Notifications {event} />
  {/if}

  {#if !(event.kind === 0)}
  <div class="flex items-center space-x-2 min-w-0">
    {#if toNpub(event.pubkey)}
      <span class="text-gray-600 dark:text-gray-400 min-w-0 flex items-center gap-2"
        >Author: {@render userBadge(
          toNpub(event.pubkey) as string,
          profile?.display_name || undefined,
        )}
        {#if isInUserLists === true}
          <div
            class="flex-shrink-0 w-4 h-4 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center"
            title="In your lists (follows, etc.)"
          >
            <svg
              class="w-3 h-3 text-red-600 dark:text-red-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              />
            </svg>
          </div>
        {:else if isInUserLists === false}
          <div class="flex-shrink-0 w-4 h-4"></div>
        {/if}
        {#if communityStatus === true}
          <div
            class="flex-shrink-0 w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
            title="Has posted to the community"
          >
            <svg
              class="w-3 h-3 text-yellow-600 dark:text-yellow-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
          </div>
        {:else if communityStatus === false}
          <div class="flex-shrink-0 w-4 h-4"></div>
        {/if}
      </span>
    {:else}
      <span class="text-gray-600 dark:text-gray-400 min-w-0 break-words"
        >Author: {profile?.display_name || event.pubkey}</span
      >
    {/if}
  </div>
  {/if}

  <div class="flex items-center space-x-2 min-w-0">
    <span class="text-gray-700 dark:text-gray-300 flex-shrink-0">Kind:</span>
    <span class="font-mono flex-shrink-0">{event.kind}</span>
    <span class="text-gray-700 dark:text-gray-300 flex-shrink-0"
      >({getEventTypeDisplay(event)})</span
    >
  </div>

  {#if getEventSummary(event)}
    <div class="flex flex-col space-y-1 min-w-0">
      <span class="text-gray-700 dark:text-gray-300">Summary:</span>
      <p class="text-gray-900 dark:text-gray-100 break-words">{getEventSummary(event)}</p>
    </div>
  {/if}

  <!-- Containing Publications -->
  <ContainingIndexes {event} />

  <!-- Content -->
  {#if event.kind !== 0}
    <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mb-4 rounded-lg border max-w-full overflow-hidden">
      <div class="flex flex-col space-y-1 min-w-0">
        <span class="text-gray-700 dark:text-gray-300 font-semibold">Content:</span>
        <div class="prose dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere min-w-0">
          {#if contentProcessing}
            <div class="text-gray-500 dark:text-gray-400 italic">Processing content...</div>
          {:else}
            <div class={shouldTruncate ? 'max-h-32 overflow-hidden' : ''}>
              <EmbeddedEventRenderer content={parsedContent} nestingLevel={0} />
            </div>
            {#if shouldTruncate}
              <button
                class="mt-2 text-primary-700 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-200"
                onclick={() => (showFullContent = true)}>Show more</button
              >
            {/if}
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Show ProfileHeader for all events except profile events (kind 0) when in search context to avoid redundancy -->
  {#if (event.kind === 0)}
    <ProfileHeader
      {event}
      {profile}
      {communityStatusMap}
    />
  {/if}

  <!-- Raw Event JSON -->
  <details
    class="relative w-full max-w-2xl md:max-w-full bg-primary-50 dark:bg-primary-900 rounded p-4 overflow-hidden"
  >
    <summary
      class="cursor-pointer font-semibold text-primary-700 dark:text-primary-300 mb-2"
    >
      Show details
    </summary>
    
    <!-- Identifiers Section -->
    <div class="mb-4 max-w-full overflow-hidden">
      <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Identifiers:</h4>
      <div class="flex flex-col gap-2 min-w-0">
        {#each getIdentifiers(event, profile) as identifier}
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-gray-600 dark:text-gray-400 flex-shrink-0">{identifier.label}:</span>
          <div class="flex-1 min-w-0 flex items-center gap-2">
            <span class="font-mono text-sm text-gray-900 dark:text-gray-100 break-all" title={identifier.value}>
              {identifier.value.slice(0, 20)}...{identifier.value.slice(-8)}
            </span>
            <CopyToClipboard
              displayText=""
              copyText={identifier.value}
            />
          </div>
        </div>
        {/each}
      </div>
    </div>

    <!-- Event Tags Section -->
    {#if event.tags && event.tags.length}
      <div class="mb-4 max-w-full overflow-hidden">
        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Event Tags:</h4>
        <div class="flex flex-wrap gap-2 break-words min-w-0">
          {#each event.tags as tag}
            {@const tagInfo = getTagButtonInfo(tag)}
            {#if tagInfo.text && tagInfo.gotoValue}
              <button
                onclick={() => {
                  // Handle different types of gotoValue
                  if (
                    tagInfo.gotoValue!.startsWith("naddr") ||
                    tagInfo.gotoValue!.startsWith("nevent") ||
                    tagInfo.gotoValue!.startsWith("npub") ||
                    tagInfo.gotoValue!.startsWith("nprofile") ||
                    tagInfo.gotoValue!.startsWith("note")
                  ) {
                    // For naddr, nevent, npub, nprofile, note - navigate directly
                    goto(`/events?id=${tagInfo.gotoValue!}`);
                  } else if (tagInfo.gotoValue!.startsWith("/")) {
                    // For relative URLs - navigate directly
                    goto(tagInfo.gotoValue!);
                  } else if (tagInfo.gotoValue!.startsWith("d:")) {
                    // For d-tag searches - navigate to d-tag search
                    const dTag = tagInfo.gotoValue!.substring(2);
                    goto(`/events?d=${encodeURIComponent(dTag)}`);
                  } else if (tagInfo.gotoValue!.startsWith("t:")) {
                    // For t-tag searches - navigate to t-tag search
                    const tTag = tagInfo.gotoValue!.substring(2);
                    goto(`/events?t=${encodeURIComponent(tTag)}`);
                  } else if (/^[0-9a-fA-F]{64}$/.test(tagInfo.gotoValue!)) {
                    // For hex event IDs - use navigateToEvent
                    navigateToEvent(tagInfo.gotoValue!);
                  } else {
                    // For other cases, try direct navigation
                    goto(`/events?id=${tagInfo.gotoValue!}`);
                  }
                }}
                class="text-primary-700 dark:text-primary-300 cursor-pointer bg-transparent border-none p-0 text-left hover:text-primary-900 dark:hover:text-primary-100 break-all max-w-full"
              >
                {tagInfo.text}
              </button>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Raw Event JSON Section -->
    <div class="mb-4 max-w-full overflow-hidden">
      <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Raw Event JSON:</h4>
      <div class="relative min-w-0">
        <div class="absolute top-0 right-0 z-10">
          <CopyToClipboard
            displayText=""
            copyText={JSON.stringify(event.rawEvent(), null, 2)}
          />
        </div>
        <pre
          class="overflow-x-auto text-xs bg-highlight dark:bg-primary-900 rounded p-4 mt-2 font-mono break-words whitespace-pre-wrap min-w-0"
          style="line-height: 1.7; font-size: 1rem;">
{JSON.stringify(event.rawEvent(), null, 2)}
        </pre>
      </div>
    </div>
  </details>
</div>
