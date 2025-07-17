<script lang="ts">
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import { getMimeTags } from "$lib/utils/mime";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub } from "$lib/utils/nostrUtils";
  import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
  import { standardRelays } from "$lib/consts";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import ProfileHeader from "$components/cards/ProfileHeader.svelte";
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getUserMetadata } from "$lib/utils/nostrUtils";
  import CopyToClipboard from "$lib/components/util/CopyToClipboard.svelte";
  import { navigateToEvent } from "$lib/utils/nostrEventService";

  const {
    event,
    profile = null,
    searchValue = null,
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
  }>();

  let showFullContent = $state(false);
  let parsedContent = $state('');
  let contentPreview = $state('');
  let authorDisplayName = $state<string | undefined>(undefined);

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
    if ((event.kind === 30040 || event.kind === 30041 || event.kind === 30818) && event.content) {
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

  function renderTag(tag: string[]): string {
    if (tag[0] === 'a' && tag.length > 1) {
      const [kind, pubkey, d] = tag[1].split(':');
      return `<a href='/events?id=${naddrEncode({kind: +kind, pubkey, tags: [['d', d]], content: '', id: '', sig: ''} as any, standardRelays)}' class='underline text-primary-700'>a:${tag[1]}</a>`;
    } else if (tag[0] === 'e' && tag.length > 1) {
      return `<a href='/events?id=${neventEncode({id: tag[1], kind: 1, content: '', tags: [], pubkey: '', sig: ''} as any, standardRelays)}' class='underline text-primary-700'>e:${tag[1]}</a>`;
    } else {
      return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>${tag[0]}:${tag[1]}</span>`;
    }
  }

  function getTagButtonInfo(tag: string[]): {
    text: string;
    gotoValue?: string;
  } {
    if (tag[0] === 'a' && tag.length > 1) {
      const [kind, pubkey, d] = tag[1].split(':');
      return {
        text: `a:${tag[1]}`,
        gotoValue: naddrEncode({kind: +kind, pubkey, tags: [['d', d]], content: '', id: '', sig: ''} as any, standardRelays)
      };
    } else if (tag[0] === 'e' && tag.length > 1) {
      return {
        text: `e:${tag[1]}`,
        gotoValue: neventEncode({id: tag[1], kind: 1, content: '', tags: [], pubkey: '', sig: ''} as any, standardRelays)
      };
    } else if (tag[0] === 'p' && tag.length > 1) {
      const npub = toNpub(tag[1]);
      return {
        text: `p:${npub || tag[1]}`,
        gotoValue: npub ? `/events?id=${npub}` : undefined
      };
    }
    return { text: `${tag[0]}:${tag[1]}` };
  }

  $effect(() => {
    if (event && event.kind !== 0 && event.content) {
      parseBasicmarkup(event.content).then((html) => {
        parsedContent = html;
        contentPreview = html.slice(0, 250);
      });
    }
  });

  $effect(() => {
    if(!event?.pubkey) {
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
        value: nprofileEncode(event.pubkey, standardRelays),
        link: `/events?id=${nprofileEncode(event.pubkey, standardRelays)}`,
      });
      // nevent
      ids.push({
        label: "nevent",
        value: neventEncode(event, standardRelays),
        link: `/events?id=${neventEncode(event, standardRelays)}`,
      });
      // hex pubkey
      ids.push({ label: "pubkey", value: event.pubkey });
    } else {
      // nevent
      ids.push({
        label: "nevent",
        value: neventEncode(event, standardRelays),
        link: `/events?id=${neventEncode(event, standardRelays)}`,
      });
      // naddr (if addressable)
      try {
        const naddr = naddrEncode(event, standardRelays);
        ids.push({ label: "naddr", value: naddr, link: `/events?id=${naddr}` });
      } catch {}
      // hex id
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

  onMount(() => {
    function handleInternalLinkClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.tagName === 'A') {
        const href = (target as HTMLAnchorElement).getAttribute('href');
        if (href && href.startsWith('/')) {
          event.preventDefault();
          goto(href);
        }
      }
    }
    document.addEventListener('click', handleInternalLinkClick);
    return () => document.removeEventListener('click', handleInternalLinkClick);
  });
</script>

<div class="flex flex-col space-y-4">
  {#if event.kind !== 0 && getEventTitle(event)}
    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
      {getEventTitle(event)}
    </h2>
  {/if}

  <div class="flex items-center space-x-2">
    {#if toNpub(event.pubkey)}
      <span class="text-gray-600 dark:text-gray-400">Author: {@render userBadge(toNpub(event.pubkey) as string, profile?.display_name || event.pubkey)}</span>
    {:else}
      <span class="text-gray-600 dark:text-gray-400">Author: {profile?.display_name || event.pubkey}</span>
    {/if}
  </div>

  <div class="flex items-center space-x-2">
    <span class="text-gray-700 dark:text-gray-300">Kind:</span>
    <span class="font-mono">{event.kind}</span>
    <span class="text-gray-700 dark:text-gray-300"
      >({getEventTypeDisplay(event)})</span
    >
  </div>

  {#if getEventSummary(event)}
    <div class="flex flex-col space-y-1">
      <span class="text-gray-700 dark:text-gray-300">Summary:</span>
      <p class="text-gray-900 dark:text-gray-100">{getEventSummary(event)}</p>
    </div>
  {/if}

  {#if getEventHashtags(event).length}
    <div class="flex flex-col space-y-1">
      <span class="text-gray-700 dark:text-gray-300">Tags:</span>
      <div class="flex flex-wrap gap-2">
        {#each getEventHashtags(event) as tag}
          <span
            class="px-2 py-1 rounded bg-primary-100 text-primary-800 text-sm font-medium"
            >#{tag}</span
          >
        {/each}
      </div>
    </div>
  {/if}

  <!-- Content -->
  <div class="flex flex-col space-y-1">
    {#if event.kind !== 0}
      <span class="text-gray-700 dark:text-gray-300">Content:</span>
      <div class="prose dark:prose-invert max-w-none">
        {@html showFullContent ? parsedContent : contentPreview}
        {#if !showFullContent && parsedContent.length > 250}
          <button
            class="mt-2 text-primary-700 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-200"
            onclick={() => (showFullContent = true)}>Show more</button
          >
        {/if}
      </div>
    {/if}
  </div>

  <!-- If event is profile -->
  {#if event.kind === 0}
    <ProfileHeader
      {event}
      {profile}
      identifiers={getIdentifiers(event, profile)}
    />
  {/if}

  <!-- Tags Array -->
  {#if event.tags && event.tags.length}
    <div class="flex flex-col space-y-1">
      <span class="text-gray-700 dark:text-gray-300">Event Tags:</span>
      <div class="flex flex-wrap gap-2">
        {#each event.tags as tag}
          {@const tagInfo = getTagButtonInfo(tag)}
          {#if tagInfo.text && tagInfo.gotoValue}
            <button
              onclick={() =>
                navigateToEvent(tagInfo.gotoValue!)}
              class="text-primary-700 dark:text-primary-300 cursor-pointer bg-transparent border-none p-0 text-left hover:text-primary-900 dark:hover:text-primary-100"
            >
              {tagInfo.text}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- Raw Event JSON -->
  <details
    class="relative w-full max-w-2xl md:max-w-full bg-primary-50 dark:bg-primary-900 rounded p-4"
  >
    <summary
      class="cursor-pointer font-semibold text-primary-700 dark:text-primary-300 mb-2"
    >
      Show Raw Event JSON
    </summary>
    <div class="absolute top-4 right-4">
      <CopyToClipboard
        displayText=""
        copyText={JSON.stringify(event.rawEvent(), null, 2)}
      />
    </div>
    <pre
      class="overflow-x-auto text-xs bg-highlight dark:bg-primary-900 rounded p-4 mt-2 font-mono"
      style="line-height: 1.7; font-size: 1rem;">
{JSON.stringify(event.rawEvent(), null, 2)}
    </pre>
  </details>
</div>
