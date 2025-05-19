<script lang="ts">
  import WikiCard from "$lib/components/WikiCard.svelte";
  import InlineProfile from "$lib/components/util/InlineProfile.svelte";
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { ndkInstance } from '$lib/ndk';
  import { page } from '$app/stores';
  import { getWikiPageById, getProfileName } from '$lib/wiki';
  import { type NDKEvent } from '@nostr-dev-kit/ndk';
  import { neventEncode } from '$lib/utils';
  import { processNostrIdentifiers } from '$lib/utils/nostrUtils';
  import { standardRelays, wikiKind } from '$lib/consts';
  import Pharos from '$lib/parser';
  import { parseBasicmarkup } from '$lib/utils/markup/basicMarkupParser';
  // @ts-ignore Svelte linter false positive: hashtags is used in the template
  let { } = $props<{
    title: string;
    pubhex: string;
    eventId: string;
    summary: string;
    urlPath: string;
    hashtags?: string[];
  }>();

  type WikiPage = {
    title: string;
    pubhex: string;
    eventId: string;
    summary: string;
    hashtags: string[];
    html: string;
    content: string;
  };

  let searchInput = $state('');
  let results: WikiPage[] = $state([]);
  let loading = $state(false);
  let wikiPage: WikiPage | null = $state(null);
  let wikiContent: { title: string; author: string; pubhex: string; html: string } | null = $state(null);
  let error = $state<string | null>(null);
  let expandedContent = $state(false);
  let contentPreview = $derived(() => {
    if (!wikiPage) return '';
    return wikiPage.html.slice(0, 250);
  });

  function normalize(str: string) {
    return str.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async function fetchResults(query: string) {
    if (!query.trim()) {
      results = [];
      loading = false;
      return;
    }
    loading = true;
    error = null;
    try {
      const ndk = $ndkInstance;
      if (!ndk) {
        results = [];
        error = 'NDK instance not available';
        loading = false;
        return;
      }
      const events = await ndk.fetchEvents({ kinds: [wikiKind] });
      const normQuery = normalize(query);

      // Filter by title or hashtags
      let filtered = Array.from(events).filter((event: NDKEvent) => {
        const titleTag = event.tags?.find((tag: string[]) => tag[0] === 'title');
        const title = titleTag && titleTag[1]?.trim() ? titleTag[1] : 'Untitled';
        const hashtags = event.tags?.filter((tag: string[]) => tag[0] === 't').map((tag: string[]) => tag[1]) || [];
        
        return normalize(title).includes(normQuery) || 
               hashtags.some((hashtag: string) => normalize(hashtag).includes(normQuery));
      });

      const pages = await Promise.all(filtered.map(async (event: NDKEvent) => {
        const pageData = await getWikiPageById(event.id, ndk);
        if (pageData) {
          // Process Nostr identifiers in the HTML content
          pageData.html = await processNostrIdentifiers(pageData.html);
        }
        if (event && typeof event.getMatchingTags !== 'function') {
          console.error('Fetched event is not an NDKEvent:', event);
        }
        return pageData as WikiPage | null;
      }));

      results = pages.filter((page): page is WikiPage => page !== null);
    } catch (e) {
      error = 'Error searching wiki pages';
      results = [];
      console.error('fetchResults: Exception:', e);
    } finally {
      loading = false;
    }
  }

  async function fetchWikiPageById(id: string) {
    loading = true;
    error = null;
    try {
      const ndk = $ndkInstance;
      if (!ndk) {
        wikiPage = null;
        wikiContent = null;
        console.error('fetchWikiPageById: NDK instance not available');
        return;
      }
      if (!id) {
        console.error('fetchWikiPageById: id is undefined');
        return;
      }
      console.log('fetchWikiPageById: fetching wiki page for id', id);
      const pageData = await getWikiPageById(id, ndk);
      if (pageData) {
        // Process Nostr identifiers in the HTML content
        const processedHtml = await processNostrIdentifiers(pageData.html);
        wikiPage = {
          title: pageData.title,
          pubhex: pageData.pubhex,
          eventId: pageData.eventId,
          summary: pageData.summary,
          hashtags: pageData.hashtags,
          html: processedHtml,
          content: pageData.content,
        };
        wikiContent = {
          title: pageData.title,
          author: await getProfileName(pageData.pubhex),
          pubhex: pageData.pubhex,
          html: processedHtml
        };
        if (!wikiPage.html) {
          console.error('fetchWikiPageById: wikiPage.html is empty for id', id, wikiPage);
        }
        console.log('wikiPage.html:', wikiPage?.html);
      } else {
        wikiPage = null;
        wikiContent = null;
        error = 'Wiki page not found';
        console.error('fetchWikiPageById: Wiki page not found for id', id);
      }
    } catch (e) {
      error = 'Error loading wiki page';
      wikiPage = null;
      wikiContent = null;
      console.error('fetchWikiPageById: Exception:', e);
    } finally {
      loading = false;
    }
  }

  // Clear wikiPage if searching
  $effect(() => {
    if (searchInput && wikiPage) {
      wikiPage = null;
    }
  });

  // Watch for ?id= in the URL and load the wiki page if present
  $effect(() => {
    const id = $page.url.searchParams.get('id');
    if (id) {
      fetchWikiPageById(id);
      searchInput = '';
      results = [];
    }
  });

  function handleCardClick(urlPath: string) {
    goto(`/wiki?id=${encodeURIComponent(urlPath)}`);
  }

  function getNevent(eventId: string): string {
    try {
      const event = { id: eventId, kind: wikiKind } as NDKEvent;
      return neventEncode(event, standardRelays);
    } catch (e) {
      console.error('Error encoding nevent:', e);
      return eventId;
    }
  }

  function handleProfileClick(pubkey: string) {
    goto(`/profile?pubkey=${pubkey}`);
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('d');
    const id = params.get('id');
    if (id) {
      wikiPage = null;
      fetchWikiPageById(id);
      searchInput = '';
      results = [];
    } else if (d) {
      searchInput = d;
      wikiPage = null;
      fetchResults(searchInput);
    } else {
      searchInput = '';
      results = [];
      wikiPage = null;
    }
  });

  (async () => {
    let html = '';
    try {
      const pharos = new Pharos($ndkInstance);
      pharos.parse('= Test\n\nHello world');
      const pharosHtml = pharos.getHtml();
      if (!pharosHtml || pharosHtml.trim() === '') {
        console.error('Pharos failed to parse AsciiDoc:', '= Test\n\nHello world');
      }
      html = await parseBasicmarkup(pharosHtml ?? '');
      console.log('Test parse result:', html);
    } catch (err) {
      console.error('Pharos parse error:', err);
    }
  })();
