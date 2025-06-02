<script lang="ts">
  import Publication from "$lib/components/Publication.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import { onDestroy, onMount, setContext } from "svelte";
  import { PublicationTree } from "$lib/data_structures/publication_tree";
  import Processor from "asciidoctor";
  import ArticleNav from "$components/util/ArticleNav.svelte";
  import { getTagAddress, getTagValue } from '$lib/utils/eventUtils';
  import type { NostrEvent } from '$lib/types/nostr';

  let {
    data,
  }: {
    data: {
      indexEvent: NostrEvent;
      ndk: any;
      parser: any;
      url: URL;
      publicationType: string;
      waitable: Promise<any>;
    };
  } = $props();

  const publicationTree = new PublicationTree(data.indexEvent);
  setContext("publicationTree", publicationTree);
  setContext("asciidoctor", Processor());

  onMount(async () => {
    await publicationTree.updateFromRelay(data.ndk);
  });

  let title = $derived.by(() =>
    getTagValue(data.indexEvent, "title") ||
    data.parser?.getIndexTitle(data.parser?.getRootIndexId()) ||
    "Alexandria Publication"
  );

  let image = $derived.by(() =>
    getTagValue(data.indexEvent, "image") ||
    "/screenshots/old_books.jpg"
  );

  let summary = $derived.by(() =>
    getTagValue(data.indexEvent, "summary") ||
    "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages."
  );

  const rootId = data.parser.getRootIndexId();
  const rootAddress = getTagAddress(data.indexEvent);
  const currentUrl = data.url?.href ?? "";
  const showArticleNav = typeof rootId === 'string';
  const showPublication = typeof rootAddress === 'string';

  function isString(val: unknown): val is string {
    return typeof val === 'string';
  }

  onDestroy(() => {
    data.parser.reset();
    publicationTree.cleanup();
  });
</script>

<svelte:head>
  <!-- Basic meta tags -->
  <title>{title}</title>
  <meta name="description" content={summary} />

  <!-- OpenGraph meta tags -->
  <meta property="og:title" content={title} />
  <meta property="og:description" content={summary} />
  <meta property="og:url" content={currentUrl} />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Alexandria" />
  <meta property="og:image" content={image} />

  <!-- Twitter Card meta tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={summary} />
  <meta name="twitter:image" content={image} />
</svelte:head>

{#key data}
  {#if showArticleNav && isString(data.publicationType)}
    <ArticleNav
      publicationType={data.publicationType}
      rootId={rootId}
      indexEvent={data.indexEvent}
    />
  {/if}
{/key}

<main class="publication {data.publicationType}">
  {#await data.waitable}
    <TextPlaceholder divClass="skeleton-leather w-full" size="xxl" />
  {:then}
    {#if showPublication && isString(data.publicationType)}
      <Publication
        rootAddress={rootAddress}
        publicationType={data.publicationType}
        indexEvent={data.indexEvent}
      />
    {/if}
  {/await}
</main>
