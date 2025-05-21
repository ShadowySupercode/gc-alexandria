<script lang="ts">
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import { getMimeTags } from "$lib/utils/mime";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub } from "$lib/utils/nostrUtils";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { standardRelays } from "$lib/consts";
  import type { NDKEvent } from '$lib/utils/nostrUtils';
  import { getMatchingTags } from '$lib/utils/nostrUtils';

  const { event, profile = null } = $props<{
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
  }>();

  let showFullContent = $state(false);
  let parsedContent = $state('');
  let contentPreview = $state('');

  function getEventTitle(event: NDKEvent): string {
    return getMatchingTags(event, 'title')[0]?.[1] || 'Untitled';
  }

  function getEventSummary(event: NDKEvent): string {
    return getMatchingTags(event, 'summary')[0]?.[1] || '';
  }

  function getEventHashtags(event: NDKEvent): string[] {
    return getMatchingTags(event, 't').map((tag: string[]) => tag[1]);
  }

  function getEventTypeDisplay(event: NDKEvent): string {
    const [mTag, MTag] = getMimeTags(event.kind || 0);
    return MTag[1].split('/')[1] || `Event Kind ${event.kind}`;
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

  $effect(() => {
    if (event && event.kind !== 0 && event.content) {
      parseBasicmarkup(event.content).then(html => {
        parsedContent = html;
        contentPreview = html.slice(0, 250);
      });
    }
  });
</script>

<div class="flex flex-col space-y-4">
  {#if event.kind !== 0 && getEventTitle(event)}
    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{getEventTitle(event)}</h2>
  {:else if event.kind === 0 && profile && profile.name}
    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{profile.name}</h2>
  {/if}

  <div class="flex items-center space-x-2">
    {#if toNpub(event.pubkey)}
      <span class="text-gray-600 dark:text-gray-400">Author: {@render userBadge(toNpub(event.pubkey) as string, profile?.display_name || event.pubkey)}</span>
    {:else}
      <span class="text-gray-600 dark:text-gray-400">Author: {profile?.display_name || event.pubkey}</span>
    {/if}
  </div>

  <div class="flex items-center space-x-2">
    <span class="text-gray-600 dark:text-gray-400">Kind:</span>
    <span class="font-mono">{event.kind}</span>
    <span class="text-gray-600 dark:text-gray-400">({getEventTypeDisplay(event)})</span>
  </div>

  {#if getEventSummary(event)}
    <div class="flex flex-col space-y-1">
      <span class="text-gray-600 dark:text-gray-400">Summary:</span>
      <p class="text-gray-800 dark:text-gray-200">{getEventSummary(event)}</p>
    </div>
  {/if}

  {#if getEventHashtags(event).length}
    <div class="flex flex-col space-y-1">
      <span class="text-gray-600 dark:text-gray-400">Tags:</span>
      <div class="flex flex-wrap gap-2">
        {#each getEventHashtags(event) as tag}
          <span class="px-2 py-1 rounded bg-primary-100 text-primary-700 text-sm font-medium">#{tag}</span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Content -->
  <div class="flex flex-col space-y-1">
    <span class="text-gray-600 dark:text-gray-400">Content:</span>
    {#if event.kind === 0}
      {#if profile}
        <div class="bg-primary-50 dark:bg-primary-900 rounded-lg p-6 mt-2 shadow flex flex-col gap-4">
          <dl class="grid grid-cols-1 gap-y-2">
            {#if profile.name}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">Name:</dt>
                <dd>{profile.name}</dd>
              </div>
            {/if}
            {#if profile.display_name}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">Display Name:</dt>
                <dd>{profile.display_name}</dd>
              </div>
            {/if}
            {#if profile.about}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">About:</dt>
                <dd class="whitespace-pre-line">{profile.about}</dd>
              </div>
            {/if}
            {#if profile.picture}
              <div class="flex gap-2 items-center">
                <dt class="font-semibold min-w-[120px]">Picture:</dt>
                <dd>
                  <img src={profile.picture} alt="Profile" class="w-16 h-16 rounded-full border" onerror={(e) => { (e.target as HTMLImageElement).src = '/favicon.png'; }} />
                </dd>
              </div>
            {/if}
            {#if profile.banner}
              <div class="flex gap-2 items-center">
                <dt class="font-semibold min-w-[120px]">Banner:</dt>
                <dd>
                  <img src={profile.banner} alt="Banner" class="w-full max-w-xs rounded border" onerror={(e) => { (e.target as HTMLImageElement).src = '/favicon.png'; }} />
                </dd>
              </div>
            {/if}
            {#if profile.website}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">Website:</dt>
                <dd>
                  <a href={profile.website} target="_blank" class="underline text-primary-700">{profile.website}</a>
                </dd>
              </div>
            {/if}
            {#if profile.lud16}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">Lightning Address:</dt>
                <dd>{profile.lud16}</dd>
              </div>
            {/if}
            {#if profile.nip05}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">NIP-05:</dt>
                <dd>{profile.nip05}</dd>
              </div>
            {/if}
          </dl>
        </div>
      {:else}
        <pre class="overflow-x-auto text-xs bg-highlight dark:bg-primary-900 rounded p-2 mt-2">{event.content}</pre>
      {/if}
    {:else}
      <div class="prose dark:prose-invert max-w-none">
        {@html showFullContent ? parsedContent : contentPreview}
        {#if !showFullContent && parsedContent.length > 250}
          <button class="mt-2 text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300" onclick={() => showFullContent = true}>Show more</button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Tags Array -->
  {#if event.tags && event.tags.length}
    <div class="flex flex-col space-y-1">
      <span class="text-gray-600 dark:text-gray-400">Event Tags:</span>
      <div class="flex flex-wrap gap-2">
        {#each event.tags as tag}
          {@html renderTag(tag)}
        {/each}
      </div>
    </div>
  {/if}

  <!-- Raw Event JSON -->
  <details class="bg-primary-50 dark:bg-primary-900 rounded p-4">
    <summary class="cursor-pointer font-semibold text-primary-700 dark:text-primary-300 mb-2">
      Show Raw Event JSON
    </summary>
    <pre
      class="overflow-x-auto text-xs bg-highlight dark:bg-primary-900 rounded p-4 mt-2 font-mono"
      style="line-height: 1.7; font-size: 1rem;"
    >
      {JSON.stringify(event.rawEvent(), null, 2)}
    </pre>
  </details>
</div> 