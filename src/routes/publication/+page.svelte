<script lang="ts">
  import { onDestroy } from 'svelte';
  import { userHydrated } from '$lib/stores/userStore';
  import { blockedRelaysHydrated } from '$lib/stores/relayStore';
  import { selectRelayGroup } from '$lib/utils/relayGroupUtils';
  import { searchEventByIdentifier } from '$lib/utils/identifierUtils';
  import { fetchEventFromRelay } from '$lib/utils/relayUtils';
  import Publication from '$lib/components/Publication.svelte';
  import Pharos from '$lib/parser';
  import ArticleNav from "$components/util/ArticleNav.svelte";
  import { getTagAddress, getTagValue } from '$lib/utils/eventUtils';
  import { unresponsiveRelays } from '$lib/stores/unresponsiveRelaysStore';
  import { setContext } from 'svelte';
  import { PublicationTree } from '$lib/data_structures/publication_tree';
  import { getNostrClient } from '$lib/nostr/client';
  import type { NostrEvent } from '$lib/types/nostr';
  import asciidoctor from 'asciidoctor';

  const { data } = $props<{ data: { id?: string, dTag?: string, url: URL } }>();

  let ready = $derived.by(() => $userHydrated && $blockedRelaysHydrated);

  let indexEvent = $state<NostrEvent | null>(null);
  let parser = $state<any>(null);
  let contentType = $state<string>('unknown');
  let waitable = $state<Promise<any>>(Promise.resolve());
  let errorMsg = $state('');

  let publicationType = $derived.by(() => 
    indexEvent ? (getTagValue(indexEvent, 'type') || 'book').toLowerCase() : 'book'
  );

  let rootId = $derived.by(() => parser && indexEvent ? parser.getRootIndexId() : undefined);
  let rootAddress = $derived.by(() => indexEvent ? getTagAddress(indexEvent) : '');
  let showArticleNav = $derived.by(() => typeof rootId === 'string');
  let showPublication = $derived.by(() => typeof rootAddress === 'string' && !!rootAddress);

  let title = $derived.by(() =>
    indexEvent ?
      getTagValue(indexEvent, "title") ||
      parser?.getIndexTitle(parser?.getRootIndexId()) ||
      "Alexandria Publication"
      : 'Alexandria Publication'
  );

  let image = $derived.by(() =>
    indexEvent ?
      getTagValue(indexEvent, "image") ||
      "/screenshots/old_books.jpg"
      : "/screenshots/old_books.jpg"
  );

  let summary = $derived.by(() =>
    indexEvent ?
      getTagValue(indexEvent, "summary") ||
      "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages."
      : "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages."
  );

  let relayStatuses = $state<Record<string, 'pending' | 'success' | 'timeout' | 'error'>>({});
  let relayResults = $state<Record<string, NostrEvent | null>>({});

  let unresponsive: string[] = [];
  unresponsiveRelays.subscribe((val) => { unresponsive = val; });

  const asciidoctorInstance = asciidoctor();
  setContext('asciidoctor', asciidoctorInstance);

  $effect(() => {
    console.log('EFFECT RUNNING', { ready, data, $userHydrated, $blockedRelaysHydrated });
    if (ready && (data.id || data.dTag)) {
      (async () => {
        indexEvent = null;
        errorMsg = '';
        parser = null;
        relayStatuses = {};
        relayResults = {};
        let event: NostrEvent | null = null;
        let id = data.id;
        if (id && !/^[a-f0-9]{64}$/i.test(id)) {
          // Not a hex id, try to decode as naddr/nevent/etc
          console.log('[Publication] Decoding identifier:', id);
          const result = await searchEventByIdentifier(id);
          console.log('searchEventByIdentifier result:', result);
          event = result.event ?? null;
          if (event) {
            console.log('[Publication] Loaded event from identifier:', event);
          } else {
            errorMsg = 'Event not found';
          }
        } else if (id) {
          // Hex id, fetch as before
          const allRelays = selectRelayGroup('inbox');
          const relays = allRelays.filter(relay => !unresponsive.includes(relay));
          relayStatuses = Object.fromEntries(relays.map(r => [r, 'pending']));
          relayResults = {};
          const filter = { ids: [id] };
          const fetchPromises = relays.map(relay =>
            fetchEventFromRelay(relay, filter, 3000)
              .then(result => {
                if (result.event) {
                  relayStatuses = { ...relayStatuses, [relay]: 'success' };
                  relayResults = { ...relayResults, [relay]: result.event };
                  if (!event) {
                    event = result.event;
                  }
                } else {
                  relayStatuses = { ...relayStatuses, [relay]: 'timeout' };
                  relayResults = { ...relayResults, [relay]: null };
                }
              })
              .catch(() => {
                relayStatuses = { ...relayStatuses, [relay]: 'error' };
                relayResults = { ...relayResults, [relay]: null };
                unresponsiveRelays.add(relay);
              })
          );
          await Promise.allSettled(fetchPromises);
          console.log('relayResults after fetch:', relayResults);
        }
        console.log('event before if:', event);
        if (event) {
          indexEvent = event;
          console.log('indexEvent set:', indexEvent);
          parser = new Pharos();
          console.log('About to call parser.fetch');
          waitable = parser.fetch(indexEvent);
          console.log('Called parser.fetch, got promise:', waitable);
          waitable.then(() => console.log('parser.fetch resolved')).catch(e => console.error('parser.fetch error', e));
          if (indexEvent.kind === 30023) {
            contentType = 'article';
          } else if (indexEvent.kind === 30818) {
            contentType = 'wiki';
          } else if (indexEvent.kind === 30040) {
            contentType = 'book';
          } else if (indexEvent.kind === 30041) {
            contentType = 'section';
          } else {
            contentType = 'unknown';
          }
        } else if (!errorMsg) {
          errorMsg = 'Event not found';
        }
      })();
    }
  });

  $effect(() => {
    console.log('waitable resolved');
    console.log('showPublication:', showPublication);
    console.log('contentType:', contentType, 'isString:', isString(contentType));
    console.log('indexEvent:', indexEvent);
  });

  $effect(() => {
    if (indexEvent) {
      const client = getNostrClient();
      const publicationTree = new PublicationTree(client, indexEvent);
      setContext('publicationTree', publicationTree);
    }
  });

  onDestroy(() => {
    parser?.reset?.();
  });

  function isString(val: unknown): val is string {
    return typeof val === 'string';
  }
