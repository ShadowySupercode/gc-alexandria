<script lang="ts">
  import { browser } from "$app/environment";
  import type { LayoutProps } from "./$types";

  let { data, children }: LayoutProps = $props();
  
  // AI-NOTE: Use metadata from server-side load for SEO and social sharing
  const { metadata } = data;
</script>

<!-- TODO: Provide fallback metadata values to use if the publication is on an auth-to-read relay. -->
<svelte:head>
  <!-- Basic meta tags -->
  <title>{metadata.title}</title>
  <meta name="description" content={metadata.summary} />

  <!-- OpenGraph meta tags -->
  <meta property="og:title" content={metadata.title} />
  <meta property="og:description" content={metadata.summary} />
  <meta property="og:url" content={metadata.currentUrl} />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Alexandria" />
  <meta property="og:image" content={metadata.image} />

  <!-- Twitter Card meta tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={metadata.title} />
  <meta name="twitter:description" content={metadata.summary} />
  <meta name="twitter:image" content={metadata.image} />
</svelte:head>

{#if browser}
  {@render children()}
{/if}
