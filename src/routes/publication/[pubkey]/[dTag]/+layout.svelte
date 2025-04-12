<script lang='ts'>
  import type { LayoutProps } from './$types';
  
  let { data, children }: LayoutProps = $props();

  const { event, url } = data;

  let title = $derived.by(async () => {
    const titleTag = event?.getMatchingTags('title')[0]?.[1];
    return titleTag || 'Alexandria';
  });
  let image = $derived.by(async () => {
    const imageTag = event?.getMatchingTags('image')[0]?.[1];
    return imageTag || null;
  });
  let summary = $derived.by(async () => {
    const summaryTag = event?.getMatchingTags('summary')[0]?.[1];
    const titleTag = await title;
    return summaryTag || titleTag;
  });
</script>

<svelte:head>
  {#await Promise.all([title, summary, image]) then [title, summary, image]}
    <!-- Basic meta tags -->
    <title>{title}</title>
    <meta name="description" content="{summary}" />
    
    <!-- OpenGraph meta tags -->
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{summary}" />
    <meta property="og:url" content="{url.toString()}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Alexandria" />
    {#if image}
    <meta property="og:image" content="{image}" />
    {/if}
    
    <!-- Twitter Card meta tags -->
    <meta name="twitter:card" content="{image ? 'summary_large_image' : 'summary'}" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="{summary}" />
    {#if image}
    <meta name="twitter:image" content="{image}" />
    {/if}
  {/await}
</svelte:head>

<main>
  {@render children()}
</main>
