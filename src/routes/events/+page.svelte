<script lang="ts">
  import { Heading, P, Button } from "flowbite-svelte";
  import { Input } from "flowbite-svelte";
  import { ndkInstance } from "$lib/ndk";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { standardRelays } from "$lib/consts";
  import { onMount } from "svelte";
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import { fetchEventWithFallback } from "$lib/utils/nostrUtils";
  import { getMimeTags, getEventType } from "$lib/utils/mime";
  import { page } from "$app/stores";
  import { nip19 } from 'nostr-tools';
  import InlineProfile from '$lib/components/util/InlineProfile.svelte';

  let searchQuery = $state("");
  let event = $state<NDKEvent | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let showFullContent = $state(false);
  let parsedContent = $state('');
  let contentPreview = $state('');
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
  let profileTitle = $state<string | null>(null);

  async function searchEvent() {
    if (!searchQuery.trim()) return;
    
    loading = true;
    error = null;
    event = null;

    console.log('[Events] searchEvent called with query:', searchQuery);

    try {
      let filterOrId: any = searchQuery.trim();
      // Try to decode bech32 (nevent, naddr, note, npub, nprofile)
      if (/^(nevent|note|naddr|npub|nprofile)[a-z0-9]+$/i.test(searchQuery.trim())) {
        try {
          const decoded = nip19.decode(searchQuery.trim());
          console.log('[Events] Decoded NIP-19:', decoded);
          if (decoded.type === 'nevent') {
            filterOrId = decoded.data.id;
          } else if (decoded.type === 'note') {
            filterOrId = decoded.data;
          } else if (decoded.type === 'naddr') {
            filterOrId = {
              kinds: [decoded.data.kind],
              authors: [decoded.data.pubkey],
              '#d': [decoded.data.identifier],
            };
          } else if (decoded.type === 'nprofile') {
            // Fetch kind 0 (profile) event for pubkey
            filterOrId = {
              kinds: [0],
              authors: [decoded.data.pubkey],
            };
          } else if (decoded.type === 'npub') {
            // Fetch kind 0 (profile) event for pubkey
            filterOrId = {
              kinds: [0],
              authors: [decoded.data],
            };
          }
          console.log('[Events] Using filterOrId:', filterOrId);
        } catch (e) {
          console.error('[Events] Invalid Nostr identifier:', searchQuery, e);
          error = 'Invalid Nostr identifier.';
          loading = false;
          return;
        }
      }

      // Use our new utility function to fetch the event
      console.log('[Events] Fetching event with filterOrId:', filterOrId);
      event = await fetchEventWithFallback($ndkInstance, filterOrId);
      
      if (!event) {
        console.warn('[Events] Event not found for filterOrId:', filterOrId);
        error = 'Event not found';
      } else {
        console.log('[Events] Event found:', event);
        if (typeof event.getMatchingTags !== 'function') {
          event = new NDKEvent(event.ndk || $ndkInstance, event);
        }
      }
    } catch (err) {
      console.error('[Events] Error fetching event:', err, 'Query:', searchQuery);
      error = 'Error fetching event. Please check the ID and try again.';
    } finally {
      loading = false;
    }
  }

  function getEventLink(event: NDKEvent): string {
    const eventType = getEventType(event.kind || 0);
    if (eventType === 'addressable') {
      const dTag = event.getMatchingTags('d')[0]?.[1];
      if (dTag) {
        return `/publication?id=${event.id}`;
      }
    }
    if (event.kind === 30818) {
      return `/wiki?id=${event.id}`;
    }
    const nevent = neventEncode(event, standardRelays);
    return `https://njump.me/${nevent}`;
  }

  function getEventTypeDisplay(event: NDKEvent): string {
    const [mTag, MTag] = getMimeTags(event.kind || 0);
    return MTag[1].split('/')[1] || `Event Kind ${event.kind}`;
  }

  function getEventTitle(event: NDKEvent): string {
    return event.getMatchingTags('title')[0]?.[1] || 'Untitled';
  }

  function getEventSummary(event: NDKEvent): string {
    return event.getMatchingTags('summary')[0]?.[1] || '';
  }

  function getEventAuthor(event: NDKEvent): string {
    return event.pubkey;
  }

  function getEventHashtags(event: NDKEvent): string[] {
    return event.tags.filter(tag => tag[0] === 't').map(tag => tag[1]);
  }

  /**
   * Returns HTML for pretty-printed JSON, with naddr addresses and event IDs as links
   */
  function jsonWithLinks(obj: any): string {
    const NADDR_REGEX = /\b(\d{5}:[a-f0-9]{64}:[a-zA-Z0-9._-]+)\b/g;
    const EVENT_ID_REGEX = /\b([0-9a-f]{64})\b/g;
    
    function replacer(_key: string, value: any) {
      return value;
    }
    // Stringify with 2-space indent
    let json = JSON.stringify(obj, replacer, 2);
    
    // Replace  addresses with links
    json = json.replace(NADDR_REGEX, (match) => {
      try {
        const [kind, pubkey, dtag] = match.split(":");
        // Compose a fake event for naddrEncode
        const fakeEvent = {
          kind: parseInt(kind),
          pubkey,
          tags: [["d", dtag]],
        };
        const naddr = naddrEncode(fakeEvent as any, standardRelays);
        return `<a href='./events?id=${naddr}' class='text-primary-600 underline' target='_blank'>${match}</a>`;
      } catch {
        return match;
      }
    });

    // Replace event IDs with links
    json = json.replace(EVENT_ID_REGEX, (match) => {
      try {
        const nevent = neventEncode({ id: match, kind: 1 } as NDKEvent, standardRelays);
        return `<a href='./events?id=${nevent}' class='text-primary-600 underline' target='_blank'>${match}</a>`;
      } catch {
        return match;
      }
    });

    // Escape < and > for HTML safety, but allow our <a> tags
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    json = json.replace(/&lt;a /g, '<a ').replace(/&lt;\/a&gt;/g, '</a>');
    return json;
  }

  function renderTag(tag: string[]): string {
    if (tag[0] === 'a' && tag.length > 1) {
      const [kind, pubkey, d] = tag[1].split(':');
      // Use type assertion as any to satisfy NDKEvent signature for naddrEncode
      return `<a href='/events?id=${naddrEncode({kind: +kind, pubkey, tags: [["d", d]], content: '', id: '', sig: ''} as any, standardRelays)}' class='underline text-primary-700'>a:${tag[1]}</a>`;
    } else if (tag[0] === 'e' && tag.length > 1) {
      // Use type assertion as any to satisfy NDKEvent signature for neventEncode
      return `<a href='/events?id=${neventEncode({id: tag[1], kind: 1, content: '', tags: [], pubkey: '', sig: ''} as any, standardRelays)}' class='underline text-primary-700'>e:${tag[1]}</a>`;
    } else {
      return `<span class='bg-primary-50 text-primary-800 px-2 py-1 rounded text-xs font-mono'>${tag[0]}:${tag[1]}</span>`;
    }
  }

  onMount(async () => {
    const id = $page.url.searchParams.get('id');
    if (id) {
      searchQuery = id;
      await searchEvent();
    }
  });

  $effect(() => {
    if (event && event.kind !== 0 && event.content) {
      parseBasicmarkup(event.content).then(html => {
        parsedContent = html;
        contentPreview = html.slice(0, 250);
      });
    }
  });

  $effect(() => {
    if (event && event.kind === 0) {
      try {
        profile = JSON.parse(event.content);
      } catch {
        profile = null;
      }
    } else {
      profile = null;
    }
  });

  $effect(() => {
    if (event && event.kind === 0 && profile && profile.name) {
      profileTitle = profile.name;
    } else {
      profileTitle = null;
    }
  });