</script>

<svelte:head>
  <!-- Basic meta tags -->
  <title>{title}</title>
  <meta name="description" content={summary} />

  <!-- OpenGraph meta tags -->
  <meta property="og:title" content={title} />
  <meta property="og:description" content={summary} />
  <meta property="og:url" content={data.url?.href ?? ''} />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Alexandria" />
  <meta property="og:image" content={image} />

  <!-- Twitter Card meta tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={summary} />
  <meta name="twitter:image" content={image} />
</svelte:head>

{#if !ready}
  <div class="flex justify-center items-center h-40">
    <span class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900 dark:border-gray-100"></span>
  </div>
{:else if errorMsg}
  <div class="text-red-600">{errorMsg}</div>
{:else if !indexEvent}
  <div>Loading publication...</div>
{:else}
  {#key indexEvent.id}
    {#if showArticleNav && isString(contentType)}
      <ArticleNav
        publicationType={publicationType}
        contentType={contentType}
        rootId={rootId}
        indexEvent={indexEvent}
      />
    {/if}
  {/key}
  <main class="publication {contentType} {publicationType}">
    {#await waitable}
      <div class="flex justify-center items-center h-40">
        <span class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900 dark:border-gray-100"></span>
      </div>
    {:then}
      {#if showPublication && isString(contentType)}
        <Publication
          rootAddress={rootAddress}
          publicationType={publicationType}
          contentType={contentType}
          indexEvent={indexEvent}
        />
      {/if}
    {/await}
  </main>
{/if}
