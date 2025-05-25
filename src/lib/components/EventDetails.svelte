<script lang="ts">
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import { getMimeTags } from "$lib/utils/mime";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub } from "$lib/utils/nostrUtils";
  import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
  import { standardRelays } from "$lib/consts";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import ProfileHeader from "$components/cards/ProfileHeader.svelte";
  import EventTag from "./EventTag.svelte";
  import { Accordion, AccordionItem } from "flowbite-svelte";

  const { event, profile = null, searchValue = null } = $props();

  let showFullContent = $state(false);
  let parsedContentPromise = $derived.by(async () => {
    if (event && event.kind !== 0 && event.content) {
      return await parseBasicmarkup(event.content);
    }
    return "";
  });
  let parsedContent = $state("");

  // Convert more state variables to derived values
  let displayContent = $derived.by(() => {
    if (!parsedContent) return "";
    return showFullContent ? parsedContent : parsedContent.slice(0, 250);
  });

  let hasMoreContent = $derived.by(() => parsedContent.length > 250);

  let showReadMoreButton = $derived.by(
    () => hasMoreContent && !showFullContent,
  );

  let showReadLessButton = $derived.by(() => hasMoreContent && showFullContent);

  let eventMetadata = $derived.by(() => ({
    title: eventTitle,
    summary: eventSummary,
    hashtags: eventHashtags,
    type: eventTypeDisplay,
  }));

  // Update parsedContent when the promise resolves
  $effect(() => {
    parsedContentPromise.then((content) => {
      parsedContent = content;
    });
  });

  let eventTitle = $derived.by(() => event.getTagValue("title") || "Untitled");
  let eventSummary = $derived.by(() => event.getTagValue("summary") || "");
  let eventHashtags = $derived.by(() => event.getTagValues("t"));
  let eventTypeDisplay = $derived.by(() => {
    const [mTag, MTag] = getMimeTags(event.kind || 0);
    return MTag[1].split("/")[1] || `Event Kind ${event.kind}`;
  });

  function getIdentifiers(
    event: NDKEvent,
    profile: any,
  ): { label: string; value: string; link?: string }[] {
    const ids: { label: string; value: string; link?: string }[] = [];
    if (event.kind === 0) {
      // NIP-05
      const nip05 = profile?.nip05 || event.getTagValue("nip05");
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
</script>

{#key event.id}
  <div class="flex flex-col space-y-4">
    <!--Will be in the event card header-->
    <!--{#if event.kind !== 0 && eventTitle}-->
    <!--  <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{eventTitle}</h2>-->
    <!--{/if}-->

    <!--<div class="flex items-center space-x-2">-->
    <!--  {#if toNpub(event.pubkey)}-->
    <!--    <span class="text-gray-600 dark:text-gray-400">Author: {@render userBadge(toNpub(event.pubkey) as string, profile?.display_name || event.pubkey)}</span>-->
    <!--  {:else}-->
    <!--    <span class="text-gray-600 dark:text-gray-400">Author: {profile?.display_name || event.pubkey}</span>-->
    <!--  {/if}-->
    <!--</div>-->

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
            <span
              class="px-2 py-1 rounded bg-primary-100 text-primary-700 text-sm font-medium"
              >#{tag}</span
            >
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
            <button
              class="text-primary-600 hover:text-primary-700 mt-2"
              onclick={() => (showFullContent = true)}
            >
              Read more...
            </button>
          {/if}
          {#if showReadLessButton}
            <button
              class="text-primary-600 hover:text-primary-700 mt-2"
              onclick={() => (showFullContent = false)}
            >
              Show less
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- If event is profile -->
    {#if event.kind === 0}
      <ProfileHeader {event} {profile} typeDisplay={eventTypeDisplay} />
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
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">{id.label}:</dt>
                <dd class="break-all">
                  {#if id.link}<a
                      href={id.link}
                      class="underline text-primary-700 dark:text-primary-200 break-all"
                      >{id.value}</a
                    >{:else}{id.value}{/if}
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
        <pre
          class="overflow-x-auto text-sm bg-highlight dark:bg-primary-900 rounded p-2 font-mono">
        {JSON.stringify(event.rawEvent(), null, 2)}
      </pre>
      </AccordionItem>
    </Accordion>
  </div>
{/key}
