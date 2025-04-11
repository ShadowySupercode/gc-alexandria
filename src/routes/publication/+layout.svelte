<script lang='ts'>
    import { indexKind } from '$lib/consts';
  import type { LayoutProps } from './$types';
  import { fetchEventSafely } from '$lib/utils';
  
  let { data, children }: LayoutProps = $props();

  const { ndk, url, pubkey, tag } = data;

  // Michael J 11 April 2025 - For best performance, we should explore moving this initial fetch
  // to a server-side load function.  We should respect the user's relay selection when loading,
  // so moving this server-side would require us to provide the user's relay list to the server.
  let indexEvent = $derived.by(async () => {
    if (!pubkey) return null;
    
    const event = await fetchEventSafely(ndk, {
      kinds: [indexKind],
      authors: [pubkey],
      '#d': [tag],
    });
    
    return event;
  });

  let title = $derived.by(async () => {
    const titleTag = (await indexEvent)?.getMatchingTags('title')[0]?.[1];
    return titleTag || 'Alexandria Publication';
  });
  let image = $derived.by(async () => {
    const imageTag = (await indexEvent)?.getMatchingTags('image')[0]?.[1];
    return imageTag || null;
  });
  let summary = $derived.by(async () => {
    const summaryTag = (await indexEvent)?.getMatchingTags('summary')[0]?.[1];
    const titleTag = await title;
    return summaryTag || `Alexandria Publication ${titleTag}`;
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