</script>

<div class="flex flex-col items-center min-h-[60vh] pt-8">
  <div class="w-full max-w-xl flex flex-col items-center">
    <input
      type="text"
      placeholder="Search for a wiki topic..."
      bind:value={searchInput}
      oninput={() => {
        if (wikiPage) {
          wikiPage = null;
          wikiContent = null;
        }
        fetchResults(searchInput);
      }}
      autocomplete="off"
      class="w-full px-6 py-4 rounded-2xl border border-primary-200 shadow bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-400 text-lg transition"
    />
  </div>

  {#if loading}
    <div class="flex flex-col items-center mt-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      <p class="mt-4 text-gray-600">Loading wiki content...</p>
    </div>
  {:else if error}
    <div class="flex flex-col items-center mt-8 text-red-600">
      <p>{error}</p>
    </div>
  {:else if wikiPage && wikiContent}
    <div class="flex flex-col items-center mt-8 max-w-4xl w-full px-4">
      <div class="text-sm font-mono text-gray-600 dark:text-gray-400 mb-2 break-all whitespace-pre-wrap">{getNevent(wikiPage.eventId)}</div>
      <h1 class="text-3xl font-bold mb-2">{wikiPage.title}</h1>
      <div class="mb-2">
        by <button 
          class="text-primary-600 hover:underline"
          onclick={() => wikiPage && handleProfileClick(wikiPage.pubhex)}
        >
          <InlineProfile pubkey={wikiPage.pubhex} />
        </button>
      </div>
      {#if wikiPage.hashtags.length}
        <div class="flex flex-wrap gap-2 mb-6">
          {#each wikiPage.hashtags as tag}
            <span class="px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-sm font-medium">#{tag}</span>
          {/each}
        </div>
      {/if}
      {#if wikiPage.summary}
        <div class="mb-6 text-lg text-gray-700 max-w-2xl text-center">{wikiPage.summary}</div>
      {/if}
      <div class="w-full prose prose-lg dark:prose-invert max-w-none">
        {#if wikiPage.html && wikiPage.html.trim().length > 0}
          {@html wikiPage.html}
        {:else}
          <div class="text-red-600">
            No content found for this wiki page.
            {#if wikiPage.content}
              <pre class="text-xs mt-2 bg-gray-100 dark:bg-gray-800 p-2 rounded">
                {wikiPage.content}
              </pre>
            {/if}
            <pre class="text-xs mt-2 bg-gray-100 dark:bg-gray-800 p-2 rounded">
              {JSON.stringify(wikiPage, null, 2)}
            </pre>
          </div>
        {/if}
      </div>
    </div>
  {:else if !searchInput}
    <div class="max-w-xl mx-auto mt-12 text-center text-lg space-y-4">
      <p>
        <strong>Welcome to the Alexandria Wiki!</strong>
      </p>
      <p>
        Use the search bar above to find wiki pages on any topic.
        Alexandria wiki pages are stored on Nostr relays and can be collaboratively added to by anyone with a Nostr key.
        Search by topic, and you'll see all relevant wiki pages, each signed by its author.
      </p>
    </div>
  {:else if results.length === 0}
    <p class="text-center mt-8">No entries found for this topic.</p>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 max-w-6xl w-full px-4">
      {#each results as result}
        <WikiCard
          title={result.title}
          pubhex={result.pubhex}
          eventId={result.eventId}
          summary={result.summary}
          hashtags={result.hashtags}
          urlPath={result.eventId}
        />
      {/each}
    </div>
  {/if}
</div>