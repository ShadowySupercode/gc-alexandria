<script lang="ts">
  import "../app.css";
  import Navigation from "$lib/components/Navigation.svelte";
  import { onMount, setContext } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { cleanupNdk, getPersistedLogin } from "$lib/ndk";
  import { userStore, loginMethodStorageKey } from "$lib/stores/userStore";
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

    // AI-NOTE:  Restore authentication state from localStorage on page load
    // This function automatically restores the user's login state when the page is refreshed,
    // preventing the user from being logged out unexpectedly. It handles extension, npub, and Amber logins.
    async function restoreAuthentication() {
      try {
        // Check if user was previously logged in
        const persistedPubkey = getPersistedLogin();
        const loginMethod = localStorage.getItem(loginMethodStorageKey);
        const logoutFlag = localStorage.getItem("alexandria/logout/flag");
        
        console.log("Layout: Checking for persisted authentication...");
        console.log("Layout: Persisted pubkey:", persistedPubkey);
        console.log("Layout: Login method:", loginMethod);
        console.log("Layout: Logout flag:", logoutFlag);
        
        // If there's a logout flag, don't restore authentication
        if (logoutFlag === "true") {
          console.log("Layout: Logout flag found, skipping authentication restoration");
          localStorage.removeItem("alexandria/logout/flag");
          return;
        }
        
        // If we have a persisted pubkey and login method, restore the session
        if (persistedPubkey && loginMethod) {
          console.log("Layout: Found persisted authentication, attempting to restore...");
          
          const currentUserState = $userStore;
          
          // Only restore if not already signed in
          if (!currentUserState.signedIn) {
            console.log("Layout: User not currently signed in, restoring authentication...");
            
            if (loginMethod === "extension") {
              // For extension login, we need to check if the extension is available
              if (typeof window !== "undefined" && window.nostr) {
                try {
                  console.log("Layout: Attempting to restore extension login...");
                  // Import the login function dynamically to avoid circular dependencies
                  const { loginWithExtension } = await import("$lib/stores/userStore");
                  await loginWithExtension(data.ndk);
                  console.log("Layout: Extension login restored successfully");
                } catch (error) {
                  console.warn("Layout: Failed to restore extension login:", error);
                  // Clear the persisted login if restoration fails
                  localStorage.removeItem("alexandria/login/pubkey");
                  localStorage.removeItem(loginMethodStorageKey);
                }
              } else {
                console.log("Layout: Extension not available, clearing persisted login");
                localStorage.removeItem("alexandria/login/pubkey");
                localStorage.removeItem(loginMethodStorageKey);
              }
            } else if (loginMethod === "npub") {
              // For npub login, we can restore it directly
              try {
                console.log("Layout: Attempting to restore npub login...");
                const { loginWithNpub } = await import("$lib/stores/userStore");
                await loginWithNpub(persistedPubkey, data.ndk);
                console.log("Layout: npub login restored successfully");
              } catch (error) {
                console.warn("Layout: Failed to restore npub login:", error);
                localStorage.removeItem("alexandria/login/pubkey");
                localStorage.removeItem(loginMethodStorageKey);
              }
            } else if (loginMethod === "amber") {
              // For Amber login, we can't automatically restore due to the QR code requirement
              // Set a flag to show the fallback modal
              console.log("Layout: Amber login detected, setting fallback flag");
              localStorage.setItem("alexandria/amber/fallback", "1");
            }
          } else {
            console.log("Layout: User already signed in, skipping restoration");
          }
        } else {
          console.log("Layout: No persisted authentication found");
        }
      } catch (error) {
        console.error("Layout: Error during authentication restoration:", error);
      }
    }
    
    // Restore authentication on mount
    restoreAuthentication();

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

<div class={"leather mt-[120px] w-full mx-auto flex flex-col items-center"}>
  <Navigation class="fixed top-0" />
  {@render children()}
</div>
