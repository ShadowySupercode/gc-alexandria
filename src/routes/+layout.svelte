<script lang="ts">
  import "../app.css";
  import Navigation from "$lib/components/Navigation.svelte";
  import { onMount, setContext } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { cleanupNdk } from "$lib/ndk";
  import type { LayoutProps } from "./$types";

  // Define children prop for Svelte 5
  let { data, children }: LayoutProps = $props();

  setContext("ndk", data.ndk);

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

    // AI-NOTE: Global click handler for wikilinks and hashtags to avoid breaking amber session
    function handleInternalLinkClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      
      // Handle wikilinks
      if (target.tagName === "A" && target.classList.contains("wikilink")) {
        const href = (target as HTMLAnchorElement).getAttribute("href");
        if (href && href.startsWith("/")) {
          event.preventDefault();
          goto(href);
        }
      }
      
      // Handle hashtag buttons
      if (target.tagName === "BUTTON" && target.classList.contains("cursor-pointer")) {
        const onclick = target.getAttribute("onclick");
        if (onclick && onclick.includes("window.location.href")) {
          event.preventDefault();
          // Extract the URL from the onclick handler
          const match = onclick.match(/window\.location\.href='([^']+)'/);
          if (match && match[1]) {
            goto(match[1]);
          }
        }
      }
      
      // Handle notification links (divs with onclick handlers)
      if (target.tagName === "DIV" && target.classList.contains("cursor-pointer")) {
        const onclick = target.getAttribute("onclick");
        if (onclick && onclick.includes("window.location.href")) {
          event.preventDefault();
          // Extract the URL from the onclick handler
          const match = onclick.match(/window\.location\.href='([^']+)'/);
          if (match && match[1]) {
            goto(match[1]);
          }
        }
      }
    }
    
    document.addEventListener("click", handleInternalLinkClick);
    
    // Cleanup function to prevent memory leaks
    return () => {
      document.removeEventListener("click", handleInternalLinkClick);
      // Clean up NDK resources when component unmounts
      cleanupNdk();
    };
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
  {@render children()}
</div>
