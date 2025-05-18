<script lang="ts">
  import WikiCard from "$lib/components/WikiCard.svelte";
  import InlineProfile from "$lib/components/util/InlineProfile.svelte";
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { ndkInstance } from '$lib/ndk';
  import { nip19 } from 'nostr-tools';
  import { getWikiPageById } from '$lib/wiki';
  import { page } from '$app/stores';

  // @ts-ignore Svelte linter false positive: hashtags is used in the template
  let { } = $props<{
    title: string;
    pubhex: string;
    eventId: string;
    summary: string;
    urlPath: string;
    hashtags?: string[];
  }>();

  type WikiCardResult = {
    title: string;
    pubhex: string;
    eventId: string;
    summary: string;
    urlPath: string;
    hashtags: string[];
  };

  let search = $state('');
  let results: WikiCardResult[] = $state([]);
  let loading = $state(false);
  let wikiPage: WikiCardResult | null = $state(null);
  let wikiContent: { title: string; author: string; pubhex: string; html: string } | null = $state(null);
  let error = $state<string | null>(null);

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
    const ndk = $ndkInstance;
    if (!ndk) {
      results = [];
      loading = false;
      return;
    }
    const events = await ndk.fetchEvents({ kinds: [30818] });
    const normQuery = normalize(query);

    // 1. Filter by title
    let filtered = Array.from(events).filter((event: any) => {
      const titleTag = event.tags?.find((tag: string[]) => tag[0] === 'title');
      const title = titleTag && titleTag[1]?.trim() ? titleTag[1] : 'Untitled';
      return normalize(title).includes(normQuery);
    });

    // 2. If no title matches, filter by hashtags
    if (filtered.length === 0) {
      filtered = Array.from(events).filter((event: any) => {
        // Find all tags that are hashtags (tag[0] === '#')
        const hashtags = event.tags?.filter((tag: string[]) => tag[0] === '#').map((tag: string[]) => tag[1]) || [];
        return hashtags.some((hashtag: string) => normalize(hashtag).includes(normQuery));
      });
    }

    results = await Promise.all(filtered.map(async (event: any) => {
      const pubhex = event.pubkey || '';
      const titleTag = event.tags?.find((tag: string[]) => tag[0] === 'title');
      const title = titleTag && titleTag[1]?.trim() ? titleTag[1] : 'Untitled';
      const summaryTag = event.tags?.find((tag: string[]) => tag[0] === 'summary');
      const summary = summaryTag ? summaryTag[1] : '';
      const hashtags = event.tags?.filter((tag: string[]) => tag[0] === 't').map((tag: string[]) => tag[1]) || [];
      const nevent = nip19.neventEncode({ id: event.id, relays: [] });
      return { title, pubhex, eventId: event.id, summary, urlPath: nevent, hashtags };
    }));
    loading = false;
  }

  async function fetchWikiPageById(id: string) {
    loading = true;
    error = null;
    try {
      const ndk = $ndkInstance;
      if (!ndk) {
        wikiPage = null;
        wikiContent = null;
        return;
      }
      let eventId = id;
      if (id.startsWith('nevent')) {
        const decoded = nip19.decode(id);
        if (typeof decoded === 'string') {
          eventId = decoded;
        } else if (typeof decoded === 'object' && 'data' in decoded && typeof decoded.data === 'object' && 'id' in decoded.data) {
          eventId = decoded.data.id;
        }
      }
      const event = await ndk.fetchEvent({ ids: [eventId] });
      if (event) {
        const pubhex = event.pubkey || '';
        const titleTag = event.tags?.find((tag: string[]) => tag[0] === 'title');
        const title = titleTag && titleTag[1]?.trim() ? titleTag[1] : 'Untitled';
        const summaryTag = event.tags?.find((tag: string[]) => tag[0] === 'summary');
        const summary = summaryTag ? summaryTag[1] : '';
        const hashtags = event.tags?.filter((tag: string[]) => tag[0] === 't').map((tag: string[]) => tag[1]) || [];
        wikiPage = { title, pubhex, eventId: event.id, summary, urlPath: id, hashtags };
        
        // Fetch the full wiki content
        const content = await getWikiPageById(id);
        if (content) {
          // const html = await parseBasicmarkup(asciidocHtml);
          const html = content.html;
          console.log('Final HTML:', html);
          wikiContent = {
            title: content.title,
            author: content.author,
            pubhex: content.pubhex,
            html: html
          };
        } else {
          error = 'Failed to load wiki content';
        }
      } else {
        wikiPage = null;
        wikiContent = null;
        error = 'Wiki page not found';
      }
    } catch (e) {
      console.error('Error fetching wiki page:', e);
      error = 'Error loading wiki page';
      wikiPage = null;
      wikiContent = null;
    } finally {
      loading = false;
    }
  }

  // Debounced effect for search
  $effect(() => {
    if (search && wikiPage) {
      wikiPage = null;
    }
  });

  $effect(() => {
    const id = $page.url.searchParams.get('id');
    if (id) {
      fetchWikiPageById(id);
      search = '';
      results = [];
    }
  });

  function handleCardClick(urlPath: string) {
    goto(`/wiki?id=${encodeURIComponent(urlPath)}`);
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('d');
    const id = params.get('id');
    if (id) {
      wikiPage = null;
      fetchWikiPageById(id);
      search = '';
      results = [];
    } else if (d) {
      search = d;
      wikiPage = null;
      fetchResults(search);
    } else {
      search = '';
      results = [];
      wikiPage = null;
    }
  });
</script>

<div class="flex flex-col items-center min-h-[60vh] pt-8">
  <div class="w-full max-w-xl flex flex-col items-center">
    <input
      type="text"
      placeholder="Search for a wiki topic..."
      bind:value={search}
      oninput={() => {
        if (wikiPage) {
          wikiPage = null;
          wikiContent = null;
        }
        fetchResults(search);
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
      <h1 class="text-3xl font-bold mb-2">{wikiContent.title}</h1>
      <div class="mb-2">
        by <InlineProfile pubkey={wikiContent.pubhex} />
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
        {@html wikiContent.html}
      </div>
    </div>
  {:else if !search}
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
    <div
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 justify-center mt-8"
      style="max-width: 100vw;"
    >
      {#each results as result}
        <a
          href="/wiki?id={result.urlPath}"
          onclick={(e) => { e.preventDefault(); handleCardClick(result.urlPath); }}
          class="mx-auto w-full max-w-xl block text-left focus:outline-none"
          tabindex="0"
          aria-label={`Open wiki page: ${result.title}`}
          style="cursor:pointer;"
        >
          <WikiCard
            title={result.title}
            pubhex={result.pubhex}
            eventId={result.eventId}
            summary={result.summary}
            urlPath={result.urlPath}
            hashtags={result.hashtags}
          />
        </a>
      {/each}
    </div>
  {/if}
</div>

<div>{@html '<h1>Hello</h1><p>This is a test.</p>'}</div>