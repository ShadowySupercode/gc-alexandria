<script lang="ts">
  import { browser } from "$app/environment";
  import type { LayoutProps } from "./$types";

  let { data, children }: LayoutProps = $props();
  
  // AI-NOTE: Use metadata from server-side load for SEO and social sharing
  const { metadata } = data;
  
  // Type assertion for optional metadata properties
  const meta = metadata as typeof metadata & { 
    title?: string; 
    summary?: string; 
    image?: string; 
  };
</script>

<!-- TODO: Provide fallback metadata values to use if the publication is on an auth-to-read relay. -->
<svelte:head>
  <!-- Basic meta tags -->
  <title>{meta.title || "Alexandria - Nostr Publications"}</title>
  <meta name="description" content={meta.summary || "Read and discover long-form content on Nostr"} />

  <!-- OpenGraph meta tags -->
  <meta property="og:title" content={meta.title || "Alexandria - Nostr Publications"} />
  <meta property="og:description" content={meta.summary || "Read and discover long-form content on Nostr"} />
  <meta property="og:url" content={meta.currentUrl} />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Alexandria" />
  {#if meta.image}
    <meta property="og:image" content={meta.image} />
  {/if}

  <!-- Twitter Card meta tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={meta.title || "Alexandria - Nostr Publications"} />
  <meta name="twitter:description" content={meta.summary || "Read and discover long-form content on Nostr"} />
  {#if meta.image}
    <meta name="twitter:image" content={meta.image} />
  {/if}
</svelte:head>

{@render children()}