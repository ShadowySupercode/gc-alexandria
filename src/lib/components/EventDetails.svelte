<script lang="ts">
  import { parseBasicmarkup } from "$lib/utils";
  import { getMimeTags } from "$lib/utils";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import type { NostrEvent } from "$lib/types/nostr";
  import type { NostrProfile } from "$lib/utils/types";
  import { toNpub } from "$lib/utils/profileUtils";
  import { getTagValue, getTagValues } from "$lib/utils/eventUtils";
  import { 
    neventEncode,
    nprofileEncode,
    naddrEncode,
    getRelayHints
  } from "$lib/utils/identifierUtils";
  import { communityRelays } from "$lib/consts";
  import ProfileHeader from "$components/cards/ProfileHeader.svelte";
  import EventTag from "./EventTag.svelte";
  import { Accordion, AccordionItem, Button } from "flowbite-svelte";
  import GalleryHeader from "$components/cards/GalleryHeader.svelte";

  // --- Props ---
  const props = $props<{
    event: NostrEvent;
    profile?: NostrProfile | null;
    searchValue?: string | null;
    relayResults?: Record<string, any>;
  }>();
  const { event, profile = null, searchValue = null, relayResults = {} } = props;

  // --- State ---
  let showFullContent = $state(false);
  let parsedContentPromise = $derived.by(async () => {
    if (event && event.kind !== 0 && event.content) {
      return await parseBasicmarkup(event.content);
    }
    return "";
  });
  let parsedContent = $state("");

  // --- Relay List ---
  let relayList = $derived.by(() => {
    if (typeof relayResults === 'object' && relayResults !== null) {
      return Object.keys(relayResults).filter((r) => relayResults[r]);
    }
    return [];
  });

  // --- Helpers ---
  function highlightSearchTerms(text: string, searchTerm: string | null): string {
    if (!searchTerm || !text) return text;
    
    // Escape special regex characters in searchTerm
    const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    
    // Replace matches with highlighted spans
    return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">$1</mark>');
  }

  // --- Derived Values ---
  let displayContent = $derived.by(() => {
    if (!parsedContent) return "";
    const content = showFullContent ? parsedContent : parsedContent.slice(0, 250);
    return searchValue ? highlightSearchTerms(content, searchValue) : content;
  });

  let hasMoreContent = $derived.by(() => parsedContent.length > 250);
  let showReadMoreButton = $derived.by(() => hasMoreContent && !showFullContent);
  let showReadLessButton = $derived.by(() => hasMoreContent && showFullContent);

  let eventTitle = $derived.by(() => getTagValue(event, "title") || "Untitled");
  let eventSummary = $derived.by(() => getTagValue(event, "summary") || "");
  let eventHashtags = $derived.by(() => getTagValues(event, "t"));
  let eventTypeDisplay = $derived.by(() => {
    const [mTag, MTag] = getMimeTags(event.kind || 0);
    return MTag[1].split("/")[1] || `Event Kind ${event.kind}`;
  });

  // --- Effects ---
  $effect(() => {
    parsedContentPromise.then((content) => {
      parsedContent = content;
    });
  });

  function getIdentifiers(
    event: NostrEvent,
    profile: NostrProfile | null
  ): { label: string; value: string; link?: string; warning?: string }[] {
    const ids: { label: string; value: string; link?: string; warning?: string }[] = [];
    if (event.kind === 0) {
      // NIP-05
      const nip05 = profile?.nip05 || getTagValue(event, "nip05");
      // npub
      const npub = toNpub(event.pubkey);
      if (npub)
        ids.push({ label: "npub", value: npub, link: `/events?id=${npub}` });
      // nprofile
      ids.push({
        label: "nprofile",
        value: nprofileEncode(event.pubkey, communityRelays),
        link: `/events?id=${nprofileEncode(event.pubkey, communityRelays)}`,
      });
      // nevent
      ids.push({
        label: "nevent",
        value: neventEncode(event, communityRelays),
        link: `/events?id=${neventEncode(event, communityRelays)}`,
      });
      // hex pubkey
      ids.push({ label: "pubkey", value: event.pubkey });
    } else {
      // nevent
      ids.push({
        label: "nevent",
        value: neventEncode(event, communityRelays),
        link: `/events?id=${neventEncode(event, communityRelays)}`,
      });
      // naddr (if addressable)
      const relayHints = getRelayHints(event) ?? communityRelays;
      const naddr = naddrEncode(event, relayHints);
      const warning = undefined;
      ids.push({ label: "naddr", value: naddr, link: `/events?id=${naddr}`, warning });
      // hex id
      ids.push({ label: "id", value: event.id });
    }
    return ids;
  }
</script>

