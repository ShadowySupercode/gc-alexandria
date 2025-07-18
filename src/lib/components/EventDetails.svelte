<script lang="ts">
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import { getMimeTags } from "$lib/utils/mime";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub } from "$lib/utils/nostrUtils";
  import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import ProfileHeader from "$components/cards/ProfileHeader.svelte";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { getUserMetadata } from "$lib/utils/nostrUtils";
  import CopyToClipboard from "$lib/components/util/CopyToClipboard.svelte";
  import { navigateToEvent } from "$lib/utils/nostrEventService";
  import ContainingIndexes from "$lib/components/util/ContainingIndexes.svelte";

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
  let parsedContent = $state("");
  let contentPreview = $state("");
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

  function renderTag(tag: string[]): string {
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
            return `<a href='/events?id=${naddr}' class='underline text-primary-700'>a:${tag[1]}</a>`;
          } catch (error) {
            console.warn(
              "Failed to encode naddr for a tag in renderTag:",
              tag[1],
              error,
            );
            return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>a:${tag[1]}</span>`;
          }
        } else {
          console.warn("Invalid pubkey in a tag in renderTag:", pubkey);
          return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>a:${tag[1]}</span>`;
        }
      } else {
        console.warn("Invalid a tag format in renderTag:", tag[1]);
        return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>a:${tag[1]}</span>`;
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
          return `<a href='/events?id=${nevent}' class='underline text-primary-700'>e:${tag[1]}</a>`;
        } catch (error) {
          console.warn(
            "Failed to encode nevent for e tag in renderTag:",
            tag[1],
            error,
          );
          return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>e:${tag[1]}</span>`;
        }
      } else {
        console.warn("Invalid event ID in e tag in renderTag:", tag[1]);
        return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>e:${tag[1]}</span>`;
      }
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
          return `<a href='/events?id=${nevent}' class='underline text-primary-700'>note:${tag[1]}</a>`;
        } catch (error) {
          console.warn(
            "Failed to encode nevent for note tag in renderTag:",
            tag[1],
            error,
          );
          return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>note:${tag[1]}</span>`;
        }
      } else {
        console.warn("Invalid event ID in note tag in renderTag:", tag[1]);
        return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>note:${tag[1]}</span>`;
      }
    } else if (tag[0] === "d" && tag.length > 1) {
      // 'd' tags are used for identifiers in addressable events
      return `<a href='/events?d=${encodeURIComponent(tag[1])}' class='underline text-primary-700'>d:${tag[1]}</a>`;
    } else {
      return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>${tag[0]}:${tag[1]}</span>`;
    }
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
    }
    return { text: `${tag[0]}:${tag[1]}` };
  }

  function getNeventUrl(event: NDKEvent): string {
    return neventEncode(event, $activeInboxRelays);
  }

  function getNaddrUrl(event: NDKEvent): string {
    return naddrEncode(event, $activeInboxRelays);
  }

  function getNprofileUrl(pubkey: string): string {
    return nprofileEncode(pubkey, $activeInboxRelays);
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

<div class="flex flex-col space-y-4">
  {#if event.kind !== 0 && getEventTitle(event)}
    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
      {getEventTitle(event)}
    </h2>
  {/if}

  <div class="flex items-center space-x-2">
    {#if toNpub(event.pubkey)}
      <span class="text-gray-600 dark:text-gray-400"
        >Author: {@render userBadge(
          toNpub(event.pubkey) as string,
          profile?.display_name || event.pubkey,
        )}</span
      >
    {:else}
      <span class="text-gray-600 dark:text-gray-400"
        >Author: {profile?.display_name || event.pubkey}</span
      >
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
          <button
            onclick={() => goto(`/events?t=${encodeURIComponent(tag)}`)}
            class="px-2 py-1 rounded bg-primary-100 text-primary-800 text-sm font-medium hover:bg-primary-200 cursor-pointer"
            >#{tag}</button
          >
        {/each}
      </div>
    </div>
  {/if}

  <!-- Containing Publications -->
  <ContainingIndexes {event} />

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
