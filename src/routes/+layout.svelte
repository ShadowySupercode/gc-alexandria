<script lang="ts">
  import { Buffer } from 'buffer';

  if (typeof global === 'undefined' && typeof window !== 'undefined') {
    // @ts-ignore
    window.global = window;
  }

  if (typeof window !== 'undefined') {
    // @ts-ignore
    window.Buffer = Buffer;
  }

  import "../app.css";
  import Navigation from "$lib/components/Navigation.svelte";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { logCurrentRelays } from '$lib/utils/relayLog';
  import { userStore, userHydrated } from '$lib/stores/userStore';
  import { fetchBlockedRelays, blockedRelaysHydrated } from '$lib/stores/relayStore';
  import { get } from 'svelte/store';

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
    logCurrentRelays('page open');

    // Hydrate user store with timeout
    if (!get(userHydrated)) {
      let hydrated = false;
      const unsub = userHydrated.subscribe(val => {
        if (val) {
          hydrated = true;
          unsub();
        }
      });
      setTimeout(() => {
        if (!hydrated) {
          userHydrated.set(true);
          unsub();
        }
      }, 3000);
    }

    // Hydrate blocked relays with timeout
    let relaysHydrated = false;
    const unsubRelays = blockedRelaysHydrated.subscribe(val => {
      if (val) {
        relaysHydrated = true;
        unsubRelays();
      }
    });
    const user = get(userStore);
    if (user && user.pubkey) {
      fetchBlockedRelays(user.pubkey);
    } else {
      // If no user, just set hydrated to true after timeout
      setTimeout(() => {
        if (!relaysHydrated) {
          blockedRelaysHydrated.set(true);
          unsubRelays();
        }
      }, 3000);
    }
    // Also set a timeout in case fetchBlockedRelays hangs
    setTimeout(() => {
      if (!relaysHydrated) {
        blockedRelaysHydrated.set(true);
        unsubRelays();
      }
    }, 3000);
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

<div class={"leather mt-[76px] h-full w-full flex flex-col items-center"}>
  <Navigation class="fixed top-0" />
  <slot />
</div>