{#key event.id}
  <div class="flex flex-col space-y-4">
    {#if event.kind === 0}     <!-- If event is profile -->
      <ProfileHeader {event} {profile} typeDisplay={eventTypeDisplay} />
    {:else if event.kind === 20}     <!-- If event is gallery -->
      <GalleryHeader {event} typeDisplay={eventTypeDisplay} content={parsedContent} />
    {:else}     <!-- Generic -->
      <div class="flex flex-col space-y-4">
        {#if event.kind !== 0 && eventTitle}
          <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{eventTitle}</h2>
        {/if}

        <div class="flex items-center space-x-2">
          {#if toNpub(event.pubkey)}
            <span class="text-gray-600 dark:text-gray-400">
              Author: {@render userBadge(toNpub(event.pubkey) as string, profile?.display_name || event.pubkey)}
            </span>
          {:else}
            <span class="text-gray-600 dark:text-gray-400">
              Author: {profile?.display_name || event.pubkey}
            </span>
          {/if}
        </div>

        {#if eventSummary}
          <div class="flex flex-col space-y-1">
            <span class="text-gray-600 dark:text-gray-400">Summary:</span>
            <p class="text-gray-800 dark:text-gray-200">{eventSummary}</p>
          </div>
        {/if}

        {#if eventHashtags.length}
          <div class="flex flex-col space-y-1">
            <span class="text-gray-600 dark:text-gray-400">Tags:</span>
            <div class="flex flex-wrap gap-2">
              {#each eventHashtags as tag}
                <span class="px-2 py-1 rounded bg-primary-100 text-primary-700 text-sm font-medium">#{tag}</span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Content -->
        <div class="flex flex-col space-y-1">
          {#if event.kind !== 0}
            <span class="text-gray-600 dark:text-gray-400">Content:</span>
            <div class="prose dark:prose-invert max-w-none">
              {@html displayContent}
              {#if showReadMoreButton}
                <Button
                  color="alternative"
                  size="xs"
                  class="mt-2"
                  onclick={() => (showFullContent = true)}
                  aria-expanded="false"
                  aria-controls="event-content"
                >
                  Read more
                  <span class="sr-only">of {eventTitle}</span>
                </Button>
              {/if}
              {#if showReadLessButton}
                <Button
                  color="alternative"
                  size="xs"
                  class="mt-2"
                  onclick={() => (showFullContent = false)}
                  aria-expanded="true"
                  aria-controls="event-content"
                >
                  Show less
                  <span class="sr-only">of {eventTitle}</span>
                </Button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Event Technical details -->
    <Accordion
      defaultClass="border-none shadow-none"
      inactiveClass="!bg-primary-50 dark:!bg-primary-900 border-none shadow-none"
      activeClass="!bg-primary-100 dark:!bg-primary-800 border-none shadow-none"
      class="w-full"
    >
      <AccordionItem>
        <svelte:fragment slot="header">Shareable Links</svelte:fragment>
        <div class="flex flex-col space-y-2">
          <dl>
            {#each getIdentifiers(event, profile) as id}
              <div class="flex gap-2 items-center">
                <dt class="font-semibold min-w-[120px]">{id.label}:</dt>
                <dd class="break-all flex items-center gap-1">
                  {#if id.link}
                    <a
                      href={id.link}
                      class="underline text-primary-700 dark:text-primary-200 break-all"
                    >{id.value}</a>
                  {:else}
                    {id.value}
                  {/if}
                  {#if id.label === 'naddr' && id.warning}
                    <span class="text-yellow-500 cursor-help" title={id.warning}>⚠️</span>
                  {/if}
                </dd>
              </div>
            {/each}
          </dl>
        </div>
      </AccordionItem>
      <AccordionItem>
        <svelte:fragment slot="header">Event Tags</svelte:fragment>
        {#if event.tags && event.tags.length}
          <div class="flex flex-col space-y-1">
            <div class="flex flex-wrap gap-2">
              {#each event.tags as tag}
                <EventTag {tag} />
              {/each}
            </div>
          </div>
        {:else}
          <span class="text-gray-500">No tags are set on this event.</span>
        {/if}
      </AccordionItem>
      <AccordionItem borderClass="!border-primary-900">
        <svelte:fragment slot="header">Raw Event JSON</svelte:fragment>
        <pre class="overflow-x-auto text-sm bg-highlight dark:bg-primary-900 rounded p-2 font-mono">
          {JSON.stringify(event, null, 2)}
        </pre>
      </AccordionItem>
    </Accordion>

    <div class="text-sm text-gray-700 dark:text-gray-300">
      <strong>Found on:</strong>
      {#if relayList.length > 0}
        {#each relayList as relay, i}
          {relay}{#if i < relayList.length - 1}, {/if}
        {/each}
      {:else}
        <span>None</span>
      {/if}
    </div>
  </div>
{/key}
