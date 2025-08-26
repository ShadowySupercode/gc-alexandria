<script lang="ts">
  import { getMimeTags } from "$lib/utils/mime";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub } from "$lib/utils/nostrUtils";
  import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
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
  import { 
    repostContent, 
    quotedContent,
  } from "$lib/snippets/EmbeddedSnippets.svelte";
  import { repostKinds } from "$lib/consts";
  import { getNdkContext } from "$lib/ndk";
  import type { UserProfile } from "$lib/models/user_profile";
  import { basicMarkup } from "$lib/snippets/MarkupSnippets.svelte";

  const {
    event,
    profile = null,
    communityStatusMap = {},
  } = $props<{
    event: NDKEvent;
    profile?: UserProfile | null;
    communityStatusMap?: Record<string, boolean>;
  }>();

  const ndk = getNdkContext();

  let authorDisplayName = $state<string | undefined>(undefined);
  let showFullContent = $state(false);
  let shouldTruncate = $derived(event.content.length > 250 && !showFullContent);
  let isRepost = $derived(repostKinds.includes(event.kind) || (event.kind === 1 && event.getMatchingTags("q").length > 0));

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

  function getEventTypeDisplay(event: NDKEvent): string {
    const [_, MTag] = getMimeTags(event.kind || 0);
    return MTag[1].split("/")[1] || `Event Kind ${event.kind}`;
  }

  function getTagButtonInfo(tag: string[]): {
    text: string;
    gotoValue?: string;
  } {
    if (tag[0] === "a" && tag.length > 1) {
      const parts = tag[1].split(":");
      if (parts.length >= 3) {
        const [kind, pubkey, d] = parts;
        // Validate that pubkey is a valid hex string
        if (pubkey && /^[0-9a-fA-F]{64}$/.test(pubkey)) {
          try {
            const mockEvent = {
              kind: +kind,
              pubkey,
              tags: [["d", d]],
              content: "",
              id: "",
              sig: "",
            } as any;
            const naddr = naddrEncode(mockEvent, $activeInboxRelays);
            return {
              text: `a:${tag[1]}`,
              gotoValue: naddr,
            };
          } catch (error) {
            console.warn("Failed to encode naddr for a tag:", tag[1], error);
            return { text: `a:${tag[1]}` };
          }
        } else {
          console.warn("Invalid pubkey in a tag:", pubkey);
          return { text: `a:${tag[1]}` };
        }
      } else {
        console.warn("Invalid a tag format:", tag[1]);
        return { text: `a:${tag[1]}` };
      }
    } else if (tag[0] === "e" && tag.length > 1) {
      // Validate that event ID is a valid hex string
      if (/^[0-9a-fA-F]{64}$/.test(tag[1])) {
        try {
          const mockEvent = {
            id: tag[1],
            kind: 1,
            content: "",
            tags: [],
            pubkey: "",
            sig: "",
          } as any;
          const nevent = neventEncode(mockEvent, $activeInboxRelays);
          return {
            text: `e:${tag[1]}`,
            gotoValue: nevent,
          };
        } catch (error) {
          console.warn("Failed to encode nevent for e tag:", tag[1], error);
          return { text: `e:${tag[1]}` };
        }
      } else {
        console.warn("Invalid event ID in e tag:", tag[1]);
        return { text: `e:${tag[1]}` };
      }
    } else if (tag[0] === "p" && tag.length > 1) {
      const npub = toNpub(tag[1]);
      return {
        text: `p:${npub || tag[1]}`,
        gotoValue: npub ? npub : undefined,
      };
    } else if (tag[0] === "note" && tag.length > 1) {
      // 'note' tags are the same as 'e' tags but with different prefix
      if (/^[0-9a-fA-F]{64}$/.test(tag[1])) {
        try {
          const mockEvent = {
            id: tag[1],
            kind: 1,
            content: "",
            tags: [],
            pubkey: "",
            sig: "",
          } as any;
          const nevent = neventEncode(mockEvent, $activeInboxRelays);
          return {
            text: `note:${tag[1]}`,
            gotoValue: nevent,
          };
        } catch (error) {
          console.warn("Failed to encode nevent for note tag:", tag[1], error);
          return { text: `note:${tag[1]}` };
        }
      } else {
        console.warn("Invalid event ID in note tag:", tag[1]);
        return { text: `note:${tag[1]}` };
      }
    } else if (tag[0] === "d" && tag.length > 1) {
      // 'd' tags are used for identifiers in addressable events
      return {
        text: `d:${tag[1]}`,
        gotoValue: `d:${tag[1]}`,
      };
    } else if (tag[0] === "t" && tag.length > 1) {
      // 't' tags are hashtags - navigate to t-tag search
      return {
        text: `t:${tag[1]}`,
        gotoValue: `t:${tag[1]}`,
      };
    } else if (tag[0] === "q" && tag.length > 1) {
      // 'q' tags are quoted events - navigate to the quoted event
      if (/^[0-9a-fA-F]{64}$/.test(tag[1])) {
        try {
          const mockEvent = {
            id: tag[1],
            kind: 1,
            content: "",
            tags: [],
            pubkey: "",
            sig: "",
          } as any;
          const nevent = neventEncode(mockEvent, $activeInboxRelays);
          return {
            text: `q:${tag[1]}`,
            gotoValue: nevent,
          };
        } catch (error) {
          console.warn("Failed to encode nevent for q tag:", tag[1], error);
          return { text: `q:${tag[1]}` };
        }
      } else {
        console.warn("Invalid event ID in q tag:", tag[1]);
        return { text: `q:${tag[1]}` };
      }
    }
    return { text: `${tag[0]}:${tag[1]}` };
  }

  $effect(() => {
    if (!event?.pubkey) {
      authorDisplayName = undefined;
      return;
    }

    getUserMetadata(toNpub(event.pubkey) as string, undefined).then((profile) => {
      authorDisplayName =
        profile.displayName ||
        (profile as any).display_name ||
        profile.name ||
        event.pubkey;
    });
  });

  // --- Identifier helpers ---
  function getIdentifiers(
    event: NDKEvent,
    profile: any,
  ): { label: string; value: string; link?: string }[] {
    const ids: { label: string; value: string; link?: string }[] = [];
    if (event.kind === 0) {
      // NIP-05
      const nip05 = profile?.nip05 || getMatchingTags(event, "nip05")[0]?.[1];
      // npub
      const npub = toNpub(event.pubkey);
      if (npub)
        ids.push({ label: "npub", value: npub, link: `/events?id=${npub}` });
      // nprofile
      ids.push({
        label: "nprofile",
        value: nprofileEncode(event.pubkey, $activeInboxRelays),
        link: `/events?id=${nprofileEncode(event.pubkey, $activeInboxRelays)}`,
      });
      // nevent
      ids.push({
        label: "nevent",
        value: neventEncode(event, $activeInboxRelays),
        link: `/events?id=${neventEncode(event, $activeInboxRelays)}`,
      });
      // hex pubkey
      ids.push({ label: "pubkey", value: event.pubkey });
    } else {
      // nevent
      ids.push({
        label: "nevent",
        value: neventEncode(event, $activeInboxRelays),
        link: `/events?id=${neventEncode(event, $activeInboxRelays)}`,
      });
      // naddr (if addressable)
      try {
        const naddr = naddrEncode(event, $activeInboxRelays);
        ids.push({ label: "naddr", value: naddr, link: `/events?id=${naddr}` });
      } catch {}
      // hex id - make it a clickable link to search for the event ID
      ids.push({ label: "id", value: event.id, link: `/events?id=${event.id}` });
    }
    return ids;
  }

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
  {#if event.kind !== 0}
    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
      {@render basicMarkup(getEventTitle(event), ndk)}
    </h2>
  {/if}

  <!-- Notifications (for profile events) -->
  {#if event.kind === 0}
    <Notifications {event} />
  {/if}

  <div class="flex items-center space-x-2 min-w-0">
    {#if toNpub(event.pubkey)}
      <span class="text-gray-600 dark:text-gray-400 min-w-0"
        >Author: {@render userBadge(
          toNpub(event.pubkey) as string,
          profile?.display_name || undefined,
          ndk,
        )}</span
      >
    {:else}
      <span class="text-gray-600 dark:text-gray-400 min-w-0 break-words"
        >Author: {profile?.display_name || event.pubkey}</span
      >
    {/if}
  </div>

  <div class="flex items-center space-x-2 min-w-0">
    <span class="text-gray-700 dark:text-gray-300 flex-shrink-0">Kind:</span>
    <span class="font-mono flex-shrink-0">{event.kind}</span>
    <span class="text-gray-700 dark:text-gray-300 flex-shrink-0"
      >({getEventTypeDisplay(event)})</span
    >
  </div>

  <div class="flex flex-col space-y-1 min-w-0">
    <span class="text-gray-700 dark:text-gray-300">Summary:</span>
    <div class="prose dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere min-w-0">
      {@render basicMarkup(getEventSummary(event), ndk)}
    </div>
  </div>

  <!-- Containing Publications -->
  <ContainingIndexes {event} />

  <!-- Content -->
  {#if event.kind !== 0}
    {@const kind = event.kind}
    {@const content = event.content.trim()}
    <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mb-4 rounded-lg border max-w-full overflow-hidden">
      <div class="flex flex-col space-y-1 min-w-0">
        <span class="text-gray-700 dark:text-gray-300 font-semibold">Content:</span>
        <div class="prose dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 break-words overflow-wrap-anywhere min-w-0">
        {#if isRepost}
          <!-- Repost content handling -->
          {#if repostKinds.includes(event.kind)}
            <!-- Kind 6 and 16 reposts - stringified JSON content -->
            <div class="border-l-4 border-primary-300 dark:border-primary-600 pl-3 mb-2">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {event.kind === 6 ? 'Reposted content:' : 'Generic reposted content:'}
              </div>
              {@render repostContent(event.content)}
            </div>
          {:else if event.kind === 1 && event.getMatchingTags("q").length > 0}
            <!-- Quote repost - kind 1 with q tag -->
            <div class="border-l-4 border-primary-300 dark:border-primary-600 pl-3 mb-2">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Quote repost:
              </div>
              {@render quotedContent(event, [], ndk)}
              {#if content}
                <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Added comment:
                  </div>
                  {#if repostKinds.includes(kind)}
                    {@html content}
                  {:else}
                    {@render basicMarkup(content, ndk)}
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        {:else}
          <!-- Regular content -->
          <div class={shouldTruncate ? 'max-h-32 overflow-hidden' : ''}>
            {#if repostKinds.includes(kind)}
              {@html content}
            {:else}
              {@render basicMarkup(content, ndk)}
            {/if}
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

  <!-- If event is profile -->
  {#if event.kind === 0}
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
            {#if identifier.link}
              <a
                href={identifier.link}
                class="font-mono text-sm text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-100 break-all cursor-pointer"
                title={identifier.value}
              >
                {identifier.value.slice(0, 20)}...{identifier.value.slice(-8)}
              </a>
            {:else}
              <span class="font-mono text-sm text-gray-900 dark:text-gray-100 break-all" title={identifier.value}>
                {identifier.value.slice(0, 20)}...{identifier.value.slice(-8)}
              </span>
            {/if}
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
                    // AI-NOTE:  E-tag navigation may cause comment feed update issues
                    // When navigating to a new event via e-tag, the CommentViewer component
                    // may experience timing issues that result in:
                    // - Empty comment feeds even when comments exist
                    // - UI flashing between different thread views
                    // - Delayed comment loading
                    // This is likely due to race conditions between event prop changes
                    // and comment fetching in the CommentViewer component.
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
