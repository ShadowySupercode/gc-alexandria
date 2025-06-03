<script lang="ts">
  import { onDestroy } from 'svelte';
  import { userHydrated } from '$lib/stores/userStore';
  import { blockedRelaysHydrated } from '$lib/stores/relayStore';
  import { selectRelayGroup } from '$lib/utils/relayGroupUtils';
  import { searchEventByIdentifier } from '$lib/utils/identifierUtils';
  import { fetchEventWithFallback, fetchEventFromRelay } from '$lib/utils/relayUtils';
  import Publication from '$lib/components/Publication.svelte';
  import Processor from 'asciidoctor';
  import ArticleNav from "$components/util/ArticleNav.svelte";
  import { getTagAddress, getTagValue } from '$lib/utils/eventUtils';
  import type { NostrEvent } from '$lib/types/nostr';
  import RelayDisplay from '$lib/components/RelayDisplay.svelte';
  import { unresponsiveRelays } from '$lib/stores/unresponsiveRelaysStore';

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

  $effect(() => {
    if (ready && (data.id || data.dTag)) {
      (async () => {
        const allRelays = selectRelayGroup('inbox');
        const relays = allRelays.filter(
          relay => !unresponsive.includes(relay)
        );
        relayStatuses = Object.fromEntries(relays.map(r => [r, 'pending']));
        relayResults = {};
        indexEvent = null;
        errorMsg = '';
        parser = null;

        const filter = data.id
          ? { ids: [data.id] }
          : data.dTag
            ? { '#d': [data.dTag] }
            : {};

        const fetchPromises = relays.map(relay =>
          fetchEventFromRelay(relay, filter, 3000)
            .then(result => {
              if (result.event) {
                relayStatuses = { ...relayStatuses, [relay]: 'success' };
                relayResults = { ...relayResults, [relay]: result.event };
                if (!indexEvent) {
                  indexEvent = result.event;
                  parser = Processor();
                  waitable = parser.fetch(indexEvent);
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
        if (!indexEvent) {
          errorMsg = 'Event not found';
        }
      })();
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
  <div class="mb-4">
    <h3 class="font-semibold mb-2">Relay Status</h3>
    <div class="flex flex-wrap gap-2">
      {#each Object.entries(relayStatuses) as [relay, status]}
        <RelayDisplay
          {relay}
          showStatus={true}
          status={status === 'success' ? 'found' : status}
          timing={undefined}
        />
      {/each}
    </div>
  </div>
{/if}