</script>

<div class="w-full flex justify-center">
  <main class="main-leather flex flex-col space-y-6 max-w-2xl w-full my-6 px-4">
    <div class="flex justify-between items-center">
      <Heading tag="h1" class="h-leather mb-2">Events</Heading>
    </div>

    <P class="mb-3">
      Use this page to view any event (npub, nprofile, nevent, naddr, or hexID).
    </P>

    <div class="flex gap-2">
      <Input
        bind:value={searchQuery}
        placeholder="Enter event ID, nevent, or naddr..."
        class="flex-grow"
        on:keydown={(e: KeyboardEvent) => e.key === 'Enter' && searchEvent()}
      />
      <Button on:click={searchEvent} disabled={loading}>
        {loading ? 'Searching...' : 'Search'}
      </Button>
    </div>

    {#if error}
      <div class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
        {error}
        {#if searchQuery.trim()}
          <div class="mt-2">
            You can also try viewing this event on
            <a
              class="underline text-primary-700"
              href={"https://njump.me/" + encodeURIComponent(searchQuery.trim())}
              target="_blank"
              rel="noopener"
            >njump</a>.
          </div>
        {/if}
      </div>
    {/if}

    {#if event && typeof event.getMatchingTags === 'function'}
      <div class="flex flex-col space-y-6">
        <!-- Event Identifier (plain text, not a link) -->
        <div class="text-sm font-mono text-gray-600 dark:text-gray-400 break-all">
          {neventEncode(event, standardRelays)}
        </div>

        <!-- Event Details -->
        <div class="flex flex-col space-y-4">
          {#if event.kind !== 0 && getEventTitle(event)}
            <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{getEventTitle(event)}</h2>
          {:else if event.kind === 0 && profile && profile.name}
            <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{profile.name}</h2>
          {/if}
          <div class="flex items-center space-x-2">
            <span class="text-gray-600 dark:text-gray-400">Author:</span>
            <InlineProfile pubkey={event.pubkey} />
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
                          <img src={profile.picture} alt="Profile" class="w-16 h-16 rounded-full border" />
                        </dd>
                      </div>
                    {/if}
                    {#if profile.banner}
                      <div class="flex gap-2 items-center">
                        <dt class="font-semibold min-w-[120px]">Banner:</dt>
                        <dd>
                          <img src={profile.banner} alt="Banner" class="w-full max-w-xs rounded border" />
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

          <!-- Tags Array: Only a-tags and e-tags as hyperlinks -->
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
      </div>
      {#if !getEventTitle(event) && !event.content}
        <div class="p-4 text-gray-500">
          No title or content available for this event.
          <pre class="text-xs mt-2 bg-gray-100 dark:bg-gray-800 p-2 rounded">
            {JSON.stringify(event.rawEvent(), null, 2)}
          </pre>
        </div>
      {/if}
    {:else if event}
      <div class="text-red-600">Fetched event is not a valid NDKEvent. See console for details.</div>
    {/if}
  </main>
</div>
