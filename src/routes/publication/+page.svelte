<script lang="ts">
  import Article from "$lib/components/Publication.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import type { PageData } from "./$types";
  import { onDestroy } from "svelte";
  import ArticleNav from "$components/util/ArticleNav.svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { pharosInstance } from "$lib/parser";
  import { page } from "$app/stores";

  // Extend the PageData type with the properties we need
  interface ExtendedPageData extends PageData {
    waitable: Promise<any>;
    publicationType: string;
    indexEvent: NDKEvent;
    parser: any;
  }

  let { data } = $props<{ data: ExtendedPageData }>();

  // Get publication metadata for OpenGraph tags
  let title = $derived(data.indexEvent?.getMatchingTags('title')[0]?.[1] || data.parser?.getIndexTitle(data.parser?.getRootIndexId()) || 'Alexandria Publication');
  let currentUrl = $page.url.href;
  
  // Get image and summary from the event tags if available
  // If image unavailable, use the Alexandria default pic.
  let image = $derived(data.indexEvent?.getMatchingTags('image')[0]?.[1] || '/screenshots/old_books.jpg');
  let summary = $derived(data.indexEvent?.getMatchingTags('summary')[0]?.[1] || 'Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages.');

  onDestroy(() => data.parser.reset());
</script>

<svelte:head>
  <!-- Basic meta tags -->
  <title>{title}</title>
  <meta name="description" content="{summary}" />
  
  <!-- OpenGraph meta tags -->
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{summary}" />
  <meta property="og:url" content="{currentUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Alexandria" />
  <meta property="og:image" content="{image}" />
  
  <!-- Twitter Card meta tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{summary}" />
  <meta name="twitter:image" content="{image}" />
</svelte:head>

{#key data}
  <ArticleNav publicationType={data.publicationType} rootId={data.parser.getRootIndexId()} indexEvent={data.indexEvent} />
{/key}

<main class="publication {data.publicationType}">
  {#await data.waitable}
    <TextPlaceholder divClass='skeleton-leather w-full' size="xxl" />
  {:then}
  <Article 
      rootId={data.parser.getRootIndexId()} 
      publicationType={data.publicationType} 
      indexEvent={data.indexEvent} 
    />
  {/await}
</main>
