<script>
  import "../app.css";
  import Navigation from "$lib/components/Navigation.svelte";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { Alert } from "flowbite-svelte";
  import { HammerSolid } from "flowbite-svelte-icons";
  import { logCurrentRelayConfiguration } from "$lib/ndk";

  // Get standard metadata for OpenGraph tags
  let title = "Library of Alexandria";
  let currentUrl = $page.url.href;

  // Get default image and summary for the Alexandria website
  let image = "/screenshots/old_books.jpg";
  let summary =
    "Alexandria is a digital library, utilizing Nostr events for curated publications and wiki pages.";

  onMount(() => {
    const rect = document.body.getBoundingClientRect();
    // document.body.style.height = `${rect.height}px`;
    
    // Log relay configuration when layout mounts
    logCurrentRelayConfiguration();
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
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Alexandria" />
  <meta property="og:image" content={image} />

  <!-- Twitter Card meta tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={summary} />
  <meta name="twitter:image" content={image} />
</svelte:head>

<div class={"leather mt-[76px] w-full mx-auto flex flex-col items-center"}>
  <Navigation class="fixed top-0" />
  <slot />
</div>
