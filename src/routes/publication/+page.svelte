<script lang="ts">
  import Publication from "$lib/components/Publication.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import type { PageProps } from "./$types";
  import { onDestroy, setContext } from "svelte";
  import { PublicationTree } from "$lib/data_structures/publication_tree";
  import Processor from "asciidoctor";
  import ArticleNav from "$components/util/ArticleNav.svelte";

  let { data }: PageProps = $props();

  const publicationTree = new PublicationTree(data.indexEvent, data.ndk);

  setContext("publicationTree", publicationTree);
  setContext("asciidoctor", Processor());

  // Get publication metadata for OpenGraph tags
  let title = $derived(
    data.indexEvent?.getMatchingTags("title")[0]?.[1] ||
      data.parser?.getIndexTitle(data.parser?.getRootIndexId()) ||
      "Alexandria Publication",
  );
  let currentUrl = data.url?.href ?? "";

  // Get image and summary from the event tags if available
  // If image unavailable, use the Alexandria default pic.
  let image = $derived(
    data.indexEvent?.getMatchingTags("image")[0]?.[1] ||
      "/screenshots/old_books.jpg",
  );
  let summary = $derived(
    data.indexEvent?.getMatchingTags("summary")[0]?.[1] ||
      "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages.",
  );

  onDestroy(() => data.parser.reset());
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
  <ArticleNav
    publicationType={data.publicationType}
    rootId={data.parser.getRootIndexId()}
    indexEvent={data.indexEvent}
  />
{/key}

<main class="publication {data.publicationType}">
  {#await data.waitable}
    <TextPlaceholder divClass="skeleton-leather w-full" size="xxl" />
  {:then}
    <Publication
      rootAddress={data.indexEvent.tagAddress()}
      publicationType={data.publicationType}
      indexEvent={data.indexEvent}
    />
  {/await}
</main>
